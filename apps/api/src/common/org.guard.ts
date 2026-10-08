import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OrgRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const Roles = (...r: OrgRole[]) => SetMetadata('roles', r);

/** Isolation multi-tenant : user → membership → rôle. Toujours appliqué côté backend. */
@Injectable()
export class OrgGuard implements CanActivate {
  constructor(private db: PrismaService, private reflector: Reflector) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const m = await this.db.organizationMember.findUnique({
      where: { userId_orgId: { userId: req.user.id, orgId: req.params.orgId } },
    });
    if (!m) throw new ForbiddenException('Accès refusé à cette organisation');
    const roles = this.reflector.get<OrgRole[]>('roles', ctx.getHandler());
    if (roles?.length && !roles.includes(m.role)) throw new ForbiddenException('Permission insuffisante');
    req.member = m;
    return true;
  }
}
