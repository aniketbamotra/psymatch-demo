// In-app PDFKit renderer for the AI clinical reports — the replacement for the
// Chromium HTML→PDF service (pdf.psymatch.ca). One entrypoint, four formats:
//
//   comprehensive / concise  → buildReportData() shape (the canonical `data`)
//   referral                 → buildLetterData() shape (business letter)
//   patient_summary          → buildPatientSummaryData() shape (warm summary)
//
// Pure-ish: imports only 'pdfkit', the relative theme module, and the embedded
// asset Buffers (no $env/$app/$lib, no filesystem) so it is node-testable AND
// route-importable. Fonts + logo are base64-embedded in ./embeddedAssets.js —
// SvelteKit does NOT ship static/ into the Vercel serverless function, so reading
// them from disk 500s in production; embedding makes them travel in the bundle.
//
// Footer pattern (two-pass bufferPages + switchToPage) is copied from
// sotBasedPdfGenerator.js.

import PDFDocument from 'pdfkit';
import { themeFor, REPORT_STYLE, identificationRows, reportSubtitle } from '../aiReportTheme.js';
import { FONTS, LOGO } from './embeddedAssets.js';

const FOOTER_HEIGHT = REPORT_STYLE.footer.top;


// ─── Public entrypoint ──────────────────────────────────────────────────────

/**
 * @param {object} data    Output of buildReportData / buildLetterData / buildPatientSummaryData.
 * @param {object} opts
 * @param {'comprehensive'|'concise'|'referral'|'patient_summary'} opts.format
 * @param {'en'|'fr'} [opts.language]
 * @returns {Promise<Buffer>}
 */
export async function renderAiPdf(data, { format, language } = {}) {
	const theme = themeFor(format);

	return new Promise((resolve, reject) => {
		const doc = new PDFDocument({
			size: theme.page.size,
			margins: { ...theme.margins },
			bufferPages: true,
			info: {
				Title: data?.meta?.title || theme.title,
				Author: 'PsyMatch',
				Creator: 'psymatch-vercel',
				Producer: 'pdfkit',
				CreationDate: new Date()
			}
		});

		const chunks = [];
		doc.on('data', (c) => chunks.push(c));
		doc.on('end', () => resolve(Buffer.concat(chunks)));
		doc.on('error', reject);

		const fonts = registerFonts(doc);
		const logo = loadLogo();
		const ctx = { doc, fonts, theme, logo, format, language };

		try {
			if (format === 'referral') {
				renderLetter(ctx, data);
			} else if (format === 'patient_summary') {
				renderSummary(ctx, data);
			} else {
				renderReport(ctx, data);
			}
		} catch (err) {
			reject(err);
			return;
		}

		stampFooters(doc, theme, fonts);
		doc.end();
	});
}

// ─── Fonts ──────────────────────────────────────────────────────────────────

// Register Inter (embedded Buffers) under stable aliases. On any failure (bad
// buffer, fontkit error) fall back to the built-in Helvetica family so the
// render still succeeds. Returns the alias map the renderers reference.
function registerFonts(doc) {
	// Body prose across every template is Georgia serif; headings/labels are sans.
	// PDFKit's built-in Times family gives us a serif with no vendored files.
	const serif = { serif: 'Times-Roman', serifBold: 'Times-Bold', serifItalic: 'Times-Italic' };
	const inter = {
		regular: 'Inter',
		medium: 'Inter-Medium',
		semibold: 'Inter-SemiBold',
		bold: 'Inter-Bold',
		italic: 'Inter-Italic',
		...serif
	};
	const helvetica = {
		regular: 'Helvetica',
		medium: 'Helvetica',
		semibold: 'Helvetica-Bold',
		bold: 'Helvetica-Bold',
		italic: 'Helvetica-Oblique',
		...serif
	};
	try {
		doc.registerFont(inter.regular, FONTS.regular);
		doc.registerFont(inter.medium, FONTS.medium);
		doc.registerFont(inter.semibold, FONTS.semibold);
		doc.registerFont(inter.bold, FONTS.bold);
		doc.registerFont(inter.italic, FONTS.italic);
		// registerFont is LAZY — fontkit only parses the buffer when the font is
		// first used. Force each to parse now so a bad asset falls back to
		// Helvetica here instead of throwing mid-render (which would 500).
		for (const name of [inter.regular, inter.medium, inter.semibold, inter.bold, inter.italic]) {
			doc.font(name);
		}
		return inter;
	} catch (err) {
		console.error('[aiReportPdf] Inter registration failed; using Helvetica:', err?.message);
		return helvetica;
	}
}

function loadLogo() {
	return LOGO ?? null;
}

// ─── Geometry helpers ───────────────────────────────────────────────────────

function contentLeft(doc) {
	return doc.page.margins.left;
}
function contentWidth(doc) {
	return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}
function contentBottom(doc) {
	return doc.page.height - doc.page.margins.bottom;
}
// Add a page if the next block of `needed` points would overflow the body.
function ensureSpace(doc, needed) {
	if (doc.y + needed > contentBottom(doc)) doc.addPage();
}

const txt = (v) => String(v ?? '').trim();

// Accent- and case-insensitive, so FR titles ("Ouverture") match like EN ones.
const norm = (v) =>
	String(v ?? '')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.trim();

// The patient summary's first section is the opening: the reference renders it
// bare — flowing straight from the subtitle, with no gold rule and no heading.
function isOpeningSection(section, i) {
	return i === 0 && /^(opening|ouverture|introduction)\b/.test(norm(section?.title));
}
const arr = (v) => (Array.isArray(v) ? v.filter((x) => txt(x)) : v ? [String(v)] : []);

// ─── Shared primitives ──────────────────────────────────────────────────────

// Body prose. Serif (Georgia→Times) by default, matching every report template;
// pass serif:false for the rare sans body line.
function paragraphs(ctx, list, { size = REPORT_STYLE.size.body, align = 'justify', color, italic = false, gap = 0.5, serif = true } = {}) {
	const { doc, fonts, theme } = ctx;
	const font = serif
		? italic
			? fonts.serifItalic || fonts.italic
			: fonts.serif || fonts.regular
		: italic
			? fonts.italic
			: fonts.regular;
	for (const p of arr(list)) {
		ensureSpace(doc, size + 6);
		doc
			.font(font)
			.fontSize(size)
			.fillColor(color || theme.palette.ink)
			.text(txt(p), contentLeft(doc), doc.y, { width: contentWidth(doc), align, lineGap: REPORT_STYLE.lineGap });
		doc.moveDown(gap);
	}
}

// Measure a string's rendered height at a given font/size/width.
function measure(doc, font, size, str, width) {
	doc.font(font).fontSize(size);
	return doc.heightOfString(txt(str), { width });
}

// Section heading — matches the template h2: "N. Title" all in the heading
// (deep-teal) color at 14pt, with a light-teal (accent) underline rule.
function sectionHeading(ctx, num, title) {
	const { doc, fonts, theme } = ctx;
	ensureSpace(doc, 42);
	doc.moveDown(0.6);
	const x = contentLeft(doc);
	const y = doc.y;
	doc
		.font(fonts.semibold)
		.fontSize(REPORT_STYLE.size.h2)
		.fillColor(theme.palette.heading)
		.text(`${num}. ${txt(title)}`, x, y, { width: contentWidth(doc) });
	const ruleY = doc.y + 3;
	doc
		.strokeColor(theme.palette.accent)
		.lineWidth(1.5)
		.moveTo(x, ruleY)
		.lineTo(x + contentWidth(doc), ruleY)
		.stroke();
	doc.y = ruleY + 8;
	doc.x = x;
}

// A simple H1 (used by letter + summary).
function h1(ctx, title, { color, size = 20, align = 'left' } = {}) {
	const { doc, fonts, theme } = ctx;
	doc
		.font(fonts.bold)
		.fontSize(size)
		.fillColor(color || theme.palette.heading)
		.text(txt(title), contentLeft(doc), doc.y, { width: contentWidth(doc), align });
	doc.moveDown(0.3);
}

// Filled tinted box with an accent left bar; `render(innerX, innerY, innerW)`
// draws the contents, having been measured to height `h`.
function tintBox(ctx, h, render, { fill, bar, pad = 12, topRule = false, bottomRule = false } = {}) {
	const { doc, theme } = ctx;
	ensureSpace(doc, h + 10);
	const x = contentLeft(doc);
	const w = contentWidth(doc);
	const y = doc.y;
	if (fill) {
		doc.save();
		doc.rect(x, y, w, h).fillColor(fill).fill();
		doc.restore();
	}
	if (bar) {
		doc.save();
		doc.rect(x, y, 3, h).fillColor(bar).fill();
		doc.restore();
	}
	if (topRule) {
		doc.strokeColor(theme.palette.accent).lineWidth(1.4).moveTo(x, y).lineTo(x + w, y).stroke();
	}
	if (bottomRule) {
		doc
			.strokeColor(theme.palette.accent)
			.lineWidth(1.4)
			.moveTo(x, y + h)
			.lineTo(x + w, y + h)
			.stroke();
	}
	render(x + pad, y + pad, w - pad * 2);
	doc.x = x;
	doc.y = y + h;
	doc.moveDown(0.6);
}

// Inline pill chips (e.g. DSM / ICD / Severity). Returns the height consumed.
function chips(ctx, items, x, y, maxW) {
	const { doc, fonts, theme } = ctx;
	const list = items.filter(Boolean).map(txt);
	const size = 8;
	const padX = 6;
	const chipH = 15;
	const gap = 6;
	let cx = x;
	let cy = y;
	doc.font(fonts.medium).fontSize(size);
	for (const label of list) {
		const tw = doc.widthOfString(label);
		const cw = tw + padX * 2;
		if (cx + cw > x + maxW) {
			cx = x;
			cy += chipH + gap;
		}
		doc.save();
		doc.roundedRect(cx, cy, cw, chipH, 3).fillColor(theme.palette.tint || '#F2F2F2').fill();
		doc.restore();
		doc
			.fillColor(theme.palette.deep || theme.palette.heading)
			.text(label, cx + padX, cy + 3.5, { lineBreak: false });
		cx += cw + gap;
	}
	return cy + chipH - y;
}

// Dot-bullet list with optional bold lead label per bullet.
function bulletList(ctx, items, x, y, w, { labeled = false, size = 9.5, color } = {}) {
	const { doc, fonts, theme } = ctx;
	let cy = y;
	for (const item of items) {
		const dotY = cy + size * 0.45;
		doc.save();
		doc.circle(x + 2, dotY, 1.6).fillColor(theme.palette.accent).fill();
		doc.restore();
		const tx = x + 10;
		const tw = w - 10;
		if (labeled && item && typeof item === 'object') {
			doc.font(fonts.semibold).fontSize(size).fillColor(theme.palette.deep || theme.palette.heading);
			doc.text(txt(item.label) + (item.label ? ': ' : ''), tx, cy, { continued: true });
			doc.font(fonts.regular).fillColor(color || theme.palette.ink).text(txt(item.text), { width: tw });
		} else {
			doc.font(fonts.regular).fontSize(size).fillColor(color || theme.palette.ink).text(txt(item), tx, cy, { width: tw });
		}
		cy = doc.y + 4;
	}
	return cy - y;
}

// ─── Masthead / meta (comprehensive + concise) ──────────────────────────────

function masthead(ctx, data) {
	const { doc, fonts, theme, logo } = ctx;
	const x = contentLeft(doc);
	const w = contentWidth(doc);
	const top = doc.y;
	const meta = data?.meta || {};

	// Logo top-right.
	if (logo) {
		try {
			doc.image(logo, x + w - 110, top, { width: 110 });
		} catch {
			/* ignore */
		}
	}

	// Eyebrow — muted uppercase (matches template .confidential).
	doc
		.font(fonts.semibold)
		.fontSize(REPORT_STYLE.size.eyebrow)
		.fillColor(theme.palette.muted)
		.text(txt(meta.eyebrow) || theme.eyebrow, x, top, { width: w - 120, characterSpacing: 1.2 });
	doc.moveDown(0.35);
	// Title (deep-teal h1), wraps.
	doc
		.font(fonts.bold)
		.fontSize(REPORT_STYLE.size.h1)
		.fillColor(theme.palette.heading)
		.text(txt(meta.title) || theme.title, x, doc.y, { width: w - 120 });
	doc.moveDown(0.4);
	// Patient line — bold: "Patient: <name>  ·  ID <id>".
	doc
		.font(fonts.bold)
		.fontSize(12)
		.fillColor(theme.palette.ink)
		.text(`Patient: ${txt(meta.patient) || 'Patient'}   ·   ID ${txt(meta.patientId) || '—'}`, x, doc.y, { width: w });
	doc.moveDown(0.25);
	// Subtitle — muted.
	doc
		.font(fonts.regular)
		.fontSize(REPORT_STYLE.size.small)
		.fillColor(theme.palette.muted)
		.text(
			reportSubtitle(meta),
			x,
			doc.y,
			{ width: w - 30, lineGap: 1.5 }
		);
	doc.moveDown(0.9);
	doc.x = x;
}

function metaRow(ctx, pairs) {
	const { doc, fonts, theme } = ctx;
	const x = contentLeft(doc);
	const w = contentWidth(doc);
	const cols = pairs.length;
	const colW = w / cols;
	const y = doc.y;
	let maxBottom = y;
	pairs.forEach(([label, value], i) => {
		const cx = x + i * colW;
		doc.font(fonts.medium).fontSize(7).fillColor(theme.palette.muted).text(String(label).toUpperCase(), cx, y, {
			width: colW - 8,
			characterSpacing: 0.8
		});
		doc.font(fonts.semibold).fontSize(10).fillColor(theme.palette.ink).text(txt(value) || '—', cx, doc.y + 1, {
			width: colW - 8
		});
		maxBottom = Math.max(maxBottom, doc.y);
	});
	doc.x = x;
	doc.y = maxBottom;
}

// ─── Comprehensive / concise body ───────────────────────────────────────────

function renderReport(ctx, data) {
	const { doc, fonts, theme } = ctx;
	masthead(ctx, data);

	// 01 Identification — Field | Details bordered table.
	sectionHeading(ctx, 1, 'Patient Identification');
	identificationTable(ctx, data);

	// 02 Interviews — serif prose "Interviews completed: …".
	sectionHeading(ctx, 2, 'PsyMatch Assessment');
	interviewsProse(ctx, data.interviews || []);

	// 03 Clinical Snapshot — box with the section title inside + bulleted content.
	const snapshot = (data.snapshot || []).filter((s) => txt(s?.label) || txt(s?.text));
	if (snapshot.length) snapshotSection(ctx, snapshot);

	// 04 Clinical Summary — narrative. The product name is deliberately absent:
	// only §2 carries "PsyMatch" as branding (2026-07-28 review).
	sectionHeading(ctx, 4, 'Clinical Summary');
	paragraphs(ctx, data.clinicalSummary);

	// 05 History — narrative.
	sectionHeading(ctx, 5, 'Autobiographical & Psychosocial History');
	paragraphs(ctx, data.history);

	// 06 Risk — box (lead + bullets + narrative).
	sectionHeading(ctx, 6, 'Risk Assessment');
	riskBox(ctx, data.risk || {});

	// 07 Diagnostic — primary card + comorbid cards + subthreshold + disclaimer.
	sectionHeading(ctx, 7, 'Diagnostic Considerations');
	diagnosticBlock(ctx, data.diagnostic || {});

	// 08 Case Conceptualization — narrative.
	sectionHeading(ctx, 8, 'Case Conceptualization');
	paragraphs(ctx, data.caseConceptualization);

	// 09 Treatment — phase blocks.
	sectionHeading(ctx, 9, 'Treatment Rationale');
	treatmentBlocks(ctx, data.treatment || []);
	if (data.treatmentReference?.rows?.length) treatmentReferenceTable(ctx, data.treatmentReference);

	// 10 Medication — narrative, then the fixed medication statement (once).
	sectionHeading(ctx, 10, 'Medication Considerations');
	paragraphs(ctx, data.medication);
	if (txt(data.medicationStatement)) {
		doc.moveDown(0.1);
		doc
			.font(fonts.italic)
			.fontSize(8)
			.fillColor(theme.palette.muted)
			.text(txt(data.medicationStatement), contentLeft(doc), doc.y, { width: contentWidth(doc), align: 'left', lineGap: 1.5 });
		doc.moveDown(0.4);
	}

	// 11 Prognosis — narrative + italic closing.
	sectionHeading(ctx, 11, 'Prognosis');
	paragraphs(ctx, data.prognosis?.body);
	if (txt(data.prognosis?.closing)) {
		doc.moveDown(0.1);
		doc
			.font(fonts.italic)
			.fontSize(10)
			.fillColor(theme.palette.deep || theme.palette.heading)
			.text(txt(data.prognosis.closing), contentLeft(doc), doc.y, { width: contentWidth(doc), align: 'left' });
	}
}

// Patient Identification — a bordered "Field | Details" table (template .patient-table):
// header row in teal-grey, first column bold on a faint tint, Inter throughout.
function identificationTable(ctx, data) {
	const { doc, fonts, theme } = ctx;
	const rows = identificationRows(data);

	const x = contentLeft(doc);
	const w = contentWidth(doc);
	const c1 = Math.round(w * 0.32); // Field column
	const c2 = w - c1; // Details column
	const padX = 8;
	const padY = 5;
	const fSize = 10;

	const row = (label, value, header = false) => {
		doc.font(fonts.regular).fontSize(fSize);
		const rowH =
			Math.max(
				doc.heightOfString(txt(label), { width: c1 - padX * 2 }),
				doc.heightOfString(txt(value), { width: c2 - padX * 2 })
			) +
			padY * 2;
		ensureSpace(doc, rowH + 2);
		const y = doc.y;
		// Cell fills.
		doc.save();
		if (header) doc.rect(x, y, w, rowH).fillColor('#DCE8E6').fill();
		else doc.rect(x, y, c1, rowH).fillColor('#FAFBFB').fill();
		doc.restore();
		// Grid borders.
		doc.strokeColor(theme.palette.rule).lineWidth(0.75);
		doc.rect(x, y, c1, rowH).stroke();
		doc.rect(x + c1, y, c2, rowH).stroke();
		// Text.
		doc
			.font(fonts.semibold)
			.fontSize(fSize)
			.fillColor(header ? theme.palette.deep : theme.palette.ink)
			.text(txt(label), x + padX, y + padY, { width: c1 - padX * 2 });
		doc
			.font(header ? fonts.semibold : fonts.regular)
			.fontSize(fSize)
			.fillColor(header ? theme.palette.deep : theme.palette.ink)
			.text(txt(value), x + c1 + padX, y + padY, { width: c2 - padX * 2 });
		doc.x = x;
		doc.y = y + rowH;
	};

	row('Field', 'Details', true);
	for (const [label, value] of rows) row(label, value);
	doc.moveDown(0.6);
	doc.x = x;
}

// PsyMatch Assessment — serif prose: "Interviews completed: A, B, and C." (bold lead).
function interviewsProse(ctx, interviews) {
	const { doc, fonts, theme } = ctx;
	const list = (interviews || []).map(txt).filter(Boolean);
	const x = contentLeft(doc);
	if (!list.length) {
		paragraphs(ctx, ['No structured interviews were recorded for this assessment.'], { align: 'left' });
		return;
	}
	const joined =
		list.length === 1
			? list[0]
			: list.slice(0, -1).join(', ') + (list.length > 2 ? ',' : '') + ' and ' + list[list.length - 1];
	doc
		.font(fonts.serifBold || fonts.bold)
		.fontSize(10)
		.fillColor(theme.palette.ink)
		.text('Interviews completed: ', x, doc.y, { continued: true });
	doc
		.font(fonts.serif || fonts.regular)
		.fillColor(theme.palette.ink)
		.text(joined + '.', { width: contentWidth(doc), align: 'justify', lineGap: REPORT_STYLE.lineGap });
	doc.moveDown(0.5);
	doc.x = x;
}

// Clinical Snapshot — a soft-grey box with light-teal top/bottom rules; the section
// title lives INSIDE the box (template .snapshot), followed by bold-label bullets.
function snapshotSection(ctx, snapshot) {
	const { doc, fonts, theme } = ctx;
	const w = contentWidth(doc);
	const pad = 12;
	const innerW = w - pad * 2;
	const titleH = 16;
	let bodyH = titleH + 8;
	for (const s of snapshot) {
		const lead = txt(s.label) ? txt(s.label) + ': ' : '';
		bodyH += measure(doc, fonts.regular, 9.8, lead + txt(s.text), innerW - 10) + 5;
	}
	const h = pad + bodyH + pad - 5;
	tintBox(
		ctx,
		h,
		(ix, iy, iw) => {
			doc
				.font(fonts.semibold)
				.fontSize(12)
				.fillColor(theme.palette.deep)
				.text('3. Clinical Snapshot'.toUpperCase(), ix, iy, { width: iw, characterSpacing: 0.5 });
			const by = doc.y + 6;
			bulletList(ctx, snapshot, ix, by, iw, { labeled: true, size: 9.8 });
		},
		{ fill: theme.palette.tint, topRule: true, bottomRule: true, pad }
	);
}

function identificationGrid(ctx, id) {
	const { doc, fonts, theme } = ctx;
	const fields = [
		['Age', id.age],
		['Gender', id.gender],
		['Marital Status', id.maritalStatus],
		['Occupation', id.occupation],
		['Education', id.education],
		['Prior Psychotherapy', id.priorPsychotherapy],
		['Medications', id.medications],
		['Substance Use', id.substanceUse],
		['Principal Concerns', id.primaryConcerns]
	].filter(([, v]) => txt(v));

	const x = contentLeft(doc);
	const w = contentWidth(doc);
	const colGap = 20;
	const colW = (w - colGap) / 2;
	const labelSize = 7;
	const valSize = 9.5;

	let i = 0;
	while (i < fields.length) {
		const rowFields = fields.slice(i, i + 2);
		// Measure row height.
		let rowH = 0;
		rowFields.forEach(([, v]) => {
			const vh = measure(doc, fonts.regular, valSize, v, colW);
			rowH = Math.max(rowH, labelSize + 3 + vh);
		});
		ensureSpace(doc, rowH + 8);
		const y = doc.y;
		rowFields.forEach(([label, v], j) => {
			const cx = x + j * (colW + colGap);
			doc.font(fonts.medium).fontSize(labelSize).fillColor(theme.palette.muted).text(String(label).toUpperCase(), cx, y, {
				width: colW,
				characterSpacing: 0.6
			});
			doc.font(fonts.regular).fontSize(valSize).fillColor(theme.palette.ink).text(txt(v), cx, y + labelSize + 2, {
				width: colW
			});
		});
		doc.x = x;
		doc.y = y + rowH + 8;
		i += 2;
	}
}

function interviewsBlock(ctx, interviews) {
	const { doc } = ctx;
	const list = (interviews || []).map(txt).filter(Boolean);
	if (!list.length) {
		paragraphs(ctx, ['No structured interviews recorded.'], { align: 'left', size: 9.5 });
		return;
	}
	const x = contentLeft(doc);
	const w = contentWidth(doc);
	let cx = x;
	let cy = doc.y;
	const { fonts, theme } = ctx;
	const size = 8.5;
	const padX = 8;
	const chipH = 18;
	const gap = 6;
	doc.font(fonts.medium).fontSize(size);
	for (const label of list) {
		const tw = doc.widthOfString(label);
		const cw = tw + padX * 2;
		if (cx + cw > x + w) {
			cx = x;
			cy += chipH + gap;
		}
		ensureSpace(doc, chipH + gap);
		doc.save();
		doc.roundedRect(cx, cy, cw, chipH, 4).fillColor(theme.palette.tint || '#F2F2F2').strokeColor(theme.palette.rule).lineWidth(0.5).fillAndStroke();
		doc.restore();
		doc.font(fonts.medium).fontSize(size).fillColor(theme.palette.deep || theme.palette.heading).text(label, cx + padX, cy + 4.5, { lineBreak: false });
		cx += cw + gap;
	}
	doc.x = x;
	doc.y = cy + chipH;
	doc.moveDown(0.4);
}

function snapshotBox(ctx, snapshot) {
	const { doc, fonts, theme } = ctx;
	const pad = 12;
	const w = contentWidth(doc);
	const labelW = 132;
	const size = 9.5;
	const rows = snapshot.map((s) => {
		const lh = measure(doc, fonts.semibold, size, s.label, labelW - 8);
		const th = measure(doc, fonts.regular, size, s.text, w - pad * 2 - labelW);
		return { ...s, rh: Math.max(lh, th) };
	});
	let h = pad;
	for (const r of rows) h += r.rh + 6;
	h += pad - 6;

	tintBox(
		ctx,
		h,
		(ix, iy, iw) => {
			let cy = iy;
			for (const r of rows) {
				doc.font(fonts.semibold).fontSize(size).fillColor(theme.palette.deep || theme.palette.heading).text(txt(r.label), ix, cy, { width: labelW - 8 });
				doc.font(fonts.regular).fontSize(size).fillColor(theme.palette.ink).text(txt(r.text), ix + labelW, cy, { width: iw - labelW });
				cy += r.rh + 6;
			}
		},
		{ fill: theme.palette.tint, bar: theme.palette.accent }
	);
}

function riskBox(ctx, risk) {
	const { doc, fonts, theme } = ctx;
	const pad = 12;
	const w = contentWidth(doc);
	const innerW = w - pad * 2;
	const lead = txt(risk.lead);
	const bullets = (risk.bullets || []).map(txt).filter(Boolean);
	const narrative = txt(risk.narrative);
	const size = 9.5;

	let h = pad;
	if (lead) h += measure(doc, fonts.semibold, size, lead, innerW) + 6;
	for (const b of bullets) h += measure(doc, fonts.regular, size, b, innerW - 10) + 4;
	if (narrative) h += measure(doc, fonts.regular, size, narrative, innerW) + 4;
	h += pad - 4;

	tintBox(
		ctx,
		h,
		(ix, iy, iw) => {
			let cy = iy;
			if (lead) {
				doc.font(fonts.semibold).fontSize(size).fillColor(theme.palette.deep || theme.palette.heading).text(lead, ix, cy, { width: iw });
				cy = doc.y + 6;
			}
			if (bullets.length) {
				cy = iy + (cy - iy);
				doc.y = cy;
				const used = bulletList(ctx, bullets, ix, cy, iw, { size });
				cy += used;
			}
			if (narrative) {
				doc.font(fonts.regular).fontSize(size).fillColor(theme.palette.ink).text(narrative, ix, cy + 2, { width: iw, align: 'justify' });
			}
		},
		{ fill: theme.palette.tint, bar: theme.palette.accent }
	);
}

// Slate used for code-row values + the italic selection note (reference #44504F).
const CODE_INK = '#44504F';

// Diagnosis code list → [{label,value}] for codeRow(). Labels carry the colon;
// the reference bolds the label in deep teal/blue and leaves the value plain.
// The referral letter additionally carries "Designation: Primary" in the band.
function codeItems(d, designation) {
	return [
		d.dsm ? { label: 'DSM-5-TR:', value: txt(d.dsm) } : null,
		d.icd ? { label: 'ICD-11:', value: txt(d.icd) } : null,
		d.severity ? { label: 'Severity:', value: txt(d.severity) } : null,
		designation ? { label: 'Designation:', value: txt(designation) } : null
	].filter(Boolean);
}

// Reference .dx-comorbid-header — a bold deep-teal uppercase kicker fenced by
// 1.5px light-teal rules above AND below (the "horizontal dividers").
function kickerRule(ctx, label) {
	const { doc, fonts, theme } = ctx;
	const x = contentLeft(doc);
	const w = contentWidth(doc);
	const size = 9;
	const padY = 5;
	const deep = theme.palette.deep || theme.palette.heading;
	const textH = measure(doc, fonts.bold, size, label, w - 4);
	const h = padY + textH + padY;
	ensureSpace(doc, h + 16);
	const y = doc.y;
	doc.save().lineWidth(1.5).strokeColor(theme.palette.accent);
	doc.moveTo(x, y).lineTo(x + w, y).stroke();
	doc.moveTo(x, y + h).lineTo(x + w, y + h).stroke();
	doc.restore();
	doc
		.font(fonts.bold)
		.fontSize(size)
		.fillColor(deep)
		.text(label, x + 2, y + padY, { width: w - 4, characterSpacing: 0.63 });
	doc.x = x;
	doc.y = y + h;
	doc.moveDown(0.45);
}

// Reference .code-row — the DSM/ICD/Severity band: soft-grey fill + hairline
// border, bold deep-teal labels, muted pipe separators, slate values. Wraps as a
// single continued flow so it works in the narrow co-morbid cards too.
function codeRow(ctx, items, x, y, w) {
	const { doc, fonts, theme } = ctx;
	const size = 9;
	const padX = 9;
	const padY = 4;
	const innerW = w - padX * 2;
	const deep = theme.palette.deep || theme.palette.heading;
	// Mixed fonts ⇒ measure the flattened line to size the band.
	const flat = items.map((i) => `${i.label} ${i.value}`).join('  |  ');
	const h = padY + measure(doc, fonts.regular, size, flat, innerW) + padY;

	doc.save();
	doc
		.roundedRect(x, y, w, h, 3)
		.fillColor(theme.palette.tint)
		.strokeColor(theme.palette.rule)
		.lineWidth(0.75)
		.fillAndStroke();
	doc.restore();

	doc.fontSize(size);
	items.forEach((it, i) => {
		const last = i === items.length - 1;
		if (i === 0) {
			doc.font(fonts.bold).fillColor(deep).text(`${it.label} `, x + padX, y + padY, { width: innerW, continued: true });
		} else {
			doc.font(fonts.regular).fillColor(theme.palette.muted).text('  |  ', { continued: true });
			doc.font(fonts.bold).fillColor(deep).text(`${it.label} `, { continued: true });
		}
		doc.font(fonts.regular).fillColor(CODE_INK).text(it.value, { continued: !last });
	});

	doc.x = x;
	doc.y = y + h;
	return h;
}

// A "Rationale: <text>" paragraph — bold deep-teal lead, plain body.
function rationalePara(ctx, text, x, y, w, size) {
	const { doc, fonts, theme } = ctx;
	const deep = theme.palette.deep || theme.palette.heading;
	doc.fontSize(size);
	doc.font(fonts.bold).fillColor(deep).text('Rationale: ', x, y, { width: w, continued: true });
	doc.font(fonts.regular).fillColor(theme.palette.ink).text(text, { width: w });
	return doc.y - y;
}

function diagnosticBlock(ctx, dx) {
	const { doc, fonts, theme } = ctx;
	if (txt(dx.note)) {
		doc.font(fonts.italic).fontSize(9.5).fillColor(theme.palette.muted).text(txt(dx.note), contentLeft(doc), doc.y, { width: contentWidth(doc), align: 'left', lineGap: 1.5 });
		doc.moveDown(0.5);
	}
	if (dx.primary) primaryCard(ctx, dx.primary);
	if (Array.isArray(dx.comorbid) && dx.comorbid.filter(Boolean).length) {
		ensureSpace(doc, 150); // keep the kicker with the first row of cards
		kickerRule(ctx, 'CO-MORBID DIAGNOSES');
		comorbidCards(ctx, dx.comorbid.filter(Boolean));
	}
	if (txt(dx.subthreshold)) {
		kickerRule(ctx, 'SUBTHRESHOLD / RULE-OUT');
		paragraphs(ctx, dx.subthreshold, { size: 9.5, align: 'left' });
	}
	if (txt(dx.disclaimer)) {
		doc.moveDown(0.2);
		doc.font(fonts.italic).fontSize(8).fillColor(theme.palette.muted).text(txt(dx.disclaimer), contentLeft(doc), doc.y, { width: contentWidth(doc), align: 'left', lineGap: 1.5 });
	}
}

// Reference .dx-primary — soft fill, hairline border, 6px DEEP-teal left rule.
// Order: title → italic selection note (2px teal bar) → code band → rationale.
//
// opts lets the referral letter reuse this: there the card sits under its own
// "Primary Diagnosis" heading (so no title prefix), the band carries
// "Designation: Primary", and the body has no "Rationale:" lead.
function primaryCard(ctx, primary, opts = {}) {
	const { titlePrefix = true, designation = null, rationaleLabel = true } = opts;
	const { doc, fonts, theme } = ctx;
	const padX = 14;
	const padY = 10;
	const w = contentWidth(doc);
	const innerW = w - padX * 2;
	const deep = theme.palette.deep || theme.palette.heading;
	const name = txt(primary.name) || 'Principal diagnosis';
	const sel = txt(primary.selection);
	// Reports carrying a selection statement are on the revised standard: "Principal".
	const title = titlePrefix ? `${sel ? 'Principal' : 'Primary'} Diagnosis: ${name}` : name;
	const rationale = txt(primary.rationale);
	const codes = codeItems(primary, designation);

	const selW = innerW - 8;
	const titleH = measure(doc, fonts.bold, 10.5, title, innerW);
	const selH = sel ? measure(doc, fonts.italic, 9.5, sel, selW) + 8 : 0;
	const flat = codes.map((i) => `${i.label} ${i.value}`).join('  |  ');
	const codeH = codes.length ? measure(doc, fonts.regular, 9, flat, innerW - 18) + 8 + 6 : 0;
	// Mixed bold lead + body ⇒ measure the flattened string, with a small buffer.
	const ratH = rationale ? measure(doc, fonts.regular, 9.5, `Rationale: ${rationale}`, innerW) + 4 : 0;
	const h = padY + titleH + 5 + selH + codeH + ratH + padY;

	ensureSpace(doc, h + 10);
	const x = contentLeft(doc);
	const y = doc.y;
	doc.save();
	doc.roundedRect(x, y, w, h, 4).fillColor('#F7FAF9').strokeColor(theme.palette.rule).lineWidth(0.75).fillAndStroke();
	doc.restore();
	doc.save();
	doc.rect(x, y, 6, h).fillColor(deep).fill();
	doc.restore();

	let cy = y + padY;
	const ix = x + padX;
	doc.font(fonts.bold).fontSize(REPORT_STYLE.size.cardTitle).fillColor(deep).text(title, ix, cy, { width: innerW });
	cy = doc.y + 5;
	if (sel) {
		// .primary-rationale — italic note fenced by a 2px light-teal left bar.
		const sh = measure(doc, fonts.italic, 9.5, sel, selW);
		doc.save();
		doc.rect(ix, cy, 2, sh).fillColor(theme.palette.accent).fill();
		doc.restore();
		doc.font(fonts.italic).fontSize(REPORT_STYLE.size.small).fillColor(CODE_INK).text(sel, ix + 8, cy, { width: selW });
		cy = doc.y + 8;
	}
	if (codes.length) {
		cy += codeRow(ctx, codes, ix, cy, innerW) + 6;
	}
	if (rationale) {
		if (rationaleLabel) rationalePara(ctx, rationale, ix, cy, innerW, 9.5);
		else doc.font(fonts.regular).fontSize(REPORT_STYLE.size.small).fillColor(theme.palette.ink).text(rationale, ix, cy, { width: innerW, align: 'justify' });
	}

	doc.x = x;
	doc.y = y + h;
	doc.moveDown(0.5);
}

// Reference .dx-comorbid-card — two-column grid; each card has a hairline border,
// a 4px light-teal left rule, a BOLD deep-teal title, a code band, and a rationale.
function comorbidCards(ctx, list, opts = {}) {
	const { rationaleLabel = true } = opts;
	const { doc, fonts, theme } = ctx;
	const x0 = contentLeft(doc);
	const w = contentWidth(doc);
	const gap = 14;
	const cw = (w - gap) / 2;
	const padX = 10;
	const padY = 7;
	const iw = cw - padX * 2;
	const deep = theme.palette.deep || theme.palette.heading;

	const prep = (d) => {
		const name = txt(d.name) || 'Condition';
		const codes = codeItems(d);
		const rationale = txt(d.rationale);
		const nameH = measure(doc, fonts.bold, 10.5, name, iw);
		const flat = codes.map((i) => `${i.label} ${i.value}`).join('  |  ');
		const codeH = codes.length ? measure(doc, fonts.regular, 9, flat, iw - 18) + 8 + 6 : 0;
		const ratH = rationale ? measure(doc, fonts.regular, 8.5, `Rationale: ${rationale}`, iw) + 4 : 0;
		return { name, codes, rationale, h: padY + nameH + 5 + codeH + ratH + padY };
	};

	for (let i = 0; i < list.length; i += 2) {
		const pair = list.slice(i, i + 2).map(prep);
		const ch = Math.max(...pair.map((p) => p.h));
		ensureSpace(doc, ch + 8);
		const y = doc.y;
		pair.forEach((c, j) => {
			const cx = x0 + j * (cw + gap);
			doc.save();
			doc.roundedRect(cx, y, cw, ch, 4).fillColor('#FAFBFB').strokeColor(theme.palette.rule).lineWidth(0.75).fillAndStroke();
			doc.restore();
			doc.save();
			doc.rect(cx, y, 4, ch).fillColor(theme.palette.accent).fill();
			doc.restore();

			let cy = y + padY;
			const ix = cx + padX;
			doc.font(fonts.bold).fontSize(REPORT_STYLE.size.cardTitle).fillColor(deep).text(c.name, ix, cy, { width: iw });
			cy = doc.y + 5;
			if (c.codes.length) {
				cy += codeRow(ctx, c.codes, ix, cy, iw) + 6;
			}
			if (c.rationale) {
				if (rationaleLabel) rationalePara(ctx, c.rationale, ix, cy, iw, 8.5);
				else doc.font(fonts.regular).fontSize(REPORT_STYLE.size.cardBody).fillColor(theme.palette.ink).text(c.rationale, ix, cy, { width: iw });
			}
		});
		doc.x = x0;
		doc.y = y + ch + 8;
	}
}

// Reference .phase-label — NO pill. Each phase is a plain bold deep-teal
// subheading, "Phase I — Safety, Stabilization, and Alliance", then the body.
function treatmentBlocks(ctx, treatment) {
	const { doc, fonts, theme } = ctx;
	const x = contentLeft(doc);
	const w = contentWidth(doc);
	const deep = theme.palette.deep || theme.palette.heading;
	for (const phase of treatment || []) {
		ensureSpace(doc, 40);
		const label = txt(phase.phase);
		const title = txt(phase.title);
		const heading = label && title ? `${label} — ${title}` : label || title;
		doc.moveDown(0.35);
		doc.font(fonts.bold).fontSize(REPORT_STYLE.size.phase).fillColor(deep).text(heading, x, doc.y, { width: w });
		doc.x = x;
		doc.y = doc.y + 3;
		paragraphs(ctx, phase.body, { size: 9.5, align: 'justify', gap: 0.4 });
		doc.moveDown(0.2);
	}
}

// Core §9.10.1 Treatment Reference — label, fixed message, a five-column table
// (deep-teal header row, thin rules, header repeated across pages) and the
// optional ⚑ note. The flag is drawn as a vector: no embedded font has U+2691.
function drawFlag(doc, x, y, size, colour) {
	const h = size * 0.8;
	doc.save();
	doc.lineWidth(Math.max(0.6, size * 0.08)).strokeColor(colour);
	doc.moveTo(x + size * 0.08, y).lineTo(x + size * 0.08, y + h).stroke();
	doc.moveTo(x + size * 0.08, y).lineTo(x + size * 0.62, y + h * 0.22).lineTo(x + size * 0.08, y + h * 0.46).closePath().fill(colour);
	doc.restore();
}

function treatmentReferenceTable(ctx, tr) {
	const { doc, fonts, theme } = ctx;
	const x = contentLeft(doc);
	const w = contentWidth(doc);
	const deep = theme.palette.deep || theme.palette.heading;
	const fracs = [0.18, 0.2, 0.2, 0.26, 0.16];
	const cols = fracs.map((f) => w * f);
	const padX = 5;
	const padY = 4;
	const size = 8;
	const headers = [
		'Diagnosis according to PsyMatch',
		'Guideline-supported treatment options',
		'Medication classes referenced in guidelines',
		'Treatment planning considerations',
		'Evidence and source'
	];
	const flagW = 9;

	ensureSpace(doc, 90);
	doc.moveDown(0.35);
	doc.font(fonts.bold).fontSize(REPORT_STYLE.size.phase).fillColor(deep).text('Treatment Reference', x, doc.y, { width: w });
	doc.x = x;
	doc.y = doc.y + 3;
	doc.font(fonts.italic).fontSize(8.5).fillColor(theme.palette.muted).text(txt(tr.message), x, doc.y, { width: w });
	doc.x = x;
	doc.y = doc.y + 5;

	const drawRow = (cells, { header = false, flag = false } = {}) => {
		doc.font(header ? fonts.semibold : fonts.regular).fontSize(size);
		const heights = cells.map((c, i) => {
			const iw = cols[i] - padX * 2;
			const opts = { width: iw, ...(i === 2 && flag ? { indent: flagW } : {}) };
			return doc.heightOfString(txt(c), opts);
		});
		const rowH = Math.max(...heights) + padY * 2;
		if (doc.y + rowH > contentBottom(doc)) {
			doc.addPage();
			if (!header) drawRow(headers, { header: true });
		}
		const y = doc.y;
		if (header) doc.save().rect(x, y, w, rowH).fillColor(deep).fill().restore();
		let cx = x;
		cells.forEach((c, i) => {
			doc
				.font(header ? fonts.semibold : fonts.regular)
				.fontSize(size)
				.fillColor(header ? '#FFFFFF' : theme.palette.ink)
				.text(txt(c), cx + padX, y + padY, {
					width: cols[i] - padX * 2,
					...(i === 2 && flag ? { indent: flagW } : {})
				});
			if (i === 2 && flag) drawFlag(doc, cx + padX, y + padY + 1, size, theme.palette.ink);
			cx += cols[i];
		});
		if (!header) {
			doc.save().lineWidth(0.5).strokeColor(theme.palette.rule).moveTo(x, y + rowH).lineTo(x + w, y + rowH).stroke().restore();
		}
		doc.x = x;
		doc.y = y + rowH;
	};

	drawRow(headers, { header: true });
	for (const r of tr.rows) {
		drawRow([r.diagnosis, r.options, r.medicationClasses, r.planning, r.evidence], { flag: r.flag === true });
	}
	if (txt(tr.note)) {
		doc.moveDown(0.3);
		ensureSpace(doc, 24);
		const ny = doc.y;
		drawFlag(doc, x, ny + 1, 8, '#B8860B');
		doc.font(fonts.regular).fontSize(8).fillColor('#B8860B').text(txt(tr.note), x + 12, ny, { width: w - 12 });
	}
	doc.x = x;
	doc.moveDown(0.5);
}

// ─── Referral letter (blue) ─────────────────────────────────────────────────

function renderLetter(ctx, data) {
	const { doc, fonts, theme, logo } = ctx;
	const x = contentLeft(doc);
	const w = contentWidth(doc);
	const meta = data.meta || {};

	// Letterhead — brand name (Arial 9pt bold deep-blue uppercase) + tagline
	// (7.5pt muted) on the left, logo (120px) on the right, 2pt brand-blue rule.
	const top = doc.y;
	const logoW = 120;
	if (logo) {
		try {
			// The logo art is ~44pt tall at this width, so drawing it at `top` leaves
			// its bottom sitting on the letterhead rule. Lift it so it top-aligns with
			// the brand line and keeps clearance above the rule (matches the reference).
			doc.image(logo, x + w - logoW, top - 10, { width: logoW });
		} catch {
			/* ignore */
		}
	}
	doc
		.font(fonts.bold)
		.fontSize(9)
		.fillColor(theme.palette.deep)
		.text(txt(theme.footerSystem).toUpperCase(), x, top + 2, { width: w - logoW - 16, characterSpacing: 0.5 });
	doc
		.font(fonts.regular)
		.fontSize(7.5)
		.fillColor(theme.palette.muted)
		.text(theme.tagline || '', x, doc.y + 2, { width: w - logoW - 16 });
	const ruleY = Math.max(doc.y, top + 36) + 8;
	doc.strokeColor(theme.palette.accent).lineWidth(2).moveTo(x, ruleY).lineTo(x + w, ruleY).stroke();
	doc.y = ruleY + 13;
	doc.x = x;

	// Doc label — Arial 7.5pt muted uppercase, wide tracking.
	doc
		.font(fonts.semibold)
		.fontSize(7.5)
		.fillColor(theme.palette.muted)
		.text(txt(meta.eyebrow) || theme.eyebrow, x, doc.y, { width: w, characterSpacing: 1.2 });
	doc.moveDown(0.55);

	// Date of Assessment — bold deep-blue label + value (Arial 9.5pt).
	letterField(ctx, 'Date of Assessment: ', txt(meta.dateOfAssessment) || '—');
	doc.moveDown(0.45);

	// Re: — thin blue-left-bar line "<patient> · Patient ID <id>" (fileMakerId).
	reBar(ctx, `${txt(meta.patient) || 'Patient'} · Patient ID ${txt(meta.patientId) || '—'}`);
	doc.moveDown(0.45);

	// H1 — sits directly BELOW the patient-ID line and ABOVE the letter date.
	doc.font(fonts.bold).fontSize(REPORT_STYLE.size.title).fillColor(theme.palette.deep).text(txt(theme.title), x, doc.y, { width: w });
	doc.moveDown(0.5);

	// Date: — letter date.
	letterField(ctx, 'Date: ', txt(meta.letterDate) || txt(meta.dateOfAssessment) || '—');
	doc.moveDown(0.55);

	// Recipient address (Arial 9.5pt, 1.5 line-height; literal placeholders).
	const recip = data.recipient || {};
	doc.font(fonts.regular).fontSize(REPORT_STYLE.size.small).fillColor(theme.palette.ink);
	for (const line of [
		txt(recip.name) || 'Referring Source Name',
		txt(recip.address) || 'Source Address',
		txt(recip.cityStateZip) || '[City, State ZIP]'
	])
		doc.text(line, x, doc.y, { width: w, lineGap: 3 });
	doc.moveDown(0.5);

	// Salutation.
	doc
		.font(fonts.regular)
		.fontSize(REPORT_STYLE.size.small)
		.fillColor(theme.palette.ink)
		.text(txt(data.salutation) || 'Dear Referring Clinician,', x, doc.y, { width: w });
	doc.moveDown(0.5);

	// Opening paragraphs (Georgia serif 10pt). The H1 now sits up by the patient-ID
	// line, so the body follows the salutation directly.
	paragraphs(ctx, data.opening, { size: 10 });

	// Clinical Snapshot box (top + bottom rules, bold-label bullets).
	const snapBullets = (data.snapshot?.bullets || []).filter((b) => txt(b?.label) || txt(b?.text));
	if (snapBullets.length) {
		letterLabeledBox(ctx, 'Clinical Snapshot', snapBullets);
	}

	// Brief Risk Note box.
	if (arr(data.riskNote).length) {
		letterParaBox(ctx, 'Brief Risk Note', data.riskNote);
	}

	// Brief Autobiographical / Psychosocial Summary.
	if (arr(data.psychosocial).length) {
		miniHeading(ctx, 'Brief Autobiographical / Psychosocial Summary');
		paragraphs(ctx, data.psychosocial, { size: 10 });
	}

	// Primary Diagnosis — heading + card. In the letter the heading names the
	// section, so the card title is the bare diagnosis; the band carries the
	// designation and the body has no "Rationale:" lead (matches the reference).
	if (data.primary) {
		miniHeading(ctx, 'Primary Diagnosis');
		primaryCard(ctx, { ...data.primary, selection: '' }, {
			titlePrefix: false,
			designation: 'Primary',
			rationaleLabel: false
		});
	}

	// Co-Morbid Diagnoses. The letter cards at most four; any further SUPPORTED
	// diagnoses are named in one line directly beneath them — under this heading,
	// never under Subthreshold, which asserts the opposite of what they are.
	if (Array.isArray(data.comorbid) && data.comorbid.filter(Boolean).length) {
		miniHeading(ctx, 'Co-Morbid Diagnoses');
		comorbidCards(ctx, data.comorbid.filter(Boolean), { rationaleLabel: false });
		if (txt(data.comorbidOverflow)) {
			paragraphs(ctx, [data.comorbidOverflow], { size: 10, align: 'left' });
		}
	}

	// Subthreshold Diagnoses.
	if (arr(data.subthreshold).length) {
		miniHeading(ctx, 'Subthreshold Diagnoses');
		paragraphs(ctx, data.subthreshold, { size: 10, align: 'left' });
	}

	// Brief Case Conceptualization.
	if (arr(data.conceptualization).length) {
		miniHeading(ctx, 'Brief Case Conceptualization');
		paragraphs(ctx, data.conceptualization, { size: 10 });
	}

	// Brief Treatment Plan.
	if (arr(data.treatment).length) {
		miniHeading(ctx, 'Brief Treatment Plan');
		paragraphs(ctx, data.treatment, { size: 10 });
	}

	// Closing.
	const closing = data.closing || {};
	ensureSpace(doc, 80);
	miniHeading(ctx, 'Closing');
	if (arr(closing.body).length) paragraphs(ctx, closing.body, { size: 10 });
	doc.moveDown(0.4);
	doc.font(fonts.regular).fontSize(10).fillColor(theme.palette.ink).text(txt(closing.signoff) || 'Sincerely,');
	doc.moveDown(1.2);
	doc.font(fonts.semibold).fontSize(10).fillColor(theme.palette.ink).text(txt(closing.clinician) || '[Clinician Name, Credentials]');
	doc.font(fonts.regular).fontSize(9).fillColor(theme.palette.muted).text(txt(closing.system) || theme.footerSystem);

	// Italic footer note.
	if (txt(data.footerNote)) {
		doc.moveDown(0.8);
		doc.font(fonts.italic).fontSize(8).fillColor(theme.palette.muted).text(txt(data.footerNote), contentLeft(doc), doc.y, { width: w, align: 'left', lineGap: 1.5 });
	}
}

// "Label: value" line — bold deep-blue label + regular ink value (Arial 9.5pt),
// matching .assessment-date / .letter-date in the reference CSS.
function letterField(ctx, label, value, { size = 9.5 } = {}) {
	const { doc, fonts, theme } = ctx;
	const x = contentLeft(doc);
	doc.font(fonts.bold).fontSize(size).fillColor(theme.palette.deep).text(label, x, doc.y, { continued: true });
	doc.font(fonts.regular).fillColor(theme.palette.ink).text(txt(value));
}

// "Re:" line with a 3px blue left bar (matches .re-block: border-left 3px, pad-left 9px).
function reBar(ctx, text, { size = 9.5 } = {}) {
	const { doc, fonts, theme } = ctx;
	const x = contentLeft(doc);
	const startY = doc.y;
	doc.font(fonts.bold).fontSize(size).fillColor(theme.palette.deep).text('Re: ', x + 10, startY, { continued: true });
	doc.font(fonts.regular).fillColor(theme.palette.ink).text(txt(text), { width: contentWidth(doc) - 10 });
	doc.strokeColor(theme.palette.accent).lineWidth(3).moveTo(x + 1.5, startY - 1).lineTo(x + 1.5, doc.y + 1).stroke();
}

function miniHeading(ctx, label) {
	const { doc, fonts, theme } = ctx;
	ensureSpace(doc, 28);
	doc.moveDown(0.3);
	doc.font(fonts.semibold).fontSize(REPORT_STYLE.size.miniHeading).fillColor(theme.palette.heading).text(txt(label), contentLeft(doc), doc.y, { width: contentWidth(doc) });
	doc.moveDown(0.2);
}

function letterLabeledBox(ctx, label, bullets) {
	const { doc, fonts, theme } = ctx;
	const pad = 12;
	const w = contentWidth(doc);
	const innerW = w - pad * 2;
	const size = 9.5;
	const headH = measure(doc, fonts.semibold, 10.5, label, innerW) + 6;
	let bodyH = 0;
	for (const b of bullets) {
		const lead = txt(b.label) ? txt(b.label) + ': ' : '';
		bodyH += measure(doc, fonts.regular, size, lead + txt(b.text), innerW - 10) + 5;
	}
	const h = pad + headH + bodyH + pad - 5;
	tintBox(
		ctx,
		h,
		(ix, iy, iw) => {
			doc.font(fonts.semibold).fontSize(REPORT_STYLE.size.cardTitle).fillColor(theme.palette.deep).text(txt(label), ix, iy, { width: iw });
			const by = doc.y + 4;
			doc.y = by;
			bulletList(ctx, bullets, ix, by, iw, { labeled: true, size });
		},
		{ fill: theme.palette.tint, topRule: true, bottomRule: true, pad }
	);
}

function letterParaBox(ctx, label, paras) {
	const { doc, fonts, theme } = ctx;
	const pad = 12;
	const w = contentWidth(doc);
	const innerW = w - pad * 2;
	const size = 9.5;
	const headH = measure(doc, fonts.semibold, 10.5, label, innerW) + 6;
	let bodyH = 0;
	for (const p of arr(paras)) bodyH += measure(doc, fonts.regular, size, p, innerW) + 4;
	const h = pad + headH + bodyH + pad - 4;
	tintBox(
		ctx,
		h,
		(ix, iy, iw) => {
			doc.font(fonts.semibold).fontSize(REPORT_STYLE.size.cardTitle).fillColor(theme.palette.deep).text(txt(label), ix, iy, { width: iw });
			let cy = doc.y + 4;
			for (const p of arr(paras)) {
				doc.font(fonts.regular).fontSize(size).fillColor(theme.palette.ink).text(txt(p), ix, cy, { width: iw, align: 'justify' });
				cy = doc.y + 4;
			}
		},
		{ fill: theme.palette.tint, bar: theme.palette.accent, pad }
	);
}

// ─── Patient summary (warm) ─────────────────────────────────────────────────

function renderSummary(ctx, data) {
	const { doc, fonts, theme, logo } = ctx;
	const x = contentLeft(doc);
	const w = contentWidth(doc);
	const top = doc.y;

	// Logo top-right.
	if (logo) {
		try {
			doc.image(logo, x + w - 96, top, { width: 96 });
		} catch {
			/* ignore */
		}
	}

	// Doc label — muted grey uppercase (NOT gold; gold is reserved for the rules).
	doc.font(fonts.semibold).fontSize(REPORT_STYLE.size.eyebrow).fillColor(theme.palette.muted).text((txt(data.meta?.eyebrow) || theme.eyebrow).toUpperCase(), x, top, { characterSpacing: 0.8 });
	doc.moveDown(0.4);
	// H1 (heading-blue).
	doc.font(fonts.bold).fontSize(REPORT_STYLE.size.h1).fillColor(theme.palette.heading).text(txt(data.meta?.title) || theme.title, { width: w - 110 });
	doc.moveDown(0.2);
	// Subtitle.
	doc.font(fonts.italic).fontSize(REPORT_STYLE.size.cardTitle).fillColor(theme.palette.muted).text(theme.subtitle || 'Prepared for you to read and keep');
	doc.moveDown(0.8);

	const sections = (data.sections || []).filter((s) => txt(s?.title) || arr(s?.paragraphs).length);
	sections.forEach((section, i) => {
		ensureSpace(doc, 50);
		// The opening flows straight from the subtitle — no gold rule, no heading
		// (matches the reference). Every later section is fenced by a gold rule.
		if (!isOpeningSection(section, i)) {
			doc.strokeColor(theme.palette.accent).lineWidth(2).moveTo(x, doc.y).lineTo(x + w, doc.y).stroke();
			doc.y += 8;
			doc.font(fonts.bold).fontSize(12).fillColor(theme.palette.heading).text(txt(section.title).toUpperCase(), x, doc.y, { width: w, characterSpacing: 0.4 });
			doc.moveDown(0.4);
		}
		// Navy justified body (section 6 italic).
		paragraphs(ctx, section.paragraphs, {
			size: REPORT_STYLE.size.summaryBody,
			align: 'justify',
			color: theme.palette.body || theme.palette.ink,
			italic: !!section.italic
		});
		doc.moveDown(0.4);
	});
}

// ─── Footer (two-pass, copied pattern from sotBasedPdfGenerator) ─────────────

function stampFooters(doc, theme, fonts) {
	const range = doc.bufferedPageRange();
	for (let i = range.start; i < range.start + range.count; i++) {
		doc.switchToPage(i);
		const prevBottom = doc.page.margins.bottom;
		doc.page.margins.bottom = 0;

		const pageNum = i - range.start + 1;
		const totalPages = range.count;
		const footerTop = doc.page.height - FOOTER_HEIGHT;
		const x = doc.page.margins.left;
		const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
		const y = footerTop + REPORT_STYLE.footer.textOffset;

		// Hairline above footer.
		doc.strokeColor(theme.palette.rule).lineWidth(0.5).moveTo(x, footerTop).lineTo(x + w, footerTop).stroke();

		doc.font(fonts.regular).fontSize(REPORT_STYLE.size.footer).fillColor(theme.palette.muted);
		doc.text(theme.footerSystem, x, y, { width: w, align: 'left', lineBreak: false });
		doc.text(theme.footerCenter, x, y, { width: w, align: 'center', lineBreak: false });
		doc.text(`Page ${pageNum} of ${totalPages}`, x, y, { width: w, align: 'right', lineBreak: false });

		doc.page.margins.bottom = prevBottom;
		doc.fillColor('black');
	}
}
