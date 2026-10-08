import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { randomUUID, randomInt } from 'crypto';
import { StorageService } from '../files/storage.service';
import { validateUpload } from '../files/sniff';
import { pingClamd, scanDisabled } from '../files/clamav';
import { PrismaService } from '../prisma/prisma.service';
import { rateLimit } from '../common/rate-limit';
import { NotificationsService } from '../notifications/notifications.service';
import { RecruitmentsService } from '../recruitments/recruitments.service';
import { RealtimeService } from '../realtime/realtime.service';
import { RedisService } from '../common/redis.service';
import { sha256 } from '../common/crypto';

/** Environnement candidat isolé : aucune authentification, uniquement le token opaque du recrutement. */
@Controller('public/r')
export class PublicController {
  constructor(
    private db: PrismaService,
    private storage: StorageService,
    private rt: RealtimeService,
    private notif: NotificationsService,
    private assets: RecruitmentsService,
    private redis: RedisService,
  ) {}

  private async getRecruitment(publicToken: string) {
    const r = await this.db.recruitment.findUnique({
      where: { publicToken },
      include: { sections: { orderBy: { position: 'asc' }, include: { fields: { orderBy: { position: 'asc' }, include: { options: { orderBy: { position: 'asc' } }, conditions: true } } } } },
    });
    if (!r || r.status !== 'ACTIVE') throw new NotFoundException('Ce recrutement n\'est pas disponible.');
    return r;
  }

  private ensureOpen(r: { startsAt: Date | null; endsAt: Date | null }) {
    const now = new Date();
    if (r.startsAt && r.startsAt > now) {
      const dt = r.startsAt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
      throw new BadRequestException(`Les candidatures ne sont pas encore ouvertes. Elles débuteront le ${dt}.`);
    }
    if (r.endsAt && r.endsAt < now) {
      const dt = r.endsAt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
      throw new BadRequestException(`La période de candidature a pris fin le ${dt}.`);
    }
  }

  @Get(':token') async view(@Param('token') t: string) {
    const r = await this.getRecruitment(t);
    const now = new Date();
    const isUpcoming = Boolean(r.startsAt && r.startsAt > now);
    const isExpired = Boolean(r.endsAt && r.endsAt < now);
    const assets = await this.assets.urls(r);
    return {
      title: r.title,
      description: r.description,
      ...assets,
      startsAt: r.startsAt,
      endsAt: r.endsAt,
      isUpcoming,
      isExpired,
      sections: r.sections,
    };
  }

  @Post(':token/upload')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 1 } }))
  async upload(@Req() req: any, @Param('token') t: string, @Body('fieldKey') fieldKey: string, @UploadedFile() file?: { buffer: Buffer; originalname: string }) {
    await rateLimit('upload:' + req.ip, 30, 10 * 60_000);
    const r = await this.getRecruitment(t);
    this.ensureOpen(r);
    const f = r.sections.flatMap((s: any) => s.fields).find((x: any) => x.key === fieldKey && (x.type === 'file' || x.type === 'image'));
    if (!f || !file) throw new BadRequestException('Champ ou fichier invalide');
    let sniffed;
    try { sniffed = validateUpload(file.buffer, file.originalname, f.type, f.config); } catch (e: any) { throw new BadRequestException(e.message); }
    const id = randomUUID(); const key = `uploads/${r.id}/${id}`;
    await this.storage.put(key, file.buffer, sniffed.mime);
    // Antivirus : si ClamAV est absent/injoignable, la validation stricte de signature binaire (sniffing) suffit pour passer CLEAN
    const isClamAvOnline = await pingClamd({ host: process.env.CLAMAV_HOST ?? 'localhost', port: Number(process.env.CLAMAV_PORT) || 3310, timeoutMs: 1000 }).catch(() => false);
    const scanStatus = scanDisabled() || !isClamAvOnline ? 'CLEAN' : 'PENDING';
    const name = file.originalname.replace(/[^\w.\- ()]/g, '_').slice(0, 120);
    await this.db.pendingUpload.create({ data: { id, recruitmentId: r.id, fieldKey, name, storageKey: key, mime: sniffed.mime, size: file.buffer.length, scanStatus } });
    return { id, name };
  }

  @Post(':token/apply')
  async apply(@Req() req: any, @Param('token') t: string, @Body() body: { answers?: Record<string, unknown>; deviceId?: string }) {
    const r = await this.getRecruitment(t);
    this.ensureOpen(r);

    // Règle stricte : le même appareil ne doit pas pouvoir soumettre plus de deux fois par recrutement
    const devId = (req.headers['x-device-id'] as string) || body?.deviceId || sha256(req.ip + (req.headers['user-agent'] || ''));
    const limitKey = `device_apps:${r.id}:${devId}`;
    const submissionCount = Number((await this.redis.get(limitKey)) || 0);
    if (submissionCount >= 2) {
      throw new BadRequestException('Cet appareil a déjà soumis le nombre maximal de deux (2) candidatures autorisé pour ce recrutement.');
    }

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
        // Incrémenter le compteur de soumission pour cet appareil
        await this.redis.set(limitKey, String(submissionCount + 1), 90 * 86400); // Mémorisé 90 jours
        await this.notif.newApplication(r.orgId, r.id, r.title, reference).catch(() => undefined); // best-effort
        this.rt.publish(r.orgId, { type: 'application.new', recruitmentId: r.id, applicationId: created.id, reference, submittedAt: created.submittedAt.toISOString() });
        return { reference };
      } catch (e: any) { if (e?.code !== 'P2002') throw e; } // collision de référence : on retente
    }
    throw new BadRequestException('Réessayez');
  }

  @Get('files/:key(*)')
  async getFile(@Param('key') key: string, @Query('name') name: string, @Query('inline') inline: string, @Res() res: any) {
    try {
      const decodedKey = decodeURIComponent(key);
      const buf = await this.storage.get(decodedKey);
      const fileName = name || 'document';
      const isInline = inline === '1';
      res.setHeader('Content-Disposition', `${isInline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(fileName)}`);
      if (fileName.endsWith('.pdf')) res.setHeader('Content-Type', 'application/pdf');
      else if (fileName.match(/\.(jpg|jpeg)$/i)) res.setHeader('Content-Type', 'image/jpeg');
      else if (fileName.endsWith('.png')) res.setHeader('Content-Type', 'image/png');
      else if (fileName.endsWith('.webp')) res.setHeader('Content-Type', 'image/webp');
      else res.setHeader('Content-Type', 'application/octet-stream');
      res.send(buf);
    } catch {
      throw new NotFoundException('Fichier introuvable');
    }
  }
}
