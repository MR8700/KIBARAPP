import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthService } from './auth.service';
import { AuthGuard } from '../common/auth.guard';
import { rateLimit } from '../common/rate-limit';

const parse = <T extends z.ZodTypeAny>(s: T, v: unknown): z.infer<T> => s.parse(v);

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('register/options') async registerOptions(@Req() r: any, @Body() b: unknown) {
    await rateLimit('reg:' + r.ip, 10, 60_000);
    const { displayName, phone } = parse(z.object({ displayName: z.string().min(2).max(80), phone: z.string().max(30).optional() }), b);
    return this.auth.registerOptions(displayName, phone);
  }
  @Post('register/verify') registerVerify(@Body() b: unknown) {
    const x = parse(z.object({ userId: z.string().uuid(), response: z.any(), deviceName: z.string().max(80).default('Appareil'), platform: z.string().max(20).default('web') }), b);
    return this.auth.registerVerify(x.userId, x.response, x.deviceName, x.platform);
  }
  @Post('login/options') @HttpCode(200) async loginOptions(@Req() r: any) { await rateLimit('lo:' + r.ip, 30, 60_000); return this.auth.loginOptions(); }
  @Post('login/verify') @HttpCode(200) async loginVerify(@Req() r: any, @Body() b: unknown) {
    await rateLimit('lv:' + r.ip, 20, 60_000);
    const x = parse(z.object({ challengeId: z.string().uuid(), response: z.any() }), b);
    return this.auth.loginVerify(x.challengeId, x.response);
  }
  @Post('refresh') @HttpCode(200) refresh(@Body() b: unknown) { return this.auth.refresh(parse(z.object({ refreshToken: z.string() }), b).refreshToken); }
  @Post('recover/start') @HttpCode(200) async recover(@Req() r: any, @Body() b: unknown) {
    await rateLimit('rc:' + r.ip, 5, 15 * 60_000);
    const x = parse(z.object({ code: z.string().min(10).max(40), revokeOthers: z.boolean().default(true) }), b);
    return this.auth.recoverStart(x.code, x.revokeOthers); // puis POST /auth/register/verify avec ce userId
  }

  @UseGuards(AuthGuard) @Post('logout') @HttpCode(204) logout(@Req() r: any) { return this.auth.logout(r.user.sessionId); }
  @UseGuards(AuthGuard) @Get('devices') devices(@Req() r: any) { return this.auth.devices(r.user.id, r.user.deviceId); }
  // Actions sensibles : jeton de confirmation biométrique récent (en-tête X-Step-Up) obtenu via /auth/step-up/*.
  private step(r: any) { return this.auth.assertStepUp(r.user, r.headers['x-step-up']); }
  @UseGuards(AuthGuard) @Post('step-up/options') @HttpCode(200) async stepOptions(@Req() r: any) { await rateLimit('su:' + r.user.id, 20, 60_000); return this.auth.stepUpOptions(r.user.id); }
  @UseGuards(AuthGuard) @Post('step-up/verify') @HttpCode(200) async stepVerify(@Req() r: any, @Body() b: unknown) {
    await rateLimit('sv:' + r.user.id, 20, 60_000);
    const x = parse(z.object({ challengeId: z.string().uuid(), response: z.any() }), b);
    return this.auth.stepUpVerify(r.user.id, r.user.sessionId, x.challengeId, x.response);
  }
  @UseGuards(AuthGuard) @Delete('devices/:id') @HttpCode(204) async revoke(@Req() r: any, @Param('id') id: string) { await this.step(r); return this.auth.revokeDevice(r.user.id, id); }
  @UseGuards(AuthGuard) @Post('devices/options') @HttpCode(200) async addOptions(@Req() r: any) { await this.step(r); return this.auth.addDeviceOptions(r.user.id); }
  @UseGuards(AuthGuard) @Post('devices/verify') async addVerify(@Req() r: any, @Body() b: unknown) {
    const x = parse(z.object({ response: z.any(), deviceName: z.string().max(80).default('Appareil'), platform: z.string().max(20).default('web') }), b);
    return this.auth.addDeviceVerify(r.user.id, x.response, x.deviceName, x.platform);
  }
  @UseGuards(AuthGuard) @Post('recovery-codes') async regenerate(@Req() r: any) { await this.step(r); return this.auth.issueRecoveryCodes(r.user.id).then((codes) => ({ codes })); }
}
