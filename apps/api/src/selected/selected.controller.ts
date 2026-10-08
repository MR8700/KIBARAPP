import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, Put, Query, Req, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../common/auth.guard';
import { OrgGuard, Roles } from '../common/org.guard';
import { AppRow, Col, FieldRow, allColumns, cell, csvCell, fmtDate, mergeConfig, resolveColumns } from './table';
import { renderPdf, renderXlsx } from './render';

const MAX_ROWS = 5000, MAX_PDF = 2000, LIST_NAME = 'Retenus';
const CONFIG = z.object({ columns: z.array(z.object({ key: z.string().max(80), visible: z.boolean() })).min(1).max(60) });

/** Espace « Retenus » : candidatures au statut SELECTED + colonnes enregistrées par recrutement + exports. */
@UseGuards(AuthGuard, OrgGuard)
@Controller('orgs/:orgId/recruitments/:rid/selected')
export class SelectedController {
  constructor(private db: PrismaService) {}

  private async data(orgId: string, rid: string) {
    const rec = await this.db.recruitment.findFirst({ where: { id: rid, orgId }, select: { id: true, title: true } });
    if (!rec) throw new NotFoundException();
    const [fields, apps, list] = await Promise.all([
      this.db.formField.findMany({ where: { recruitmentId: rid }, orderBy: { position: 'asc' }, select: { key: true, label: true, type: true, options: { orderBy: { position: 'asc' }, select: { label: true, value: true } } } }),
      this.db.application.findMany({
        where: { recruitmentId: rid, status: 'SELECTED' }, orderBy: { submittedAt: 'desc' }, take: MAX_ROWS,
        select: { id: true, reference: true, submittedAt: true, answers: { select: { value: true, field: { select: { key: true } } } }, history: { where: { status: 'SELECTED' }, orderBy: { at: 'desc' }, take: 1, select: { at: true } } },
      }),
      this.db.selectionList.findUnique({ where: { recruitmentId_name: { recruitmentId: rid, name: LIST_NAME } }, include: { columns: { orderBy: { position: 'asc' } } } }),
    ]);
    const rows = apps.map((a) => ({ id: a.id, reference: a.reference, submittedAt: a.submittedAt, selectedAt: a.history[0]?.at ?? null,
      values: Object.fromEntries(a.answers.map((x) => [x.field.key, x.value])) as Record<string, unknown> }))
      .sort((a, b) => +(b.selectedAt ?? b.submittedAt) - +(a.selectedAt ?? a.submittedAt));
    const all = allColumns(fields as FieldRow[]);
    const config = mergeConfig(all, list?.columns.map((c) => ({ key: c.fieldKey, visible: c.visible })) ?? null);
    return { rec, fields: fields as FieldRow[], rows, all, config, truncated: apps.length >= MAX_ROWS };
  }
  private labelled(all: Col[], config: { key: string; visible: boolean }[]) {
    const lab = new Map(all.map((c) => [c.key, c.label]));
    return config.map((c) => ({ key: c.key, label: lab.get(c.key)!, visible: c.visible }));
  }

  @Get() async view(@Param('orgId') o: string, @Param('rid') rid: string, @Req() req: any) {
    const d = await this.data(o, rid);
    return {
      title: d.rec.title, canEdit: ['ADMIN', 'RECRUTEUR'].includes(req.member.role), total: d.rows.length, truncated: d.truncated,
      columns: this.labelled(d.all, d.config),
      rows: d.rows.map((r) => ({ id: r.id, reference: r.reference, cells: Object.fromEntries(d.all.map((c) => [c.key, cell(c, r, d.fields)])) })),
    };
  }

  /** Enregistre l'ordre et la visibilité des colonnes (partagé par l'équipe du recrutement). */
  @Roles('ADMIN', 'RECRUTEUR') @Put('config')
  async save(@Param('orgId') o: string, @Param('rid') rid: string, @Req() req: any, @Body() b: unknown) {
    const x = CONFIG.parse(b);
    const d = await this.data(o, rid);
    const known = new Set(d.all.map((c) => c.key));
    const seen = new Set<string>();
    const cols = x.columns.filter((c) => known.has(c.key) && !seen.has(c.key) && !!seen.add(c.key));
    if (!cols.some((c) => c.visible)) throw new BadRequestException('Au moins une colonne doit être visible');
    try {
      await this.db.$transaction(async (tx) => {
        const list = await tx.selectionList.upsert({ where: { recruitmentId_name: { recruitmentId: rid, name: LIST_NAME } }, update: {}, create: { recruitmentId: rid, name: LIST_NAME } });
        await tx.selectionListColumn.deleteMany({ where: { listId: list.id } });
        await tx.selectionListColumn.createMany({ data: cols.map((c, i) => ({ listId: list.id, fieldKey: c.key, position: i, visible: c.visible })) });
        await tx.auditLog.create({ data: { userId: req.user.id, orgId: o, action: 'selected.config', meta: { recruitmentId: rid, visible: cols.filter((c) => c.visible).length } } });
      });
    } catch (e: any) { if (e?.code === 'P2002') throw new ConflictException('Modification simultanée, réessayez'); throw e; }
    return { columns: this.labelled(d.all, mergeConfig(d.all, cols)) };
  }

  /** Export xlsx | pdf | csv. `columns` (clés séparées par des virgules) prime sur la config enregistrée. */
  @Roles('ADMIN', 'RECRUTEUR') @Get('export')
  async export(@Param('orgId') o: string, @Param('rid') rid: string, @Req() req: any, @Res({ passthrough: true }) res: any,
    @Query('format') format = 'xlsx', @Query('columns') columns?: string) {
    const f = z.enum(['xlsx', 'pdf', 'csv']).parse(format);
    const d = await this.data(o, rid);
    const cols = resolveColumns(d.all, d.config, columns);
    if (!cols.length) throw new BadRequestException('Aucune colonne valide');
    if (f === 'pdf' && d.rows.length > MAX_PDF) throw new BadRequestException(`PDF limité à ${MAX_PDF} lignes : utilisez Excel`);
    const rows: AppRow[] = d.rows;
    const name = `retenus-${d.rec.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'recrutement'}`;
    await this.db.auditLog.create({ data: { userId: req.user.id, orgId: o, action: 'selected.export', meta: { recruitmentId: rid, format: f, count: rows.length } } });
    const set = (type: string, ext: string) => res.set({ 'Content-Type': type, 'Content-Disposition': `attachment; filename="${name}.${ext}"`, 'Cache-Control': 'no-store' });
    if (f === 'csv') {
      set('text/csv; charset=utf-8', 'csv');
      return '\uFEFF' + [cols.map((c) => csvCell(c.label)).join(','), ...rows.map((r) => cols.map((c) => csvCell(cell(c, r, d.fields))).join(','))].join('\r\n');
    }
    if (f === 'xlsx') {
      set('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx');
      return new StreamableFile(await renderXlsx(d.rec.title, cols, rows, d.fields));
    }
    set('application/pdf', 'pdf');
    return new StreamableFile(await renderPdf(`Retenus — ${d.rec.title}`, `${rows.length} candidat(s) retenu(s) · exporté le ${fmtDate(new Date())}`, cols, rows, d.fields));
  }
}
