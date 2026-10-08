import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  generateAuthenticationOptions, generateRegistrationOptions,
  verifyAuthenticationResponse, verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ChallengeStore } from './challenge.store';
import { recoveryCode, sha256, token } from '../common/crypto';

const RP_ID = process.env.RP_ID ?? 'localhost';
const RP_NAME = process.env.RP_NAME ?? 'KIBAR';
const ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
const REFRESH_DAYS = 30;

@Injectable()
export class AuthService {
  constructor(private db: PrismaService, private jwt: JwtService, private ch: ChallengeStore) {}

  // ---- Enrôlement d'un nouvel appareil (première inscription) ----
  async registerOptions(displayName: string, phone?: string) {
    const user = await this.db.user.create({ data: { displayName, phone, publicId: 'u_' + token(9) } });
    return { userId: user.id, options: await this.regOptions(user.id, user.displayName, 'register') };
  }

  private async regOptions(userId: string, name: string, kind: 'register' | 'recover' | 'add', extra: { codeId?: string; revokeOthers?: boolean } = {}) {
    const existing = await this.db.credential.findMany({ where: { userId, revokedAt: null } });
    const options = await generateRegistrationOptions({
      rpName: RP_NAME, rpID: RP_ID, userName: name, userID: new TextEncoder().encode(userId),
      attestationType: 'none',
      excludeCredentials: existing.map((c) => ({ id: c.credentialId })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' }, // passkey découvrable ; biométrie/code de l'appareil OBLIGATOIRE
    });
    await this.ch.put('reg:' + userId, { challenge: options.challenge, userId, kind, ...extra });
    return options;
  }

  /** Vérifie la preuve d'enrôlement (biométrie/code de l'appareil exigé) puis crée appareil + passkey en UNE transaction.
   *  Récupération : le code n'est consommé (et les autres appareils révoqués) qu'ici, une fois la nouvelle passkey prouvée valide. */
  private async enrollDevice(userId: string, response: any, deviceName: string, platform: string, c: NonNullable<Awaited<ReturnType<ChallengeStore['take']>>>) {
    const v = await verifyRegistrationResponse({
      response, expectedChallenge: c.challenge, expectedOrigin: ORIGIN, expectedRPID: RP_ID, requireUserVerification: true,
    }).catch(() => null);
    if (!v?.verified) throw new UnauthorizedException('Preuve invalide');
    const { credential } = v.registrationInfo!;
    return this.db.$transaction(async (tx) => {
      if (c.kind === 'recover') {
        const used = await tx.recoveryCode.updateMany({ where: { id: c.codeId, userId, usedAt: null, revokedAt: null }, data: { usedAt: new Date() } });
        if (used.count !== 1) throw new UnauthorizedException('Code invalide'); // déjà utilisé entre-temps
        if (c.revokeOthers) {
          const now = new Date();
          await tx.device.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
          await tx.credential.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
          await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
        }
      }
      const device = await tx.device.create({ data: { userId, deviceName, platform, devicePublicId: 'd_' + token(9), lastSeenAt: new Date() } });
      await tx.credential.create({ data: { userId, deviceId: device.id, credentialId: credential.id, publicKey: Buffer.from(credential.publicKey), signCount: credential.counter, transports: credential.transports ?? [] } });
      await tx.user.update({ where: { id: userId }, data: { status: 'ACTIVE' } });
      return device;
    });
  }

  async registerVerify(userId: string, response: any, deviceName: string, platform: string) {
    const c = await this.ch.take('reg:' + userId);
    if (!c || c.kind === 'add') throw new BadRequestException('Challenge expiré');
    const device = await this.enrollDevice(userId, response, deviceName, platform, c);
    const codes = c.kind === 'register' ? await this.issueRecoveryCodes(userId) : undefined;
    await this.audit(userId, c.kind === 'register' ? 'auth.enroll' : 'auth.recover.enroll', { deviceId: device.id, ...(c.kind === 'recover' ? { revokeOthers: !!c.revokeOthers } : {}) });
    return { ...(await this.newSession(userId, device.id)), recoveryCodes: codes };
  }

  // ---- Confirmation biométrique (« step-up ») pour les actions sensibles ----
  async stepUpOptions(userId: string) {
    const creds = await this.db.credential.findMany({ where: { userId, revokedAt: null, device: { revokedAt: null } } });
    const options = await generateAuthenticationOptions({ rpID: RP_ID, userVerification: 'required', allowCredentials: creds.map((x) => ({ id: x.credentialId, transports: x.transports as any })) });
    const challengeId = randomUUID();
    await this.ch.put('login:' + challengeId, { challenge: options.challenge, userId, kind: 'login' });
    return { challengeId, options };
  }
  async stepUpVerify(userId: string, sessionId: string, challengeId: string, response: any) {
    const c = await this.ch.take('login:' + challengeId);
    if (!c || c.userId !== userId) throw new UnauthorizedException('Challenge expiré');
    const cred = await this.db.credential.findUnique({ where: { credentialId: response?.id ?? '' }, include: { device: true } });
    if (!cred || cred.userId !== userId || cred.revokedAt || cred.device.revokedAt) throw new UnauthorizedException('Appareil non autorisé');
    const v = await verifyAuthenticationResponse({
      response, expectedChallenge: c.challenge, expectedOrigin: ORIGIN, expectedRPID: RP_ID, requireUserVerification: true,
      credential: { id: cred.credentialId, publicKey: new Uint8Array(cred.publicKey), counter: cred.signCount, transports: cred.transports as any },
    }).catch(() => null);
    if (!v?.verified) throw new UnauthorizedException('Preuve invalide');
    await this.db.credential.update({ where: { id: cred.id }, data: { signCount: v.authenticationInfo.newCounter, lastUsedAt: new Date() } });
    return { stepUpToken: await this.jwt.signAsync({ sub: userId, sid: sessionId, scope: 'stepup' }, { expiresIn: '2m' }) };
  }
  /** Exigé par les actions sensibles : jeton de confirmation récent, de CET utilisateur et de CETTE session. */
  async assertStepUp(user: { id: string; sessionId: string }, tok?: string) {
    let p: { sub?: string; sid?: string; scope?: string } | undefined;
    try { p = tok ? await this.jwt.verifyAsync(tok) : undefined; } catch { /* expiré ou falsifié */ }
    if (!p || p.scope !== 'stepup' || p.sub !== user.id || p.sid !== user.sessionId) throw new ForbiddenException('Confirmation par empreinte, visage ou code de l\'appareil requise');
  }

  // ---- Ajout d'un appareil depuis un compte connecté (sans consommer de code de secours) ----
  async addDeviceOptions(userId: string) {
    const u = await this.db.user.findUniqueOrThrow({ where: { id: userId } });
    return this.regOptions(userId, u.displayName, 'add');
  }
  async addDeviceVerify(userId: string, response: any, deviceName: string, platform: string) {
    const c = await this.ch.take('reg:' + userId);
    if (!c || c.kind !== 'add') throw new BadRequestException('Challenge expiré');
    const d = await this.enrollDevice(userId, response, deviceName, platform, c);
    await this.audit(userId, 'auth.device.add', { deviceId: d.id });
    return { id: d.id, name: d.deviceName };
  }

  // ---- Connexion (passkey découvrable, sans identifiant) ----
  async loginOptions() {
    const options = await generateAuthenticationOptions({ rpID: RP_ID, userVerification: 'required' });
    const challengeId = randomUUID();
    await this.ch.put('login:' + challengeId, { challenge: options.challenge, kind: 'login' });
    return { challengeId, options };
  }

  async loginVerify(challengeId: string, response: any) {
    const c = await this.ch.take('login:' + challengeId);
    if (!c) throw new UnauthorizedException('Challenge expiré'); // usage unique => bloque le replay
    const cred = await this.db.credential.findUnique({ where: { credentialId: response?.id ?? '' }, include: { device: true, user: true } });
    if (!cred || cred.revokedAt || cred.device.revokedAt || cred.user.status !== 'ACTIVE') throw new UnauthorizedException('Appareil non autorisé');
    const v = await verifyAuthenticationResponse({
      response, expectedChallenge: c.challenge, expectedOrigin: ORIGIN, expectedRPID: RP_ID, requireUserVerification: true,
      credential: { id: cred.credentialId, publicKey: new Uint8Array(cred.publicKey), counter: cred.signCount, transports: cred.transports as any },
    }).catch(() => null);
    if (!v?.verified) throw new UnauthorizedException('Preuve invalide');
    await this.db.credential.update({ where: { id: cred.id }, data: { signCount: v.authenticationInfo.newCounter, lastUsedAt: new Date() } });
    await this.db.device.update({ where: { id: cred.deviceId }, data: { lastSeenAt: new Date() } });
    await this.audit(cred.userId, 'auth.login', { deviceId: cred.deviceId });
    return this.newSession(cred.userId, cred.deviceId);
  }

  // ---- Sessions : access JWT court + refresh opaque rotatif (haché en base) ----
  private async newSession(userId: string, deviceId: string) {
    const refresh = token(32);
    const s = await this.db.session.create({
      data: { userId, deviceId, refreshHash: sha256(refresh), expiresAt: new Date(Date.now() + REFRESH_DAYS * 864e5) },
    });
    return { accessToken: await this.jwt.signAsync({ sub: userId, sid: s.id }), refreshToken: refresh };
  }

  async refresh(refresh: string) {
    const s = await this.db.session.findUnique({ where: { refreshHash: sha256(refresh) }, include: { device: true } });
    if (!s || s.revokedAt || s.expiresAt < new Date() || s.device.revokedAt) {
      if (s && !s.revokedAt) await this.db.session.update({ where: { id: s.id }, data: { revokedAt: new Date() } });
      throw new UnauthorizedException();
    }
    await this.db.session.update({ where: { id: s.id }, data: { revokedAt: new Date() } }); // rotation
    return this.newSession(s.userId, s.deviceId);
  }

  logout(sessionId: string) { return this.db.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } }); }

  // ---- Appareils ----
  devices(userId: string, currentDeviceId: string) {
    return this.db.device.findMany({ where: { userId, revokedAt: null }, orderBy: { lastSeenAt: 'desc' } })
      .then((l) => l.map((d) => ({ id: d.id, name: d.deviceName, platform: d.platform, lastSeenAt: d.lastSeenAt, current: d.id === currentDeviceId })));
  }
  async revokeDevice(userId: string, deviceId: string) {
    const d = await this.db.device.findFirst({ where: { id: deviceId, userId, revokedAt: null } });
    if (!d) throw new BadRequestException('Appareil introuvable');
    const now = new Date();
    await this.db.$transaction([
      this.db.device.update({ where: { id: d.id }, data: { revokedAt: now } }),
      this.db.credential.updateMany({ where: { deviceId: d.id }, data: { revokedAt: now } }),
      this.db.session.updateMany({ where: { deviceId: d.id, revokedAt: null }, data: { revokedAt: now } }),
    ]);
    await this.audit(userId, 'auth.device.revoke', { deviceId });
  }

  // ---- Récupération sans mot de passe ----
  async issueRecoveryCodes(userId: string) {
    await this.db.recoveryCode.updateMany({ where: { userId, usedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
    const codes = Array.from({ length: 8 }, recoveryCode);
    await this.db.recoveryCode.createMany({ data: codes.map((c) => ({ userId, codeHash: sha256(c) })) });
    return codes;
  }

  /** Valide le code SANS le consommer : il ne l'est qu'à l'enrôlement réussi du nouvel appareil (voir enrollDevice). */
  async recoverStart(code: string, revokeOthers: boolean) {
    const rc = await this.db.recoveryCode.findUnique({ where: { codeHash: sha256(code.trim().toUpperCase()) }, include: { user: true } });
    if (!rc || rc.usedAt || rc.revokedAt) throw new UnauthorizedException('Code invalide');
    await this.audit(rc.userId, 'auth.recover.start', { revokeOthers });
    return { userId: rc.userId, options: await this.regOptions(rc.userId, rc.user.displayName, 'recover', { codeId: rc.id, revokeOthers }) };
  }

  audit(userId: string | null, action: string, meta: object = {}, orgId?: string) {
    return this.db.auditLog.create({ data: { userId, orgId, action, meta } });
  }
}
