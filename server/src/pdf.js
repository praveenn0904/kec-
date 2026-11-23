import PDFDocument from 'pdfkit';
import { DEPARTMENTS } from './departments.js';

export const COLLEGE_NAME = 'KONGU Engineering College';
const M = 40; // page margin
const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e2e8f0';
const BRAND = '#312e81';
const GOOD = '#047857';
const WARN = '#b45309';
const BAD = '#b91c1c';

/**
 * Starts a PDF response: branded header on every page, page numbers added at the end.
 * Text is set in Helvetica, so names written in non-Latin scripts will not render.
 */
function createReport(res, { filename, title }) {
  const doc = new PDFDocument({
    size: 'A4',
    margin: M,
    bufferPages: true,
    info: { Title: `${COLLEGE_NAME} - ${title}`, Author: COLLEGE_NAME },
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);

  const ctx = { doc, redrawTableHead: null };

  const header = () => {
    doc.save();
    doc.rect(0, 0, doc.page.width, 58).fill(BRAND);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(16).text(COLLEGE_NAME, M, 15, { lineBreak: false });
    doc.font('Helvetica').fontSize(9).fillColor('#c7d2fe').text(title, M, 38, { lineBreak: false });
    doc.restore();
    doc.fillColor(INK).font('Helvetica').fontSize(10);
    doc.x = M;
    doc.y = 76;
  };
  header();
  doc.on('pageAdded', () => {
    header();
    ctx.redrawTableHead?.();
  });

  ctx.finish = () => {
    const range = doc.bufferedPageRange();
    const stamp = `Generated ${new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })} IST`;
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const bottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0; // allow writing inside the bottom margin without adding a page
      doc.font('Helvetica').fontSize(8).fillColor(MUTED);
      doc.text(stamp, M, doc.page.height - 30, { width: 300, lineBreak: false });
      doc.text(`Page ${i + 1} of ${range.count}`, doc.page.width - M - 100, doc.page.height - 30, { width: 100, align: 'right', lineBreak: false });
      doc.page.margins.bottom = bottom;
    }
    doc.end();
  };
  return ctx;
}

const spaceLeft = (doc) => doc.page.height - doc.page.margins.bottom - 24 - doc.y;

function heading(ctx, text, size = 12, needs = 90) {
  const { doc } = ctx;
  if (spaceLeft(doc) < needs) doc.addPage();
  doc.moveDown(0.4);
  doc.font('Helvetica-Bold').fontSize(size).fillColor(BRAND).text(text, M, doc.y, { width: doc.page.width - M * 2 });
  doc.moveDown(0.35);
  doc.font('Helvetica').fontSize(10).fillColor(INK);
}

function keyValues(ctx, pairs) {
  const { doc } = ctx;
  doc.font('Helvetica').fontSize(9.5).fillColor(INK);
  for (const [k, v] of pairs) {
    if (v === undefined || v === null || v === '') continue;
    const y = doc.y;
    doc.font('Helvetica-Bold').text(`${k}: `, M, y, { continued: true }).font('Helvetica').text(String(v));
  }
  doc.moveDown(0.4);
}

function note(ctx, text) {
  const { doc } = ctx;
  doc.font('Helvetica-Oblique').fontSize(9.5).fillColor(MUTED).text(text, M, doc.y, { width: doc.page.width - M * 2 });
  doc.font('Helvetica').fillColor(INK).moveDown(0.5);
}

/**
 * Draws a table whose cells wrap. Each column: { label, width, align?, value(row), color?(row) }.
 * The header row is repeated on every new page.
 */
function table(ctx, columns, rows) {
  const { doc } = ctx;
  const x0 = M;
  const width = columns.reduce((n, c) => n + c.width, 0);

  const drawHead = () => {
    const y = doc.y;
    const h = 22;
    doc.rect(x0, y, width, h).fill('#eef2ff');
    doc.fillColor('#334155').font('Helvetica-Bold').fontSize(7);
    let x = x0;
    for (const c of columns) {
      doc.text(c.label.toUpperCase(), x + 4, y + 8, { width: c.width - 8, align: c.align || 'left', lineBreak: false });
      x += c.width;
    }
    doc.y = y + h;
    doc.fillColor(INK).font('Helvetica').fontSize(9);
  };

  if (spaceLeft(doc) < 60) doc.addPage();
  ctx.redrawTableHead = drawHead;
  drawHead();

  rows.forEach((row, i) => {
    doc.font('Helvetica').fontSize(9);
    const cells = columns.map((c) => String(c.value(row) ?? ''));
    const h = Math.max(...cells.map((t, j) => doc.heightOfString(t, { width: columns[j].width - 12 }))) + 12;
    if (doc.y + h > doc.page.height - doc.page.margins.bottom - 24) doc.addPage(); // redraws the header row
    const y = doc.y;
    if (i % 2 === 1) doc.rect(x0, y, width, h).fill('#f8fafc');
    let x = x0;
    cells.forEach((t, j) => {
      const c = columns[j];
      doc.fillColor(c.color?.(row) || INK).font(c.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
      doc.text(t, x + 6, y + 6, { width: c.width - 12, align: c.align || 'left' });
      x += c.width;
    });
    doc.moveTo(x0, y + h).lineTo(x0 + width, y + h).lineWidth(0.5).strokeColor(LINE).stroke();
    doc.y = y + h;
  });

  ctx.redrawTableHead = null;
  doc.fillColor(INK).font('Helvetica').fontSize(10);
  doc.moveDown(0.6);
}

const pctColor = (p) => (p === null ? MUTED : p >= 85 ? GOOD : p >= 75 ? WARN : BAD);
const fmtPct = (p) => (p === null || p === undefined ? '-' : `${p}%`);
const fmtDay = (iso) => (iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '-');

// ------------------------------------------------------------------- attendance

export function attendancePdf(res, { rows, filters }) {
  const ctx = createReport(res, { filename: 'attendance-report.pdf', title: 'Attendance Report' });
  const { doc } = ctx;

  const withData = rows.filter((r) => r.percentage !== null);
  const avg = withData.length ? Math.round((withData.reduce((n, r) => n + r.percentage, 0) / withData.length) * 10) / 10 : null;
  const period = filters.from || filters.to ? `${filters.from ? fmtDay(filters.from) : 'start'} to ${filters.to ? fmtDay(filters.to) : 'today'}` : 'All recorded days';

  keyValues(ctx, [
    ['Department', filters.department || 'All departments'],
    ['Year', filters.year ? `Year ${filters.year}` : 'All years'],
    ['Section', filters.section ? `Section ${filters.section}` : 'All sections'],
    ['Date range', period],
    ['Filter', filters.below ? `Below ${filters.below}% only` : ''],
    ['Students', rows.length],
    ['Average attendance', fmtPct(avg)],
    ['Below 75%', rows.filter((r) => r.percentage !== null && r.percentage < 75).length],
  ]);
  note(ctx, 'Each class period is one record. On-duty periods (approved requests) count as present. Colours: green 85% and above, amber 75-84%, red below 75%.');

  if (!rows.length) {
    note(ctx, 'No students match these filters.');
    return ctx.finish();
  }

  const columns = [
    { label: 'Roll no', width: 76, value: (r) => r.rollNumber },
    { label: 'Name', width: 138, value: (r) => r.name, bold: true },
    { label: 'Year', width: 34, align: 'center', value: (r) => r.year },
    { label: 'Sec', width: 30, align: 'center', value: (r) => r.section },
    { label: 'Periods', width: 46, align: 'center', value: (r) => r.total },
    { label: 'Present', width: 52, align: 'center', value: (r) => r.present },
    { label: 'On duty', width: 50, align: 'center', value: (r) => r.od },
    { label: 'Absent', width: 50, align: 'center', value: (r) => r.absent },
    { label: '%', width: 50, align: 'right', value: (r) => fmtPct(r.percentage), color: (r) => pctColor(r.percentage), bold: true },
  ];

  // One table per year, in section order.
  const years = [...new Set(rows.map((r) => r.year))].sort((a, b) => a - b);
  for (const year of years) {
    const group = rows.filter((r) => r.year === year);
    heading(ctx, `Year ${year} - ${group.length} student${group.length === 1 ? '' : 's'}`);
    table(ctx, columns, group);
  }
  return ctx.finish();
}

// ------------------------------------------------------------------- placements

const scoreText = (drive, rec) => {
  const parts = Object.keys(rec.scores || {})
    .map(Number)
    .sort((a, b) => a - b)
    .map((k) => `R${k}: ${rec.scores[k]}`);
  return parts.length ? parts.join('  ') : '-';
};

export const resultText = (drive, rec) => {
  if (rec.status === 'selected') return 'Selected';
  if (rec.status === 'eliminated') return `Eliminated in Round ${rec.eliminatedRound} (${drive.rounds[rec.eliminatedRound - 1] || ''})`;
  return 'In progress';
};

/** sections: [{ drive, counts, participants: [{ student, rec }] }] */
export function placementsPdf(res, { sections, filters }) {
  const ctx = createReport(res, { filename: 'placement-report.pdf', title: 'Placement Report' });
  const { doc } = ctx;

  const selectedTotal = new Set(
    sections.flatMap((s) => s.participants.filter((p) => p.rec.status === 'selected').map((p) => p.student.id))
  ).size;

  keyValues(ctx, [
    ['Drives', sections.length],
    ['Department', filters.department || 'All departments'],
    ['Students selected', selectedTotal],
  ]);

  if (!sections.length) {
    note(ctx, 'No placement drives to report.');
    return ctx.finish();
  }

  heading(ctx, 'Summary of drives', 12, 120);
  table(
    ctx,
    [
      { label: 'Company', width: 106, value: (s) => s.drive.company, bold: true },
      { label: 'Role', width: 90, value: (s) => s.drive.role },
      { label: 'Drive date', width: 70, value: (s) => fmtDay(s.drive.driveDate) },
      { label: 'Eligible', width: 50, align: 'center', value: (s) => s.counts.eligible },
      { label: 'Opted in', width: 48, align: 'center', value: (s) => s.counts.optedIn },
      { label: 'Opted out', width: 50, align: 'center', value: (s) => s.counts.optedOut },
      { label: 'No reply', width: 46, align: 'center', value: (s) => s.counts.noResponse },
      { label: 'Selected', width: 48, align: 'center', value: (s) => s.counts.selected, color: () => GOOD, bold: true },
    ],
    sections
  );

  for (const s of sections) {
    const { drive } = s;
    heading(ctx, `${drive.company} - ${drive.role}`, 12, 150);
    keyValues(ctx, [
      ['Package', drive.ctc ? `${drive.ctc} LPA` : ''],
      ['Location', drive.location],
      ['Drive date', fmtDay(drive.driveDate)],
      ['Last date to respond', fmtDay(drive.deadline)],
      ['Status', drive.status === 'open' ? 'Open' : 'Closed'],
      ['Rounds', drive.rounds.map((n, i) => `${i + 1}. ${n}`).join('   ')],
      ['Eligible departments', drive.eligibleDepartments.length ? drive.eligibleDepartments.join(', ') : 'All departments'],
    ]);
    if (!s.participants.length) {
      note(ctx, 'No students opted in to this drive.');
      continue;
    }
    table(
      ctx,
      [
        { label: 'Roll no', width: 78, value: (p) => p.student.rollNumber },
        { label: 'Name', width: 112, value: (p) => p.student.name, bold: true },
        { label: 'Department', width: 125, value: (p) => p.student.department },
        { label: 'Result', width: 120, value: (p) => resultText(drive, p.rec), color: (p) => (p.rec.status === 'selected' ? GOOD : p.rec.status === 'eliminated' ? BAD : MUTED) },
        { label: 'Round scores (out of 100)', width: 80, value: (p) => scoreText(drive, p.rec) },
      ],
      s.participants
    );
  }
  return ctx.finish();
}
