import { sniff } from './sniff';

export type AssetKind = 'poster' | 'pdf';
export const ASSET_RULES: Record<AssetKind, { kind: 'image' | 'pdf'; maxMb: number; label: string }> = {
  poster: { kind: 'image', maxMb: 5, label: "L'affiche doit être une image JPG, PNG ou WebP" },
  pdf: { kind: 'pdf', maxMb: 15, label: "L'avis doit être un fichier PDF" },
};
/** Affiche / avis de l'offre : type vérifié par signature (jamais par l'extension ou le MIME déclarés) + taille. */
export function validateAsset(buf: Buffer, kind: AssetKind) {
  const rule = ASSET_RULES[kind]; const s = sniff(buf);
  if (!s || s.kind !== rule.kind) throw new Error(rule.label);
  if (buf.length > rule.maxMb * 1024 * 1024) throw new Error(`Fichier trop volumineux (max ${rule.maxMb} Mo)`);
  return { mime: s.mime, ext: s.ext[0] };
}
