import { Workbook } from 'exceljs';
import PDFDocument from 'pdfkit';
import { Col, AppRow, FieldRow, cell, dateOf } from './table';

export async function renderXlsx(title: string, cols: Col[], rows: AppRow[], fields: FieldRow[]): Promise<Buffer> {
  const wb = new Workbook(); wb.creator = 'KIBAR'; wb.created = new Date();
  const ws = wb.addWorksheet('Retenus', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = cols.map((c) => ({
    header: c.label, key: c.key,
    width: Math.min(50, Math.max(c.label.length, ...rows.slice(0, 200).map((r) => cell(c, r, fields).length), 10) + 2),
    style: { alignment: { vertical: 'top', wrapText: true }, ...(c.kind === 'date' ? { numFmt: 'dd/mm/yyyy hh:mm' } : {}) },
  }));
  for (const r of rows) ws.addRow(Object.fromEntries(cols.map((c) => [c.key, c.kind === 'date' ? dateOf(c, r) : cell(c, r, fields)])));
  const h = ws.getRow(1); h.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  wb.title = title;
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// Polices PDF standard (WinAnsi) : on remplace ce qu'elles ne savent pas afficher.
const pdfSafe = (s: string) => s.replace(/[^\u0020-\u007E\u00A0-\u00FF\u2018\u2019\u201C\u201D\u2013\u2014\u2026\u20AC\u2022\n]/g, '?');

export function renderPdf(title: string, subtitle: string, cols: Col[], rows: AppRow[], fields: FieldRow[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 28, bufferPages: true, info: { Title: title, Producer: 'KIBAR' } });
    const chunks: Buffer[] = []; doc.on('data', (c: Buffer) => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
    const W = doc.page.width - 56, bottom = doc.page.height - 44, pad = 4, FS = 8;
    const data = rows.map((r) => cols.map((c) => pdfSafe(cell(c, r, fields)).slice(0, 200)));
    // largeur proportionnelle au contenu, bornée
    const wgt = cols.map((c, i) => Math.min(30, Math.max(8, c.label.length, ...data.slice(0, 60).map((d) => d[i].length))));
    const tot = wgt.reduce((a, b) => a + b, 0), widths = wgt.map((w) => (w / tot) * W);

    doc.font('Helvetica-Bold').fontSize(15).fillColor('#0F172A').text(pdfSafe(title), 28, 28);
    doc.font('Helvetica').fontSize(9).fillColor('#64748B').text(pdfSafe(subtitle), 28, doc.y + 2);
    let y = doc.y + 12;

    const rowH = (cells: string[], bold: boolean) => Math.max(...cells.map((t, i) => doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(FS).heightOfString(t || ' ', { width: widths[i] - pad * 2 }))) + pad * 2;
    const drawRow = (cells: string[], bold: boolean, fill?: string) => {
      const h = rowH(cells, bold); let x = 28;
      if (fill) doc.rect(28, y, W, h).fill(fill);
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(FS).fillColor(bold ? '#FFFFFF' : '#0F172A');
      cells.forEach((t, i) => { doc.text(t, x + pad, y + pad, { width: widths[i] - pad * 2, lineBreak: true }); x += widths[i]; });
      doc.moveTo(28, y + h).lineTo(28 + W, y + h).lineWidth(0.4).strokeColor('#E2E8F0').stroke();
      y += h;
    };
    const head = cols.map((c) => pdfSafe(c.label));
    drawRow(head, true, '#1D4ED8');
    data.forEach((d, n) => {
      if (y + rowH(d, false) > bottom) { doc.addPage(); y = 28; drawRow(head, true, '#1D4ED8'); }
      drawRow(d, false, n % 2 ? '#F8FAFC' : '#FFFFFF');
    });
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i); doc.page.margins.bottom = 0; // évite l'ajout automatique d'une page par le pied de page
      doc.font('Helvetica').fontSize(8).fillColor('#64748B').text(`KIBAR · page ${i + 1}/${range.count}`, 28, doc.page.height - 28, { width: W, align: 'right', lineBreak: false });
    }
    doc.end();
  });
}
