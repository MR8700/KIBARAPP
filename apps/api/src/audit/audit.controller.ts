import { BadRequestException, Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../common/auth.guard';
import { OrgGuard, Roles } from '../common/org.guard';

/** Journal d'audit de l'organisation : réservé aux administrateurs, pagination par curseur (date). */
@UseGuards(AuthGuard, OrgGuard)
@Controller('orgs/:orgId/audit')
export class AuditController {
  constructor(private db: PrismaService) {}

  @Roles('ADMIN') @Get()
  async list(@Param('orgId') o: string, @Query('before') before?: string, @Query('action') action?: string) {
    const take = 50;
    const at = before ? new Date(before) : undefined;
    if (at && Number.isNaN(+at)) throw new BadRequestException('Curseur invalide');
    const rows = await this.db.auditLog.findMany({
      where: { orgId: o, ...(at ? { at: { lt: at } } : {}), ...(action ? { action: { startsWith: action.slice(0, 40) } } : {}) },
      orderBy: { at: 'desc' }, take: take + 1,
    });
    const page = rows.slice(0, take);
    const users = await this.db.user.findMany({ where: { id: { in: [...new Set(page.map((r) => r.userId).filter((x): x is string => !!x))] } }, select: { id: true, displayName: true } });
    const name = new Map(users.map((u) => [u.id, u.displayName]));
    return {
      items: page.map((r) => ({ id: r.id, action: r.action, at: r.at, user: r.userId ? name.get(r.userId) ?? 'Utilisateur supprimé' : 'Système', meta: r.meta })),
      next: rows.length > take ? page[page.length - 1].at.toISOString() : null,
    };
  }
}
