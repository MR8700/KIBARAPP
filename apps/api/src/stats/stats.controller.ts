import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../common/auth.guard';
import { OrgGuard } from '../common/org.guard';
import { bucketByDay, distribution } from './stats';

@UseGuards(AuthGuard, OrgGuard)
@Controller('orgs/:orgId/recruitments/:rid/stats')
export class StatsController {
  constructor(private db: PrismaService) {}

  @Get() async stats(@Param('orgId') o: string, @Param('rid') rid: string) {
    const rec = await this.db.recruitment.findFirst({ where: { id: rid, orgId: o }, select: { title: true } });
    if (!rec) throw new NotFoundException();
    const since = new Date(Date.now() - 30 * 864e5);
    const [byStatus, recent, fields] = await Promise.all([
      this.db.application.groupBy({ by: ['status'], where: { recruitmentId: rid }, _count: true }),
      this.db.application.findMany({ where: { recruitmentId: rid, submittedAt: { gte: since } }, select: { submittedAt: true }, take: 50_000 }),
      this.db.formField.findMany({ where: { recruitmentId: rid, type: { in: ['single', 'multi'] } }, orderBy: { position: 'asc' }, take: 6, select: { id: true, key: true, label: true, options: { select: { label: true, value: true } } } }),
    ]);
    const answers = fields.length ? await this.db.applicationAnswer.findMany({ where: { fieldId: { in: fields.map((f) => f.id) }, application: { recruitmentId: rid } }, select: { fieldId: true, value: true }, take: 100_000 }) : [];
    const counts = Object.fromEntries(byStatus.map((c) => [c.status, c._count]));
    const total = Object.values(counts).reduce((a: number, b) => a + (b as number), 0);
    return {
      title: rec.title, total, counts, selectedRate: total ? Math.round(((counts.SELECTED ?? 0) / total) * 1000) / 10 : 0,
      perDay: bucketByDay(recent.map((r) => r.submittedAt), 30),
      distributions: fields.map((f) => ({ key: f.key, label: f.label, items: distribution(answers.filter((a) => a.fieldId === f.id).map((a) => a.value), f.options).slice(0, 8) })).filter((d) => d.items.length),
    };
  }
}
