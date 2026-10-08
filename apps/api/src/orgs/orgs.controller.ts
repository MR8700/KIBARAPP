import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../common/auth.guard';
import { OrgGuard, Roles } from '../common/org.guard';

@UseGuards(AuthGuard)
@Controller('orgs')
export class OrgsController {
  constructor(private db: PrismaService) {}

  @Get() async mine(@Req() r: any) {
    const [l, u] = await Promise.all([
      this.db.organizationMember.findMany({ where: { userId: r.user.id }, include: { org: true } }),
      this.db.user.findUnique({ where: { id: r.user.id }, select: { displayName: true } }),
    ]);
    return l.map((m) => ({ id: m.orgId, name: m.org.name, role: m.role, userName: u?.displayName ?? '' }));
  }

  @Post() async create(@Req() r: any, @Body() b: unknown) {
    const { name } = z.object({ name: z.string().min(2).max(100) }).parse(b);
    const org = await this.db.organization.create({ data: { name, members: { create: { userId: r.user.id, role: 'ADMIN' } } } });
    return { id: org.id, name: org.name, role: 'ADMIN' };
  }

  @UseGuards(OrgGuard) @Roles('ADMIN') @Post(':orgId/members')
  async addMember(@Param('orgId') orgId: string, @Body() b: unknown) {
    const x = z.object({ userPublicId: z.string(), role: z.enum(['ADMIN', 'RECRUTEUR', 'VALIDATEUR', 'CONSULTANT']) }).parse(b);
    const u = await this.db.user.findUnique({ where: { publicId: x.userPublicId } });
    if (!u) throw new NotFoundException('Utilisateur introuvable');
    return this.db.organizationMember.upsert({
      where: { userId_orgId: { userId: u.id, orgId } }, update: { role: x.role }, create: { userId: u.id, orgId, role: x.role },
    });
  }
}
