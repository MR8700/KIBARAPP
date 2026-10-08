import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../common/auth.guard';

/** Notifications personnelles : toujours filtrées par l'utilisateur authentifié. */
@UseGuards(AuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private db: PrismaService) {}

  @Get() async list(@Req() req: any) {
    const [unread, items] = await Promise.all([
      this.db.notification.count({ where: { userId: req.user.id, readAt: null } }),
      this.db.notification.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' }, take: 30 }),
    ]);
    return { unread, items };
  }

  @Post('read') async read(@Req() req: any, @Body() b: unknown) {
    const x = z.union([z.object({ all: z.literal(true) }), z.object({ ids: z.array(z.string().uuid()).min(1).max(100) })]).parse(b);
    const where = { userId: req.user.id, readAt: null, ...('ids' in x ? { id: { in: x.ids } } : {}) };
    const r = await this.db.notification.updateMany({ where, data: { readAt: new Date() } });
    return { updated: r.count };
  }
}
