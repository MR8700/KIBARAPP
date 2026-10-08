import { JwtService } from '@nestjs/jwt';
import { describe, expect, it } from 'vitest';
import { AuthService } from './auth.service';
import { ChallengeStore } from './challenge.store';

const jwt = new JwtService({ secret: 's3cret', signOptions: { expiresIn: '15m' } });
const svc = new AuthService({} as any, jwt, new ChallengeStore());
const user = { id: 'u1', sessionId: 'sid1' };
const mk = (p: object, o: object = {}) => jwt.signAsync(p, o);

describe('confirmation biométrique (step-up)', () => {
  it('accepte un jeton valide pour cet utilisateur et cette session', async () => { await expect(svc.assertStepUp(user, await mk({ sub: 'u1', sid: 'sid1', scope: 'stepup' }))).resolves.toBeUndefined(); });
  it('refuse l\'absence de jeton', async () => { await expect(svc.assertStepUp(user, undefined)).rejects.toThrow(/Confirmation/); });
  it('refuse un jeton d\'accès ordinaire (sans scope)', async () => { await expect(svc.assertStepUp(user, await mk({ sub: 'u1', sid: 'sid1' }))).rejects.toThrow(); });
  it('refuse un autre utilisateur ou une autre session', async () => {
    await expect(svc.assertStepUp(user, await mk({ sub: 'u2', sid: 'sid1', scope: 'stepup' }))).rejects.toThrow();
    await expect(svc.assertStepUp(user, await mk({ sub: 'u1', sid: 'autre', scope: 'stepup' }))).rejects.toThrow();
  });
  it('refuse un jeton expiré ou signé par un autre secret', async () => {
    await expect(svc.assertStepUp(user, await mk({ sub: 'u1', sid: 'sid1', scope: 'stepup' }, { expiresIn: -10 }))).rejects.toThrow();
    const evil = await new JwtService({ secret: 'autre' }).signAsync({ sub: 'u1', sid: 'sid1', scope: 'stepup' });
    await expect(svc.assertStepUp(user, evil)).rejects.toThrow();
  });
});
