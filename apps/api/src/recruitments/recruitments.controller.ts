import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Put, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { z } from 'zod';
import { AuthGuard } from '../common/auth.guard';
import { OrgGuard, Roles } from '../common/org.guard';
import { RecruitmentsService } from './recruitments.service';

const info = z.object({
  title: z.string().min(3).max(150), description: z.string().max(5000).optional(),
  startsAt: z.coerce.date().optional().nullable(), endsAt: z.coerce.date().optional().nullable(),
});

@UseGuards(AuthGuard, OrgGuard)
@Controller('orgs/:orgId/recruitments')
export class RecruitmentsController {
  constructor(private s: RecruitmentsService) {}

  @Get() list(@Param('orgId') o: string) { return this.s.list(o); }
  @Roles('ADMIN', 'RECRUTEUR') @Post() create(@Param('orgId') o: string, @Req() r: any, @Body() b: unknown) { return this.s.create(o, r.user.id, info.parse(b)); }
  @Get(':id') get(@Param('orgId') o: string, @Param('id') id: string) { return this.s.getWithAssets(o, id); }
  private kind(k: string) { if (k !== 'poster' && k !== 'pdf') throw new BadRequestException('Type invalide'); return k; }
  @Roles('ADMIN', 'RECRUTEUR') @Post(':id/assets/:kind')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 1 } }))
  asset(@Param('orgId') o: string, @Param('id') id: string, @Param('kind') k: string, @UploadedFile() f?: { buffer: Buffer }) { return this.s.uploadAsset(o, id, this.kind(k), f); }
  @Roles('ADMIN', 'RECRUTEUR') @Delete(':id/assets/:kind')
  unasset(@Param('orgId') o: string, @Param('id') id: string, @Param('kind') k: string) { return this.s.removeAsset(o, id, this.kind(k)); }
  @Roles('ADMIN', 'RECRUTEUR') @Patch(':id') update(@Param('orgId') o: string, @Param('id') id: string, @Body() b: unknown) { return this.s.updateInfo(o, id, info.partial().parse(b)); }
  @Roles('ADMIN', 'RECRUTEUR') @Put(':id/draft') draft(@Param('orgId') o: string, @Param('id') id: string, @Body() b: unknown) {
    const x = z.object({ version: z.number().int().min(0), state: z.unknown() }).parse(b);
    return this.s.saveDraft(o, id, x.version, x.state);
  }
  @Roles('ADMIN', 'RECRUTEUR') @Post(':id/preview-complete') preview(@Param('orgId') o: string, @Param('id') id: string) { return this.s.markPreviewed(o, id); }
  @Roles('ADMIN', 'VALIDATEUR') @Post(':id/publish') publish(@Param('orgId') o: string, @Param('id') id: string) { return this.s.publish(o, id); }
  @Roles('ADMIN', 'RECRUTEUR') @Post(':id/status') status(@Param('orgId') o: string, @Param('id') id: string, @Body() b: unknown) {
    return this.s.setStatus(o, id, z.object({ status: z.enum(['PAUSED', 'ACTIVE', 'CLOSED', 'ARCHIVED']) }).parse(b).status);
  }
}
