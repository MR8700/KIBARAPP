/**
 * Validation structurelle des documents Office (sans dépendance) :
 * - OOXML (docx/xlsx/pptx) = archive ZIP : on lit l'annuaire central, on vérifie [Content_Types].xml et la partie principale
 *   correspondant à l'extension, on refuse macros VBA / ActiveX / chemins suspects et les « bombes » ZIP.
 * - OLE (doc/xls) : on vérifie le flux principal attendu et on refuse les macros VBA.
 * L'antivirus reste la défense complémentaire ; ceci écarte les fichiers qui ne sont pas de vrais documents.
 */
const MAX_ENTRIES = 5000, MAX_UNCOMPRESSED = 500 * 1024 * 1024, MAX_RATIO = 200;
const MAIN: Record<string, string> = { docx: 'word/document.xml', xlsx: 'xl/workbook.xml', pptx: 'ppt/presentation.xml' };

export function zipEntries(b: Buffer): { name: string; size: number; csize: number }[] {
  const min = Math.max(0, b.length - 22 - 65_535);
  let eocd = -1;
  for (let i = b.length - 22; i >= min; i--) if (b.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Document Office corrompu (archive illisible)');
  const count = b.readUInt16LE(eocd + 10); let off = b.readUInt32LE(eocd + 16);
  if (count > MAX_ENTRIES) throw new Error('Document Office invalide (trop de parties)');
  const out: { name: string; size: number; csize: number }[] = [];
  for (let i = 0; i < count; i++) {
    if (off + 46 > b.length || b.readUInt32LE(off) !== 0x02014b50) throw new Error('Document Office corrompu (annuaire invalide)');
    const csize = b.readUInt32LE(off + 20), size = b.readUInt32LE(off + 24), n = b.readUInt16LE(off + 28), m = b.readUInt16LE(off + 30), k = b.readUInt16LE(off + 32);
    if (off + 46 + n > b.length) throw new Error('Document Office corrompu (annuaire invalide)');
    out.push({ name: b.toString('utf8', off + 46, off + 46 + n), size, csize });
    off += 46 + n + m + k;
  }
  return out;
}

export function validateOffice(buf: Buffer, ext: string) {
  if (ext === 'docx' || ext === 'xlsx' || ext === 'pptx') {
    const es = zipEntries(buf); const names = new Set(es.map((e) => e.name));
    if (!names.has('[Content_Types].xml')) throw new Error("Ce fichier n'est pas un document Office valide");
    if (!names.has(MAIN[ext])) throw new Error(`Ce fichier n'est pas un vrai document .${ext}`);
    if (es.some((e) => e.name.startsWith('/') || e.name.includes('..') || e.name.includes('\\'))) throw new Error('Document Office refusé (chemin suspect)');
    if (es.some((e) => /vbaProject\.bin$/i.test(e.name) || /(^|\/)activeX\//i.test(e.name))) throw new Error('Document refusé : il contient des macros ou des contrôles ActiveX');
    const total = es.reduce((s, e) => s + e.size, 0);
    if (total > MAX_UNCOMPRESSED || es.some((e) => e.csize > 0 && e.size / e.csize > MAX_RATIO && e.size > 1_000_000)) throw new Error('Document Office refusé (taille décompressée anormale)');
    return;
  }
  if (ext === 'doc' || ext === 'xls') {
    const u = (s: string) => buf.includes(Buffer.from(s, 'utf16le'));
    const ok = ext === 'doc' ? u('WordDocument') : u('Workbook') || u('Book');
    if (!ok) throw new Error(`Ce fichier n'est pas un vrai document .${ext}`);
    if (u('_VBA_PROJECT') || u('VBA') && u('Macros')) throw new Error('Document refusé : il contient des macros');
    return;
  }
  throw new Error('Type de document non pris en charge');
}
