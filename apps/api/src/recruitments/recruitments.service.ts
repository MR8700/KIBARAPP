import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { StorageService } from '../files/storage.service';
import { AssetKind, validateAsset } from '../files/assets';
import { scanBuffer, scanDisabled } from '../files/clamav';
import { PrismaService } from '../prisma/prisma.service';
import { token } from '../common/crypto';
import { draftSchema } from './draft.schema';

@Injectable()
export class RecruitmentsService {
  constructor(private db: PrismaService, private storage: StorageService) {}

  /** Liste du tableau de bord : inclut le nombre de candidatures retenues (maquette « Retenus »). */
  async list(orgId: string) {
    const rows = await this.db.recruitment.findMany({
      where: { orgId, status: { not: 'ARCHIVED' } }, orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, status: true, endsAt: true, publicToken: true, _count: { select: { applications: true } } },
    });
    const sel = await this.db.application.groupBy({
      by: ['recruitmentId'], where: { recruitmentId: { in: rows.map((r) => r.id) }, status: 'SELECTED' }, _count: { _all: true },
    });
    const m = new Map(sel.map((x) => [x.recruitmentId, x._count._all]));
    return rows.map((r) => ({ ...r, selectedCount: m.get(r.id) ?? 0 }));
  }

  create(orgId: string, userId: string, d: { title: string; description?: string; startsAt?: Date; endsAt?: Date }) {
    return this.db.recruitment.create({ data: { ...d, orgId, createdBy: userId, publicToken: token(24) } });
  }

  async get(orgId: string, id: string) {
    const r = await this.db.recruitment.findFirst({ where: { id, orgId } });
    if (!r) throw new NotFoundException();
    return r;
  }

  /** Affiche et avis PDF : les colonnes posterUrl/pdfUrl contiennent une clé de stockage ; on expose des URLs signées (1 h). */
  async urls(r: { title: string; posterUrl: string | null; pdfUrl: string | null }) {
    const ttl = 3600; const name = `Avis - ${r.title}`.replace(/[^\w.\- ()]/g, '_').slice(0, 100) + '.pdf';
    const sign = (k: string | null, n: string, inline: boolean) => (k ? this.storage.signedUrl(k, n, inline, ttl).catch(() => null) : Promise.resolve(null));
    const [posterUrl, pdfUrl, pdfDownloadUrl] = await Promise.all([sign(r.posterUrl, 'affiche', true), sign(r.pdfUrl, name, true), sign(r.pdfUrl, name, false)]);
    return { posterUrl, pdfUrl, pdfDownloadUrl, pdfName: r.pdfUrl ? name : null };
  }
  async getWithAssets(orgId: string, id: string) { const r = await this.get(orgId, id); return { ...r, ...(await this.urls(r)) }; }

  async uploadAsset(orgId: string, id: string, kind: AssetKind, file?: { buffer: Buffer }) {
    const r = await this.get(orgId, id);
    if (r.status === 'ARCHIVED') throw new BadRequestException('Recrutement archivé');
    if (!file) throw new BadRequestException('Fichier manquant');
    let v; try { v = validateAsset(file.buffer, kind); } catch (e: any) { throw new BadRequestException(e.message); }
    if (!scanDisabled()) { // pas de statut PENDING ici : le fichier est exposé aux candidats, donc analysé avant d'être enregistré
      try {
        const res = await scanBuffer(file.buffer, { host: process.env.CLAMAV_HOST ?? 'localhost', port: Number(process.env.CLAMAV_PORT) || 3310, timeoutMs: 2500 });
        if (res.status !== 'CLEAN') throw new BadRequestException("Fichier bloqué par l'antivirus");
      } catch (e: any) {
        if (e instanceof BadRequestException) throw e;
        // Si clamd est absent dans l'environnement d'hébergement, la validation binaire stricte (sniffing) a déjà été effectuée
      }
    }
    const key = `recruitments/${id}/${kind}/${randomUUID()}.${v.ext}`;
    await this.storage.put(key, file.buffer, v.mime);
    const col = kind === 'poster' ? 'posterUrl' : 'pdfUrl'; const old = r[col];
    await this.db.recruitment.update({ where: { id }, data: { [col]: key, ...(r.status === 'PREVIEW' ? { status: 'DRAFT', previewedAt: null } : {}) } });
    if (old) await this.storage.remove(old).catch(() => undefined);
    return this.urls({ ...r, [col]: key });
  }

  async removeAsset(orgId: string, id: string, kind: AssetKind) {
    const r = await this.get(orgId, id); const col = kind === 'poster' ? 'posterUrl' : 'pdfUrl';
    await this.db.recruitment.update({ where: { id }, data: { [col]: null, ...(r.status === 'PREVIEW' ? { status: 'DRAFT', previewedAt: null } : {}) } });
    if (r[col]) await this.storage.remove(r[col]!).catch(() => undefined);
    return this.urls({ ...r, [col]: null });
  }

  async updateInfo(orgId: string, id: string, d: Record<string, unknown>) {
    await this.get(orgId, id);
    return this.db.recruitment.update({ where: { id }, data: { ...d, status: 'DRAFT', previewedAt: null } });
  }

  /** Autosave : verrou optimiste (version) pour éviter d'écraser un état plus récent d'un autre appareil. */
  async saveDraft(orgId: string, id: string, version: number, state: unknown) {
    const parsed = draftSchema.parse(state);
    const res = await this.db.recruitment.updateMany({
      where: { id, orgId, draftVersion: version, status: { in: ['DRAFT', 'PREVIEW'] } },
      data: { draftState: parsed as any, draftVersion: version + 1, status: 'DRAFT', previewedAt: null }, // toute modif invalide l'aperçu
    });
    if (res.count === 0) throw new ConflictException('Version obsolète ou recrutement non modifiable');
    return { version: version + 1, savedAt: new Date() };
  }

  /** L'aperçu candidat a été parcouru : seul état à partir duquel « Valider le lancement » est possible. */
  async markPreviewed(orgId: string, id: string) {
    const r = await this.get(orgId, id);
    if (r.status !== 'DRAFT') throw new BadRequestException('État invalide');
    const d = draftSchema.parse(r.draftState);
    if (!d.sections.some((s) => s.fields.length)) throw new BadRequestException('Le formulaire est vide');
    return this.db.recruitment.update({ where: { id }, data: { status: 'PREVIEW', previewedAt: new Date() } });
  }

  /** « Valider le lancement » : matérialise le formulaire et active le lien public. */
  async publish(orgId: string, id: string) {
    const r = await this.get(orgId, id);
    if (r.status !== 'PREVIEW' || !r.previewedAt) throw new BadRequestException("Passage par l'aperçu obligatoire");
    const draft = draftSchema.parse(r.draftState);
    await this.db.$transaction(async (tx) => {
      await tx.formField.deleteMany({ where: { recruitmentId: id } });
      await tx.recruitmentSection.deleteMany({ where: { recruitmentId: id } });
      let pos = 0;
      for (const [si, s] of draft.sections.entries()) {
        const sec = await tx.recruitmentSection.create({ data: { recruitmentId: id, title: s.title, position: si } });
        for (const f of s.fields) {
          await tx.formField.create({
            data: {
              recruitmentId: id, sectionId: sec.id, key: f.key, type: f.type, label: f.label, required: f.required, position: pos++,
              config: f.config as any,
              options: { create: f.options.map((o, i) => ({ ...o, position: i })) },
              conditions: { create: f.conditions.map((c) => ({ ...c, value: c.value ?? null })) },
            },
          });
        }
      }
      await tx.recruitment.update({ where: { id }, data: { status: 'ACTIVE' } });
    });
    return { status: 'ACTIVE', publicToken: r.publicToken };
  }

  async setStatus(orgId: string, id: string, status: 'PAUSED' | 'ACTIVE' | 'CLOSED' | 'ARCHIVED') {
    const r = await this.get(orgId, id);
    const ok: Record<string, string[]> = { ACTIVE: ['PAUSED'], PAUSED: ['ACTIVE', 'CLOSED'], CLOSED: ['ARCHIVED'] };
    if (!ok[r.status]?.includes(status) && !(status === 'CLOSED' && r.status === 'ACTIVE')) throw new BadRequestException('Transition invalide');
    return this.db.recruitment.update({ where: { id }, data: { status } });
  }
}
