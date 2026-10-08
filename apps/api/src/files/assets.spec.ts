import { describe, expect, it } from 'vitest';
import { validateAsset } from './assets';
import { assertScanConfig, scanDisabled } from './clamav';

const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(50)]);
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(50)]);
describe('affiche / avis', () => {
  it('affiche = image seulement', () => { expect(validateAsset(png, 'poster').ext).toBe('png'); expect(() => validateAsset(pdf, 'poster')).toThrow(/image/); });
  it('avis = PDF seulement', () => { expect(validateAsset(pdf, 'pdf').mime).toBe('application/pdf'); expect(() => validateAsset(png, 'pdf')).toThrow(/PDF/); });
  it('taille max', () => expect(() => validateAsset(Buffer.concat([png, Buffer.alloc(6 * 1024 * 1024)]), 'poster')).toThrow(/volumineux/));
});
describe('garde antivirus', () => {
  const env = { ...process.env };
  const set = (n?: string, d?: string) => { n === undefined ? delete process.env.NODE_ENV : (process.env.NODE_ENV = n); d === undefined ? delete process.env.SCAN_DISABLED : (process.env.SCAN_DISABLED = d); };
  it('dev : SCAN_DISABLED=1 respecté', () => { set('development', '1'); expect(scanDisabled()).toBe(true); expect(() => assertScanConfig()).not.toThrow(); });
  it('production : SCAN_DISABLED=1 ignoré et refusé au démarrage', () => { set('production', '1'); expect(scanDisabled()).toBe(false); expect(() => assertScanConfig()).toThrow(/interdit/); });
  it('production sans le drapeau : OK', () => { set('production'); expect(() => assertScanConfig()).not.toThrow(); process.env = env; });
});
