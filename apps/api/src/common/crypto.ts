import { createHash, randomBytes } from 'crypto';
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const token = (bytes = 24) => randomBytes(bytes).toString('base64url');
/** Code de récupération : 80 bits d'entropie, affiché une seule fois, stocké haché. */
export const recoveryCode = () => {
  const raw = randomBytes(10).toString('hex').toUpperCase();
  return `${raw.slice(0, 5)}-${raw.slice(5, 10)}-${raw.slice(10, 15)}-${raw.slice(15, 20)}`;
};
