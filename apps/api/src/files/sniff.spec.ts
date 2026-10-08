import { describe, expect, it } from 'vitest';
import { validateUpload } from './sniff';

const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(50)]);
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(50)]);
const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(60)]);

describe('validateUpload', () => {
  it('accepte un vrai PDF', () => expect(validateUpload(pdf, 'cv.pdf', 'file', {}).kind).toBe('pdf'));
  it('refuse un exécutable renommé en .pdf', () => expect(() => validateUpload(exe, 'cv.pdf', 'file', {})).toThrow());
  it('refuse une extension qui ne correspond pas au contenu', () => expect(() => validateUpload(png, 'photo.pdf', 'image', {})).toThrow(/extension/));
  it('respecte les types autorisés du champ', () => expect(() => validateUpload(pdf, 'a.pdf', 'image', {})).toThrow(/autorisé/));
  it('respecte la taille maximale', () => expect(() => validateUpload(Buffer.concat([pdf, Buffer.alloc(2 * 1024 * 1024)]), 'a.pdf', 'file', { maxSizeMb: 1 })).toThrow(/volumineux/));
});

// ---- Documents Office : structure réelle exigée (pas seulement l'extension) ----
const crc = () => 0;
function zip(names: string[], sizes?: Record<string, [number, number]>) { // ZIP minimal (annuaire central valide, sans données)
  const cds: Buffer[] = []; let local = 0;
  for (const n of names) {
    const nb = Buffer.from(n); const h = Buffer.alloc(46); h.writeUInt32LE(0x02014b50, 0); h.writeUInt32LE(crc(), 16);
    const [cs, us] = sizes?.[n] ?? [0, 0]; h.writeUInt32LE(cs, 20); h.writeUInt32LE(us, 24); h.writeUInt16LE(nb.length, 28); h.writeUInt32LE(local, 42);
    cds.push(h, nb);
  }
  const cd = Buffer.concat(cds); const e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(names.length, 8); e.writeUInt16LE(names.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(0, 16);
  return Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(30), cd, e]);
}
// L'annuaire commence après l'en-tête local factice (34 octets) : on recalcule l'offset réel.
const fix = (b: Buffer) => { const e = b.length - 22; b.writeUInt32LE(34, e + 16); return b; };
const docx = fix(zip(['[Content_Types].xml', 'word/document.xml']));

describe('documents Office', () => {
  it('accepte un vrai .docx', () => expect(validateUpload(docx, 'cv.docx', 'file', {}).kind).toBe('doc'));
  it('refuse un .docx renommé en .xlsx (partie principale absente)', () => expect(() => validateUpload(docx, 'cv.xlsx', 'file', {})).toThrow(/vrai document/));
  it('refuse un zip quelconque renommé en .docx', () => expect(() => validateUpload(fix(zip(['a.txt'])), 'x.docx', 'file', {})).toThrow(/Office/));
  it('refuse les macros VBA', () => expect(() => validateUpload(fix(zip(['[Content_Types].xml', 'word/document.xml', 'word/vbaProject.bin'])), 'x.docx', 'file', {})).toThrow(/macros/));
  it('refuse une bombe de décompression', () => expect(() => validateUpload(fix(zip(['[Content_Types].xml', 'word/document.xml'], { 'word/document.xml': [1000, 900_000_000] })), 'x.docx', 'file', {})).toThrow(/anormale/));
  it('refuse un .doc sans flux WordDocument', () => expect(() => validateUpload(Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0]), Buffer.alloc(200)]), 'x.doc', 'file', {})).toThrow(/vrai document/));
  it('accepte un .doc avec flux WordDocument, refuse avec macros', () => {
    const base = [Buffer.from([0xd0, 0xcf, 0x11, 0xe0]), Buffer.alloc(40), Buffer.from('WordDocument', 'utf16le')];
    expect(validateUpload(Buffer.concat(base), 'x.doc', 'file', {}).kind).toBe('doc');
    expect(() => validateUpload(Buffer.concat([...base, Buffer.from('_VBA_PROJECT', 'utf16le')]), 'x.doc', 'file', {})).toThrow(/macros/);
  });
});
