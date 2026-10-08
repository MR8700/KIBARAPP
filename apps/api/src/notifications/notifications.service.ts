import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private db: PrismaService) {}
  /** Une notification par ADMIN/RECRUTEUR de l'organisation. Aucune donnée personnelle du candidat. */
  async newApplication(orgId: string, recruitmentId: string, title: string, reference: string) {
    const members = await this.db.organizationMember.findMany({ where: { orgId, role: { in: ['ADMIN', 'RECRUTEUR'] } }, select: { userId: true } });
    if (!members.length) return;
    await this.db.notification.createMany({ data: members.map((m) => ({ userId: m.userId, type: 'application.new', payload: { orgId, recruitmentId, title, reference } })) });
  }
}
