import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';

/** Vérifie le JWT d'accès ET que l'appareil/la session n'ont pas été révoqués. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private jwt: JwtService, private db: PrismaService) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const h: string = req.headers.authorization ?? '';
    if (!h.startsWith('Bearer ')) throw new UnauthorizedException();
    let p: { sub: string; sid: string; scope?: string };
    try { p = await this.jwt.verifyAsync(h.slice(7)); } catch { throw new UnauthorizedException('Token invalide'); }
    if (p.scope) throw new UnauthorizedException('Token invalide'); // un jeton de confirmation n'est pas un jeton d'accès
    const s = await this.db.session.findUnique({ where: { id: p.sid }, include: { device: true } });
    if (!s || s.revokedAt || s.device.revokedAt || s.userId !== p.sub) throw new UnauthorizedException('Session révoquée');
    req.user = { id: p.sub, sessionId: p.sid, deviceId: s.deviceId };
    return true;
  }
}
