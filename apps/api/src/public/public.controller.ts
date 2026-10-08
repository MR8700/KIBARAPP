import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { randomUUID } from 'crypto';
import { StorageService } from '../files/storage.service';
import { validateUpload } from '../files/sniff';
import { scanDisabled } from '../files/clamav';
import { randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { rateLimit } from '../common/rate-limit';
import { NotificationsService } from '../notifications/notifications.service';
import { RecruitmentsService } from '../recruitments/recruitments.service';
import { RealtimeService } from '../realtime/realtime.service';

/** Environnement candidat isolé : aucune authentification, uniquement le token opaque du recrutement. */
@Controller('public/r')
export class PublicController {
  constructor(private db: PrismaService, private storage: StorageService, private rt: RealtimeService, private notif: NotificationsService, private assets: RecruitmentsService) {}

  private async active(publicToken: string) {
    const r = await this.db.recruitment.findUnique({
      where: { publicToken },
      include: { sections: { orderBy: { position: 'asc' }, include: { fields: { orderBy: { position: 'asc' }, include: { options: { orderBy: { position: 'asc' } }, conditions: true } } } } },
    });
    const now = new Date();
    if (!r || r.status !== 'ACTIVE' || (r.startsAt && r.startsAt > now) || (r.endsAt && r.endsAt < now)) throw new NotFoundException();
    return r;
  }

  @Get(':token') async view(@Param('token') t: string) {
    const r = await this.active(t);
    const assets = await this.assets.urls(r);
    return { title: r.title, description: r.description, ...assets, endsAt: r.endsAt, sections: r.sections };
  }

  @Post(':token/upload')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 1 } }))
  async upload(@Req() req: any, @Param('token') t: string, @Body('fieldKey') fieldKey: string, @UploadedFile() file?: { buffer: Buffer; originalname: string }) {
    await rateLimit('upload:' + req.ip, 30, 10 * 60_000);
    const r = await this.active(t);
    const f = r.sections.flatMap((s: any) => s.fields).find((x: any) => x.key === fieldKey && (x.type === 'file' || x.type === 'image'));
    if (!f || !file) throw new BadRequestException('Champ ou fichier invalide');
    let sniffed;
    try { sniffed = validateUpload(file.buffer, file.originalname, f.type, f.config); } catch (e: any) { throw new BadRequestException(e.message); }
    const id = randomUUID(); const key = `uploads/${r.id}/${id}`;
    await this.storage.put(key, file.buffer, sniffed.mime);
    // Antivirus : en production un worker (ClamAV) passe PENDING -> CLEAN/INFECTED ; SCAN_DISABLED est réservé au développement.
    const scanStatus = scanDisabled() ? 'CLEAN' : 'PENDING';
    const name = file.originalname.replace(/[^\w.\- ()]/g, '_').slice(0, 120);
    await this.db.pendingUpload.create({ data: { id, recruitmentId: r.id, fieldKey, name, storageKey: key, mime: sniffed.mime, size: file.buffer.length, scanStatus } });
    return { id, name };
  }

  @Post(':token/apply')
  async apply(@Req() req: any, @Param('token') t: string, @Body() body: { answers?: Record<string, unknown> }) {
    await rateLimit('apply:' + req.ip + t, 5, 10 * 60_000);
    const r = await this.active(t);
    const answers = body?.answers ?? {};
    const fields = r.sections.flatMap((s) => s.fields);
    const isFile = (f: { type: string }) => f.type === 'file' || f.type === 'image';
    const visible = (f: (typeof fields)[number]) => f.conditions.every((c) => {
      const v = answers[c.dependsOnKey];
      return c.operator === 'eq' ? v === c.value : c.operator === 'neq' ? v !== c.value : Array.isArray(c.value) && (c.value as unknown[]).includes(v);
    });
    const ids = (f: { key: string }) => ([] as unknown[]).concat(answers[f.key] ?? []).filter((x): x is string => typeof x === 'string');
    const missing = fields.filter((f) => f.required && visible(f) && (isFile(f) ? ids(f).length === 0
      : answers[f.key] === undefined || answers[f.key] === '' || answers[f.key] === null));
    if (missing.length) throw new BadRequestException({ message: 'Champs requis manquants', fields: missing.map((f) => f.key) });

    // Fichiers : chaque id doit être un upload en attente de CE recrutement, pour CE champ, et sain.
    const fileFields = fields.filter((f) => isFile(f) && visible(f) && ids(f).length);
    const pending = await this.db.pendingUpload.findMany({ where: { id: { in: fileFields.flatMap(ids) }, recruitmentId: r.id } });
    for (const f of fileFields) {
      const max = Number((f.config as any)?.maxCount) || ((f.config as any)?.multiple ? 5 : 1);
      const mine = ids(f);
      if (mine.length > max || mine.some((id) => !pending.find((p) => p.id === id && p.fieldKey === f.key && !['INFECTED', 'FAILED'].includes(p.scanStatus))))
        throw new BadRequestException(`Fichiers invalides pour « ${f.label} »`);
    }
    const rows = fields.filter((f) => !isFile(f) && answers[f.key] !== undefined && visible(f));
    const used = fileFields.flatMap(ids);

    for (let i = 0; i < 5; i++) {
      const reference = `CAND-${new Date().getFullYear()}-${String(randomInt(0, 1_000_000)).padStart(6, '0')}`;
      try {
        const [created] = await this.db.$transaction([
          this.db.application.create({
            data: {
              recruitmentId: r.id, reference,
              answers: { create: rows.map((f) => ({ fieldId: f.id, value: answers[f.key] as any })) },
              files: { create: pending.filter((p) => used.includes(p.id)).map((p) => ({ fieldKey: p.fieldKey, name: p.name, storageKey: p.storageKey, mime: p.mime, size: p.size, scanStatus: p.scanStatus })) },
              history: { create: { status: 'NEW' } },
            },
          }),
          this.db.pendingUpload.deleteMany({ where: { id: { in: used } } }),
        ]);
        await this.notif.newApplication(r.orgId, r.id, r.title, reference).catch(() => undefined); // best-effort : ne bloque jamais la candidature
        this.rt.publish(r.orgId, { type: 'application.new', recruitmentId: r.id, applicationId: created.id, reference, submittedAt: created.submittedAt.toISOString() });
        return { reference };
      } catch (e: any) { if (e?.code !== 'P2002') throw e; } // collision de référence : on retente
    }
    throw new BadRequestException('Réessayez');
  }
}
