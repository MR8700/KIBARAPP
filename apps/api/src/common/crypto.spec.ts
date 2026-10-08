import { describe, expect, it } from 'vitest';
import { recoveryCode, sha256, token } from './crypto';

describe('crypto', () => {
  it('génère des tokens publics non devinables et uniques', () => {
    const s = new Set(Array.from({ length: 1000 }, () => token(24)));
    expect(s.size).toBe(1000);
    expect([...s][0].length).toBeGreaterThanOrEqual(32);
  });
  it('code de récupération : format et hachage déterministe', () => {
    const c = recoveryCode();
    expect(c).toMatch(/^[0-9A-F]{5}(-[0-9A-F]{5}){3}$/);
    expect(sha256(c)).toBe(sha256(c));
    expect(sha256(c)).not.toContain(c);
  });
});
