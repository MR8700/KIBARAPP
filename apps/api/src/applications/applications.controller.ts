import { BadRequestException, Body, Controller, Delete, Get, Logger, NotFoundException, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../common/auth.guard';
import { OrgGuard, Roles } from '../common/org.guard';
import { StorageService } from '../files/storage.service';
import { csvCell } from '../selected/table';
import { RealtimeService } from '../realtime/realtime.service';
import { checkLimits, evalGroup, Group, groupSchema } from '../filters/evaluate';
import { collect, pageOf } from '../filters/scan';

const STATUS = z.enum(['NEW', 'REVIEWING', 'SELECTED', 'REJECTED', 'WAITING']);
const BATCH = 1000, MAX_SCAN = 100_000, MAX_EXPORT = 50_000, PAGE = 30;
const STATIC_COLS: Record<string, string> = { reference: 'Référence', status: 'Statut', submittedAt: 'Date de candidature' };

@UseGuards(AuthGuard, OrgGuard)
@Controller('orgs/:orgId/recruitments/:rid/applications')
export class ApplicationsController {
  constructor(private db: PrismaService, private storage: StorageService, private rt: RealtimeService) {}

  /** Le recrutement doit appartenir à l'organisation de l'URL : barrière anti cross-organisation. */
  private async rec(orgId: string, rid: string) {
    const r = await this.db.recruitment.findFirst({ where: { id: rid, orgId }, select: { id: true } });
    if (!r) throw new NotFoundException();
    return r;
  }

  private fieldsOf(rid: string, files = true) {
    return this.db.formField.findMany({ where: { recruitmentId: rid, ...(files ? {} : { type: { notIn: ['file', 'image'] } }) }, orderBy: { position: 'asc' }, select: { key: true, label: true, type: true, options: { orderBy: { position: 'asc' }, select: { label: true, value: true } } } });
  }
  private toRow(a: any) { return { ...a, values: { ...Object.fromEntries(a.answers.map((x: any) => [x.field.key, x.value])), _status: a.status } as Record<string, unknown> }; }
  private static SEL = { id: true, reference: true, status: true, submittedAt: true, answers: { select: { value: true, field: { select: { key: true } } } } } as const;
  /** Lots par curseur (ordre stable submittedAt desc, id desc) : plus de plafond de 5000 ni de chargement complet. */
  private async *batches(rid: string, status?: string): AsyncGenerator<any[]> {
    let cursor: string | undefined;
    for (;;) {
      const apps = await this.db.application.findMany({ where: { recruitmentId: rid, ...(status ? { status: status as any } : {}) }, orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }], take: BATCH, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), select: ApplicationsController.SEL });
      if (!apps.length) return;
      yield apps.map((a) => this.toRow(a));
      if (apps.length < BATCH) return;
      cursor = apps[apps.length - 1].id;
    }
  }
  /** Prédicat de filtre (le statut est déjà appliqué en SQL). Même évaluateur testé qu'avant. */
  private matcher(fields: any[], filter?: unknown): (r: any) => boolean {
    if (!filter) return () => true;
    const g: Group = groupSchema.parse(filter); try { checkLimits(g); } catch (e: any) { throw new BadRequestException(e.message); }
    const meta = Object.fromEntries([...fields.map((f) => [f.key, { type: f.type }]), ['_status', { type: 'single' }]]);
    return (r) => evalGroup(g, meta, (k) => r.values[k]);
  }

  /** Chaque champ du Form Builder devient automatiquement un filtre disponible. */
  @Get('filter-fields') async filterFields(@Param('orgId') o: string, @Param('rid') rid: string) {
    await this.rec(o, rid);
    const fields = await this.fieldsOf(rid, false);
    return [{ key: '_status', label: 'Statut', type: 'single', options: ['NEW', 'REVIEWING', 'SELECTED', 'REJECTED', 'WAITING'].map((v) => ({ value: v, label: v })) }, ...fields];
  }

  /** Recherche filtrée : le nombre de résultats est renvoyé avec la page (compteur temps réel côté UI). */
  @Post('search') async search(@Param('orgId') o: string, @Param('rid') rid: string, @Body() b: unknown) {
    await this.rec(o, rid);
    const x = z.object({ filter: z.unknown().optional(), status: STATUS.optional(), page: z.number().int().min(1).default(1) }).parse(b);
    const fields = await this.fieldsOf(rid);
    const match = this.matcher(fields, x.filter);
    let items: any[], total: number, truncated = false;
    if (!x.filter) { // chemin rapide (vue par défaut) : pagination SQL, aucun parcours
      const where = { recruitmentId: rid, ...(x.status ? { status: x.status } : {}) };
      const [rows, n] = await Promise.all([
        this.db.application.findMany({ where, orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }], skip: (x.page - 1) * PAGE, take: PAGE, select: ApplicationsController.SEL }),
        this.db.application.count({ where }),
      ]);
      items = rows.map((r) => this.toRow(r)); total = n;
    } else ({ items, total, truncated } = await pageOf(this.batches(rid, x.status), match, { page: x.page, size: PAGE, cap: MAX_SCAN }));
    const order = Object.fromEntries(fields.map((f: any, i: number) => [f.key, i]));
    return {
      items: items.map((r: any) => ({
        id: r.id, reference: r.reference, status: r.status, submittedAt: r.submittedAt,
        answers: Object.keys(r.values).filter((k) => k !== '_status').sort((a, b) => (order[a] ?? 99) - (order[b] ?? 99)).slice(0, 3)
          .map((k) => ({ value: r.values[k], field: { label: fields.find((f: any) => f.key === k)?.label ?? k } })),
      })), total, truncated,
    };
  }

  /** Export CSV (UTF-8 avec BOM pour Excel) : colonnes choisies, filtre et statut optionnels. */
  @Roles('ADMIN', 'RECRUTEUR') @Get('export')
  async export(@Param('orgId') o: string, @Param('rid') rid: string, @Req() req: any, @Res({ passthrough: true }) res: any,
    @Query('status') status?: string, @Query('columns') columns?: string, @Query('filter') filter?: string) {
    await this.rec(o, rid);
    const fields = await this.fieldsOf(rid);
    let parsed: unknown; try { parsed = filter ? JSON.parse(filter) : undefined; } catch { throw new BadRequestException('Filtre invalide'); }
    const { rows: hit, truncated } = await collect(this.batches(rid, status ? STATUS.parse(status) : undefined), this.matcher(fields, parsed), MAX_EXPORT);
    if (truncated) throw new BadRequestException(`Plus de ${MAX_EXPORT} candidatures : affinez le filtre avant d'exporter`);
    const known = new Map<string, string>([...Object.entries(STATIC_COLS), ...fields.filter((f: any) => f.type !== 'file' && f.type !== 'image').map((f: any) => [f.key, f.label] as [string, string])]);
    const cols = (columns ? columns.split(',') : [...known.keys()]).filter((c) => known.has(c));
    if (!cols.length) throw new BadRequestException('Aucune colonne valide');
    const label = (f: any, v: unknown) => { const m = (x: unknown) => f?.options?.find((op: any) => op.value === x)?.label ?? x; return Array.isArray(v) ? v.map(m) : m(v); };
    const lines = [cols.map((c) => csvCell(known.get(c))).join(',')];
    for (const r of hit) lines.push(cols.map((c) => csvCell(c in STATIC_COLS ? (c === 'submittedAt' ? new Date(r.submittedAt).toISOString() : r[c]) : label(fields.find((f: any) => f.key === c), r.values[c]))).join(','));
    await this.db.auditLog.create({ data: { userId: req.user.id, orgId: o, action: 'applications.export', meta: { count: hit.length, status: status ?? null } } });
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="candidatures.csv"' });
    return '\uFEFF' + lines.join('\r\n');
  }

  @Get() async list(@Param('orgId') o: string, @Param('rid') rid: string, @Query('status') status?: string, @Query('page') page = '1') {
    await this.rec(o, rid);
    const where = { recruitmentId: rid, ...(status ? { status: STATUS.parse(status) } : {}) };
    const take = 30, skip = (Math.max(1, Number(page) || 1) - 1) * take;
    const [items, total, counts] = await Promise.all([
      this.db.application.findMany({
        where, orderBy: { submittedAt: 'desc' }, take, skip,
        select: { id: true, reference: true, status: true, submittedAt: true,
          answers: { take: 3, orderBy: { field: { position: 'asc' } }, select: { value: true, field: { select: { label: true } } } } },
      }),
      this.db.application.count({ where }),
      this.db.application.groupBy({ by: ['status'], where: { recruitmentId: rid }, _count: true }),
    ]);
    return { items, total, counts: Object.fromEntries(counts.map((c: any) => [c.status, c._count])) };
  }

  @Get(':appId') async dossier(@Param('orgId') o: string, @Param('rid') rid: string, @Param('appId') id: string, @Req() req: any): Promise<any> {
    await this.rec(o, rid);
    const a = await this.db.application.findFirst({
      where: { id, recruitmentId: rid },
      include: { answers: { orderBy: { field: { position: 'asc' } }, include: { field: { select: { key: true, label: true, type: true } } } }, history: { orderBy: { at: 'asc' } }, files: { select: { id: true, fieldKey: true, name: true, mime: true, size: true, scanStatus: true } } },
    });
    if (!a) throw new NotFoundException();
    if (a.status === 'NEW' && req.member.role !== 'CONSULTANT') { // « Dossier ouvert » dans l'historique
      await this.db.$transaction([
        this.db.application.update({ where: { id }, data: { status: 'REVIEWING' } }),
        this.db.applicationStatusHistory.create({ data: { applicationId: id, status: 'REVIEWING', actorId: req.user.id } }),
      ]);
      this.rt.publish(o, { type: 'application.status', recruitmentId: rid, ids: [id], status: 'REVIEWING' });
      return this.dossier(o, rid, id, { ...req, member: { role: 'CONSULTANT' } });
    }
    return a;
  }

  /** Téléchargement : autorisation (membre de l'org, candidature de ce recrutement) PUIS URL signée de 60 s. */
  @Get(':appId/files/:fileId') async file(@Param('orgId') o: string, @Param('rid') rid: string, @Param('appId') id: string, @Param('fileId') fileId: string, @Req() req: any, @Query('download') dl?: string) {
    await this.rec(o, rid);
    const f = await this.db.applicationFile.findFirst({ where: { id: fileId, applicationId: id, application: { recruitmentId: rid } } });
    if (!f) throw new NotFoundException();
    if (f.scanStatus === 'PENDING') throw new BadRequestException('Ce document est en cours de vérification. Réessayez dans une minute.');
    if (f.scanStatus === 'INFECTED') throw new BadRequestException("Ce document a été bloqué par l'antivirus.");
    if (f.scanStatus !== 'CLEAN') throw new BadRequestException('Ce document est indisponible.');
    await this.db.auditLog.create({ data: { userId: req.user.id, orgId: o, action: 'file.access', meta: { fileId } } });
    const inline = !dl && (/^(image|video|audio)\//.test(f.mime) || f.mime === 'application/pdf');
    return { url: await this.storage.signedUrl(f.storageKey, f.name, inline), name: f.name, mime: f.mime };
  }

  @Roles('ADMIN', 'RECRUTEUR', 'VALIDATEUR') @Post('bulk-status')
  async bulk(@Param('orgId') o: string, @Param('rid') rid: string, @Req() req: any, @Body() b: unknown) {
    await this.rec(o, rid);
    const x = z.object({ ids: z.array(z.string().uuid()).min(1).max(200), status: STATUS }).parse(b);
    const found = await this.db.application.findMany({ where: { id: { in: x.ids }, recruitmentId: rid }, select: { id: true } });
    if (found.length !== x.ids.length) throw new BadRequestException('Candidatures invalides');
    await this.db.$transaction([
      this.db.application.updateMany({ where: { id: { in: x.ids }, recruitmentId: rid }, data: { status: x.status } }),
      this.db.applicationStatusHistory.createMany({ data: x.ids.map((applicationId) => ({ applicationId, status: x.status, actorId: req.user.id })) }),
      this.db.auditLog.create({ data: { userId: req.user.id, orgId: o, action: 'application.bulk_status', meta: { count: x.ids.length, status: x.status } } }),
    ]);
    this.rt.publish(o, { type: 'application.status', recruitmentId: rid, ids: x.ids, status: x.status });
    return { updated: x.ids.length };
  }

  @Roles('ADMIN', 'RECRUTEUR', 'VALIDATEUR') @Post(':appId/status')
  async setStatus(@Param('orgId') o: string, @Param('rid') rid: string, @Param('appId') id: string, @Req() req: any, @Body() b: unknown) {
    const { status } = z.object({ status: STATUS }).parse(b);
    return this.bulk(o, rid, req, { ids: [id], status });
  }

  /** Suppression définitive : lignes en base ET objets du stockage (sinon des CV resteraient stockés sans être rattachés). */
  @Roles('ADMIN', 'RECRUTEUR') @Delete(':appId')
  async remove(@Param('orgId') o: string, @Param('rid') rid: string, @Param('appId') id: string, @Req() req: any) {
    await this.rec(o, rid);
    const a = await this.db.application.findFirst({ where: { id, recruitmentId: rid }, select: { reference: true, files: { select: { storageKey: true } } } });
    if (!a) throw new NotFoundException();
    await this.db.$transaction([
      this.db.application.delete({ where: { id } }),
      this.db.auditLog.create({ data: { userId: req.user.id, orgId: o, action: 'application.delete', meta: { reference: a.reference, files: a.files.length } } }),
    ]);
    const failed: string[] = [];
    await Promise.all(a.files.map((f) => this.storage.remove(f.storageKey).catch(() => { failed.push(f.storageKey); })));
    if (failed.length) new Logger('Applications').error(`Objets non supprimés après suppression de ${a.reference} : ${failed.join(', ')}`); // à purger manuellement
    this.rt.publish(o, { type: 'application.deleted', recruitmentId: rid, applicationId: id });
    return { deleted: true, filesRemoved: a.files.length - failed.length };
  }
}
