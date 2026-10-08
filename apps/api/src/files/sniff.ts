import { validateOffice } from './office';
/** Détection du vrai type par signature (magic bytes) : on ne fait jamais confiance au MIME ni à l'extension déclarés. */
export type Kind = 'pdf' | 'image' | 'doc' | 'video' | 'audio';
export type Sniffed = { mime: string; kind: Kind; ext: string[] };

const eq = (b: Buffer, off: number, sig: number[]) => sig.every((x, i) => b[off + i] === x);

export function sniff(b: Buffer): Sniffed | null {
  if (b.length < 12) return null;
  if (eq(b, 0, [0x25, 0x50, 0x44, 0x46])) return { mime: 'application/pdf', kind: 'pdf', ext: ['pdf'] };
  if (eq(b, 0, [0x89, 0x50, 0x4e, 0x47])) return { mime: 'image/png', kind: 'image', ext: ['png'] };
  if (eq(b, 0, [0xff, 0xd8, 0xff])) return { mime: 'image/jpeg', kind: 'image', ext: ['jpg', 'jpeg'] };
  if (eq(b, 0, [0x52, 0x49, 0x46, 0x46]) && eq(b, 8, [0x57, 0x45, 0x42, 0x50])) return { mime: 'image/webp', kind: 'image', ext: ['webp'] };
  if (eq(b, 0, [0x50, 0x4b, 0x03, 0x04])) return { mime: 'application/vnd.openxmlformats-officedocument', kind: 'doc', ext: ['docx', 'xlsx', 'pptx'] };
  if (eq(b, 0, [0xd0, 0xcf, 0x11, 0xe0])) return { mime: 'application/msword', kind: 'doc', ext: ['doc', 'xls'] };
  if (eq(b, 4, [0x66, 0x74, 0x79, 0x70])) return { mime: 'video/mp4', kind: 'video', ext: ['mp4', 'mov', 'm4a'] };
  if (eq(b, 0, [0x1a, 0x45, 0xdf, 0xa3])) return { mime: 'video/webm', kind: 'video', ext: ['webm', 'mkv'] };
  if (eq(b, 0, [0x49, 0x44, 0x33]) || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return { mime: 'audio/mpeg', kind: 'audio', ext: ['mp3'] };
  if (eq(b, 0, [0x4f, 0x67, 0x67, 0x53])) return { mime: 'audio/ogg', kind: 'audio', ext: ['ogg'] };
  return null;
}

const DOC_MIME: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', doc: 'application/msword', xls: 'application/vnd.ms-excel',
  mov: 'video/quicktime', m4a: 'audio/mp4', mkv: 'video/x-matroska',
};
export const DEFAULT_KINDS: Record<string, Kind[]> = { file: ['pdf', 'image', 'doc'], image: ['image'] };

export function validateUpload(buf: Buffer, originalName: string, fieldType: string, config: any) {
  const s = sniff(buf);
  if (!s) throw new Error('Type de fichier non reconnu');
  const allowed: Kind[] = (config?.allowedTypes?.length ? config.allowedTypes : DEFAULT_KINDS[fieldType] ?? DEFAULT_KINDS.file) as Kind[];
  if (!allowed.includes(s.kind)) throw new Error('Type de fichier non autorisé pour ce champ');
  const ext = originalName.split('.').pop()?.toLowerCase() ?? '';
  if (!s.ext.includes(ext)) throw new Error("L'extension ne correspond pas au contenu du fichier");
  if (s.kind === 'doc') validateOffice(buf, ext);
  const maxMb = Math.min(Number(config?.maxSizeMb) || 5, 25);
  if (buf.length > maxMb * 1024 * 1024) throw new Error(`Fichier trop volumineux (max ${maxMb} Mo)`);
  return { ...s, mime: DOC_MIME[ext] ?? s.mime };
}
