// PDFKit renderer for the standalone referral letter (`referral_letter_en`,
// document schema `psymatch.referral_letter.v1`, produced by psymatch-agent).
//
// The design is Revision 4 of v218-format-referral.md (§14): the reference CSS
// there is the source of every size, colour and spacing below (px → pt at 0.75).
// The agent's scripts/referral-letter-preview.ts renders the same document with
// that CSS + Paged.js; this file reproduces it for PDFKit.
//
// Unlike aiReportPdf.js, text is laid out line by line here (wrapRuns) instead
// of through PDFKit's auto-flow, because the design has pagination rules PDFKit
// can't express:
//   - the diagnostic panel never splits (fallback: split between entries only
//     when it is taller than a page, with the heading repeated);
//   - headings stay with their first rows / lines;
//   - the risk and treatment blocks stay together when they fit on a page,
//     otherwise break between rows and repeat the table header;
//   - the closing is never alone on a page (at least two limitation lines
//     travel with it);
//   - ⚑ is drawn from `interactionFlag`, never from the text.
//
// Input must already be de-tokenized (or masked). Pure: imports only pdfkit and
// the embedded fonts, so it is node-testable and route-importable.

import PDFDocument from 'pdfkit';
import { FONTS } from './embeddedAssets.js';

const px = (v) => v * 0.75;
const MM = 72 / 25.4;

const C = {
	teal: '#14606E',
	panelFill: '#F2F7F8',
	ink: '#1F2937',
	grey: '#6B7280',
	labelGrey: '#456369',
	border: '#D7DDDC',
	dxRule: '#CFE0DF',
	green: '#2E7D4F',
	amber: '#B8860B',
	red: '#B3261E',
	white: '#FFFFFF'
};

// @page { size: Letter; margin: 0.65in 0.75in 0.85in 0.75in }
const MARGINS = { top: 0.65 * 72, right: 0.75 * 72, bottom: 0.85 * 72, left: 0.75 * 72 };
const DEFAULT_LETTERHEAD_MM = 40;

const CHIP_COLOURS = { mild: C.green, moderate: C.amber, severe: C.red };
const LEVEL_COLOURS = { Low: C.green, 'Not assessed': C.amber };

// ─── Public entrypoint ──────────────────────────────────────────────────────

/**
 * @param {object} letter  A de-tokenized `psymatch.referral_letter.v1` document.
 * @param {object} [opts]
 * @param {Array} [opts.trace]  Optional sink for layout marks ({ name, page }) —
 *   which page each heading/block landed on. Used by tests to check pagination
 *   against the design targets; ignored when omitted.
 * @returns {Promise<Buffer>}
 */
export async function renderReferralLetterPdf(letter, { trace } = {}) {
	return new Promise((resolve, reject) => {
		const doc = new PDFDocument({
			size: 'LETTER',
			margins: { ...MARGINS },
			bufferPages: true,
			autoFirstPage: true,
			info: {
				Title: 'Referral letter',
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

		try {
			const fonts = registerFonts(doc);
			const L = new Layout(doc, fonts, letter?.layout?.letterheadDepthMm, trace);
			renderLetter(L, letter);
			stampFooters(L, letter?.footer ?? '');
		} catch (err) {
			reject(err);
			return;
		}
		doc.end();
	});
}

// ─── Fonts ──────────────────────────────────────────────────────────────────

// Design: Georgia body, Arial headings/labels. We use the embedded Inter for
// sans and PDFKit's built-in Times for serif, like aiReportPdf.js. Times is a
// WinAnsi standard font: a character outside WinAnsi (≥, →, Greek…) would print
// blank, so any serif run containing one falls back to Inter (resolveFont).
function registerFonts(doc) {
	const serif = { serif: 'Times-Roman', serifBold: 'Times-Bold', serifItalic: 'Times-Italic' };
	try {
		const inter = {
			sans: 'Inter',
			sansSemi: 'Inter-SemiBold',
			sansBold: 'Inter-Bold',
			sansItalic: 'Inter-Italic'
		};
		doc.registerFont(inter.sans, FONTS.regular);
		doc.registerFont(inter.sansSemi, FONTS.semibold);
		doc.registerFont(inter.sansBold, FONTS.bold);
		doc.registerFont(inter.sansItalic, FONTS.italic);
		// registerFont is lazy; parse now so a bad asset falls back here.
		for (const name of Object.values(inter)) doc.font(name);
		return { ...inter, ...serif };
	} catch (err) {
		console.error('[referralLetterPdf] Inter registration failed; using Helvetica:', err?.message);
		return {
			sans: 'Helvetica',
			sansSemi: 'Helvetica-Bold',
			sansBold: 'Helvetica-Bold',
			sansItalic: 'Helvetica-Oblique',
			...serif
		};
	}
}

// WinAnsi (cp1252) printable set: what PDFKit's standard fonts can draw.
const CP1252_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
function isWinAnsi(str) {
	for (const ch of str) {
		const cp = ch.codePointAt(0);
		if ((cp >= 0x20 && cp <= 0x7e) || (cp >= 0xa0 && cp <= 0xff) || CP1252_EXTRA.has(ch)) continue;
		if (ch === '\n' || ch === '\t') continue;
		return false;
	}
	return true;
}

const SERIF_FALLBACK = { serif: 'sans', serifBold: 'sansBold', serifItalic: 'sansItalic' };

// ─── Layout engine ──────────────────────────────────────────────────────────

class Layout {
	constructor(doc, fonts, letterheadMm, trace) {
		this.doc = doc;
		this.trace = Array.isArray(trace) ? trace : null;
		this.pageNo = 1;
		this.fonts = fonts;
		this.left = MARGINS.left;
		this.width = doc.page.width - MARGINS.left - MARGINS.right;
		this.bottom = doc.page.height - MARGINS.bottom;
		// §14.5: first page reserves the printed letterhead depth.
		const mm = Number(letterheadMm) > 0 ? Number(letterheadMm) : DEFAULT_LETTERHEAD_MM;
		this.y = mm * MM;
		this.pageTop = this.y;
	}

	/** Usable height of a continuation page. */
	get fullPage() {
		return this.bottom - MARGINS.top;
	}
	get remaining() {
		return this.bottom - this.y;
	}
	get atPageTop() {
		return this.y <= this.pageTop + 0.01;
	}
	fits(h) {
		return this.y + h <= this.bottom + 0.01;
	}
	/** Record which page a block landed on (only when a trace sink was given). */
	mark(name) {
		if (this.trace) this.trace.push({ name, page: this.pageNo });
	}
	newPage() {
		this.doc.addPage();
		this.pageNo += 1;
		this.y = MARGINS.top;
		this.pageTop = this.y;
	}
	/** New page unless `h` fits here, or we're already at the top of a page. */
	ensure(h) {
		if (!this.fits(h) && !this.atPageTop) this.newPage();
	}

	resolveFont(key, text) {
		if (SERIF_FALLBACK[key] && !isWinAnsi(text)) key = SERIF_FALLBACK[key];
		return this.fonts[key];
	}

	/** Width of `text` in style `st` ({ font, size, spacing }). */
	widthOf(text, st) {
		const doc = this.doc;
		doc.font(this.resolveFont(st.font, text)).fontSize(st.size);
		return doc.widthOfString(text, { characterSpacing: st.spacing ?? 0 });
	}

	/**
	 * Word-wrap styled runs into lines.
	 * runs: [{ text, font, size, color?, spacing? }] — one paragraph.
	 * Returns [{ atoms:[{ segs:[{text,st,w}], w, space }], w }].
	 * Words that touch across a run boundary ("exposure," with only the word
	 * bold) stay one unbreakable atom.
	 */
	wrapRuns(runs, width) {
		const atoms = [];
		let glue = false; // previous piece ended without whitespace
		for (const run of runs) {
			const st = run;
			const parts = String(run.text ?? '').split(/(\s+)/);
			for (const part of parts) {
				if (part === '') continue;
				if (/^\s+$/.test(part)) {
					if (atoms.length) atoms[atoms.length - 1].space = this.widthOf(' ', st);
					if (part.includes('\n') && atoms.length) atoms[atoms.length - 1].hardBreak = true;
					glue = false;
					continue;
				}
				const seg = { text: part, st, w: this.widthOf(part, st) };
				if (glue && atoms.length) {
					const a = atoms[atoms.length - 1];
					a.segs.push(seg);
					a.w += seg.w;
				} else {
					atoms.push({ segs: [seg], w: seg.w, space: 0 });
				}
				glue = true;
			}
		}

		const lines = [];
		let line = { atoms: [], w: 0 };
		const push = () => {
			if (line.atoms.length) lines.push(line);
			line = { atoms: [], w: 0 };
		};
		for (const atom of atoms) {
			for (const piece of this.splitLongAtom(atom, width)) {
				const gap = line.atoms.length ? line.atoms[line.atoms.length - 1].space : 0;
				if (line.atoms.length && line.w + gap + piece.w > width + 0.01) push();
				const lead = line.atoms.length ? line.atoms[line.atoms.length - 1].space : 0;
				line.w += (line.atoms.length ? lead : 0) + piece.w;
				line.atoms.push(piece);
			}
			if (atom.hardBreak) {
				line.hardBreak = true;
				push();
			}
		}
		push();
		return lines;
	}

	// Break an atom wider than the line (a long URL or code) by characters.
	splitLongAtom(atom, width) {
		if (atom.w <= width || atom.segs.length !== 1) return [atom];
		const { st, text } = atom.segs[0];
		const out = [];
		let buf = '';
		for (const ch of text) {
			if (buf && this.widthOf(buf + ch, st) > width) {
				out.push({
					segs: [{ text: buf, st, w: this.widthOf(buf, st) }],
					w: this.widthOf(buf, st),
					space: 0
				});
				buf = '';
			}
			buf += ch;
		}
		const w = this.widthOf(buf, st);
		out.push({ segs: [{ text: buf, st, w }], w, space: atom.space });
		return out;
	}

	/** Draw one wrapped line with its top at `y`. */
	drawLine(line, x, y, lh, { align = 'left', width = 0, last = true } = {}) {
		const doc = this.doc;
		const gaps = line.atoms.length - 1;
		const justify = align === 'justify' && !last && !line.hardBreak && gaps > 0;
		const extra = justify ? (width - line.w) / gaps : 0;
		let cx =
			align === 'right' ? x + width - line.w : align === 'center' ? x + (width - line.w) / 2 : x;
		// Mixed sizes on one line ("CHILDREN: Two…") share the baseline of the
		// largest segment, whose line box is centred in the CSS line height.
		const metrics = (st, text) => {
			doc.font(this.resolveFont(st.font, text)).fontSize(st.size);
			return {
				natural: doc.currentLineHeight(true),
				ascent: (doc._font.ascender / 1000) * st.size
			};
		};
		const segs = line.atoms.flatMap((a) => a.segs);
		const big = segs
			.map((s) => metrics(s.st, s.text))
			.reduce((a, b) => (b.natural > a.natural ? b : a));
		line.atoms.forEach((atom, i) => {
			for (const seg of atom.segs) {
				const { st } = seg;
				const m = metrics(st, seg.text);
				doc.fillColor(st.color ?? C.ink);
				doc.text(seg.text, cx, y + (lh - big.natural) / 2 + big.ascent - m.ascent, {
					lineBreak: false,
					characterSpacing: st.spacing ?? 0
				});
				cx += seg.w;
			}
			if (i < gaps) cx += atom.space + extra;
		});
	}

	/** Measure + draw helpers for a single-style paragraph. */
	para(text, st, width) {
		const lines = this.wrapRuns(
			[{ ...st, text: st.upper ? String(text).toUpperCase() : text }],
			width
		);
		const lh = st.size * (st.lh ?? 1.4);
		return { lines, lh, h: lines.length * lh };
	}
	drawPara(p, x, y, { align = 'left', width = 0 } = {}) {
		p.lines.forEach((line, i) =>
			this.drawLine(line, x, y + i * p.lh, p.lh, { align, width, last: i === p.lines.length - 1 })
		);
	}

	/**
	 * Flow a paragraph at the cursor across pages, line by line, keeping at
	 * least `minLines` together at the top and bottom of each break.
	 */
	flowPara(p, { align = 'left', marginBottom = 0, minLines = 2 } = {}) {
		let i = 0;
		const n = p.lines.length;
		while (i < n) {
			let fit = Math.floor((this.remaining + 0.01) / p.lh);
			const left = n - i;
			if (fit < left) {
				// Widow: never leave fewer than minLines for the next page.
				if (left - fit < minLines) fit = left - minLines;
				// Orphan: never strand fewer than minLines at the page bottom.
				if (fit < Math.min(minLines, left)) fit = 0;
			}
			const take = Math.min(fit, left);
			if (take <= 0) {
				if (this.atPageTop) {
					// A single line taller than the page body: draw it anyway.
					this.drawLine(p.lines[i], this.left, this.y, p.lh, {
						align,
						width: this.width,
						last: i === n - 1
					});
					this.y += p.lh;
					i += 1;
				} else {
					this.newPage();
				}
				continue;
			}
			for (let k = 0; k < take; k++, i++) {
				this.drawLine(p.lines[i], this.left, this.y, p.lh, {
					align,
					width: this.width,
					last: i === n - 1
				});
				this.y += p.lh;
			}
			if (i < n) this.newPage();
		}
		this.y += marginBottom;
	}

	rect(x, y, w, h, fill) {
		this.doc.save().rect(x, y, w, h).fill(fill).restore();
	}
	hline(x, y, w, color, width) {
		this.doc
			.save()
			.moveTo(x, y)
			.lineTo(x + w, y)
			.lineWidth(width)
			.strokeColor(color)
			.stroke()
			.restore();
	}
}

// ─── Styles (from the Revision 4 reference CSS) ─────────────────────────────

const S = {
	body: { font: 'serif', size: 10, lh: 1.4 },
	bodyBold: { font: 'serifBold', size: 10, lh: 1.4 },
	addr: { font: 'serif', size: 10, lh: 1.55 },
	prov: { font: 'sans', size: 8, lh: 1.4, color: C.grey },
	idLabel: {
		font: 'sansBold',
		size: 7.5,
		lh: 1.4,
		color: C.labelGrey,
		upper: true,
		spacing: 7.5 * 0.04
	},
	idValue: { font: 'serif', size: 9.5, lh: 1.4 },
	h2: { font: 'sansBold', size: 10.5, lh: 1.25, color: C.teal },
	snapshot: { font: 'serif', size: 9.8, lh: 1.4 },
	panelHead: { font: 'sansBold', size: 10.5, lh: 1.25, color: C.white },
	dxRole: {
		font: 'sans',
		size: 7.5,
		lh: 1.4,
		color: C.labelGrey,
		upper: true,
		spacing: 7.5 * 0.05
	},
	dxNamePrimary: { font: 'sansBold', size: 13, lh: 1.25, color: C.teal },
	dxNameComorbid: { font: 'sansBold', size: 11, lh: 1.25, color: C.teal },
	chip: { font: 'sansBold', size: 7.5, lh: 1.2, color: C.white, upper: true, spacing: 7.5 * 0.03 },
	dxCodes: { font: 'sans', size: 8, lh: 1.4, color: C.labelGrey },
	dxRationale: { font: 'serif', size: 9.5, lh: 1.4 },
	qualNote: { font: 'sans', size: 7, lh: 1.4, color: C.labelGrey, upper: true, spacing: 7 * 0.05 },
	qual: { font: 'serif', size: 8.3, lh: 1.35 },
	qualBold: { font: 'serifBold', size: 8.3, lh: 1.35 },
	riskHead: {
		font: 'sansBold',
		size: 7.5,
		lh: 1.3,
		color: C.white,
		upper: true,
		spacing: 7.5 * 0.04
	},
	riskDomain: { font: 'sansSemi', size: 8.8, lh: 1.4 },
	riskLevel: { font: 'sansBold', size: 8.8, lh: 1.4 },
	riskNote: { font: 'serif', size: 8.8, lh: 1.4 },
	trMessage: { font: 'sansItalic', size: 8.3, lh: 1.4, color: C.labelGrey },
	panelNote: { font: 'sansItalic', size: 8, lh: 1.4, color: C.labelGrey },
	trHead: { font: 'sansBold', size: 7, lh: 1.3, color: C.white, upper: true, spacing: 7 * 0.02 },
	trCell: { font: 'serif', size: 8, lh: 1.4 },
	flagNote: { font: 'sans', size: 7.8, lh: 1.4, color: C.amber },
	medStatement: { font: 'sansItalic', size: 7.5, lh: 1.4, color: C.grey },
	limitations: { font: 'serif', size: 9.3, lh: 1.4 },
	closing: { font: 'serif', size: 10, lh: 1.4 },
	sigName: { font: 'serifBold', size: 10, lh: 1.4 },
	sigTitle: { font: 'serif', size: 9.5, lh: 1.4, color: C.grey },
	footer: { font: 'sans', size: 7, lh: 1.2, color: C.grey }
};

const str = (v) => (v == null ? '' : String(v));

// ─── The letter ─────────────────────────────────────────────────────────────

function renderLetter(L, letter) {
	const c = letter?.content ?? {};

	simpleBlock(L, str(letter.reportDate), S.body, px(22));
	const recipient = letter.recipient ?? {};
	simpleBlock(
		L,
		[recipient.name, recipient.practice, recipient.street, recipient.locality]
			.map(str)
			.filter(Boolean)
			.join('\n'),
		S.addr,
		px(18)
	);
	simpleBlock(
		L,
		`Patient ID: ${str(letter.patientId)} · ${str(letter.assessmentDateLabel)}: ${str(letter.assessmentDate)} · Report date: ${str(letter.reportDate)}`,
		S.prov,
		px(6)
	);
	identificationBlock(L, letter);
	simpleBlock(L, str(letter.salutation), S.body, px(12));
	L.flowPara(L.para(str(letter.opening), S.body, L.width), {
		align: 'justify',
		marginBottom: px(16)
	});

	headedPara(L, 'Clinical Snapshot', str(c.clinicalSnapshot), S.snapshot, { marginBottom: px(16) });

	diagnosticPanel(L, letter);
	qualifiersBlock(L, c.qualifiers ?? []);
	riskBlock(L, c);
	treatmentBlock(L, letter);
	limitationsAndClosing(L, letter);
}

// A small block that is never split: address, date line, etc.
function simpleBlock(L, text, st, marginBottom) {
	if (!text) return;
	const p = L.para(text, st, L.width);
	L.ensure(p.h);
	L.drawPara(p, L.left, L.y);
	L.y += p.h + marginBottom;
}

function identificationBlock(L, letter) {
	const id = letter?.content?.identification ?? {};
	const rows = [
		['Name', id.name],
		['Age', id.age],
		['Marital status', id.maritalStatus],
		['Children', id.children],
		['Occupation', id.occupation],
		['Psychotherapy history', id.psychotherapyHistory],
		['Hospitalizations', id.hospitalizations],
		['Interviews completed', (letter.interviewsCompleted ?? []).join(', ')]
	];
	// Rev 4 §4.2 (client edit): label and entry on the same line.
	const padY = px(2);
	for (const [label, value] of rows) {
		const lines = L.wrapRuns(
			[
				{ ...S.idLabel, text: `${label.toUpperCase()}:` },
				{ ...S.idValue, text: ` ${str(value)}` }
			],
			L.width
		);
		const lh = S.idValue.size * S.idValue.lh;
		const h = padY + lines.length * lh + padY;
		L.ensure(h);
		lines.forEach((line, i) => L.drawLine(line, L.left, L.y + padY + i * lh, lh));
		L.y += h;
	}
	// .id-block { border-bottom: 0.75pt; padding-bottom: 8px; margin-bottom: 14px }
	L.y += px(8);
	L.hline(L.left, L.y, L.width, C.border, 0.75);
	L.y += px(14);
}

// h2 { margin-top: 14px; padding-bottom: 3px; border-bottom: 1pt teal; margin-bottom: 8px }
function h2(L, title) {
	const p = L.para(title, S.h2, L.width);
	return {
		h: px(14) + p.h + px(3) + px(8),
		draw() {
			L.y += px(14);
			L.mark(`heading:${title}`);
			L.drawPara(p, L.left, L.y);
			L.y += p.h + px(3);
			L.hline(L.left, L.y, L.width, C.teal, 1);
			L.y += px(8);
		}
	};
}

// Heading + flowing paragraph; the heading keeps at least two lines with it.
function headedPara(L, title, text, st, { marginBottom = 0, align = 'left' } = {}) {
	const head = h2(L, title);
	const p = L.para(text, st, L.width);
	L.ensure(head.h + Math.min(p.lines.length, 2) * p.lh);
	head.draw();
	L.flowPara(p, { align, marginBottom });
}

// ─── Diagnostic panel ───────────────────────────────────────────────────────

const PANEL = {
	headPadY: px(5),
	headPadX: px(12),
	bodyPadTop: px(10),
	bodyPadX: px(14),
	bodyPadBottom: px(6),
	entryGap: px(8), // .dx-entry padding-bottom and margin-bottom
	gridGap: px(12)
};

function severityLabel(severity) {
	return str(severity).replace(/-/g, ' ') || 'not specified';
}

// Measure one diagnosis entry at `width`; returns { h, draw(x, y) }.
function dxEntry(L, d, width) {
	const primary = d.role === 'primary';
	const role = L.para(primary ? 'Principal diagnosis' : 'Comorbid diagnosis', S.dxRole, width);
	const chipText = severityLabel(d.severity).toUpperCase();
	const chipPadX = px(7);
	const chipW = L.widthOf(chipText, S.chip) + 2 * chipPadX;
	const chipH = S.chip.size * S.chip.lh + px(2);
	const nameSt = primary ? S.dxNamePrimary : S.dxNameComorbid;
	// The chip stays beside the name: the name wraps inside the width left over.
	const nameGap = px(8);
	const name = L.para(str(d.name), nameSt, Math.max(width - chipW - nameGap, width * 0.5));
	const nameH = Math.max(name.h, chipH);
	const codes = L.para(`DSM-5-TR ${str(d.dsmCode)} · ICD-11 ${str(d.icd11Code)}`, S.dxCodes, width);
	const rationale = L.para(`Rationale: ${str(d.rationale)}`, S.dxRationale, width);
	const h = role.h + px(2) + nameH + px(3) + codes.h + px(3) + rationale.h;

	return {
		h,
		draw(x, y) {
			L.drawPara(role, x, y);
			let cy = y + role.h + px(2);
			const nameY = cy + (nameH - name.h) / 2;
			L.drawPara(name, x, nameY);
			const lastLine = name.lines[name.lines.length - 1];
			const nameRight =
				name.lines.length === 1 ? lastLine.w : Math.max(...name.lines.map((l) => l.w));
			chip(
				L,
				chipText,
				severityColour(d.severity),
				x + nameRight + nameGap,
				cy + (nameH - chipH) / 2,
				chipW,
				chipH,
				chipPadX
			);
			cy += nameH + px(3);
			L.drawPara(codes, x, cy);
			cy += codes.h + px(3);
			L.drawPara(rationale, x, cy);
		}
	};
}

function severityColour(severity) {
	// Only mild/moderate/severe carry the standard colours; every other label is
	// neutral until the stakeholder approves a mapping (never relabelled).
	return CHIP_COLOURS[str(severity).toLowerCase()] ?? C.labelGrey;
}

function chip(L, text, fill, x, y, w, h, padX) {
	const { doc } = L;
	doc
		.save()
		.roundedRect(x, y, w, h, Math.min(px(8), h / 2))
		.fill(fill)
		.restore();
	const line = L.wrapRuns([{ ...S.chip, text }], 10_000)[0];
	if (line) L.drawLine(line, x + padX, y, h);
}

function noDiagnosisEntry(L, width) {
	const p = L.para(
		'No confirmed structured-interview diagnosis was identified.',
		S.dxRationale,
		width
	);
	return { h: p.h, draw: (x, y) => L.drawPara(p, x, y) };
}

// The panel's indivisible units: the primary entry, then comorbid entries —
// in pairs on a two-column grid when there are two or more (preview extension).
function panelUnits(L, diagnoses, innerW) {
	if (!diagnoses.length) return [noDiagnosisEntry(L, innerW)];
	const primary = diagnoses.filter((d) => d.role === 'primary');
	const comorbid = diagnoses.filter((d) => d.role !== 'primary');
	const units = primary.map((d) => dxEntry(L, d, innerW));
	if (comorbid.length < 2) {
		units.push(...comorbid.map((d) => dxEntry(L, d, innerW)));
		return units;
	}
	const cellW = (innerW - PANEL.gridGap * 2) / 2;
	for (let i = 0; i < comorbid.length; i += 2) {
		const pair = comorbid.slice(i, i + 2).map((d) => dxEntry(L, d, cellW));
		const firstRow = i === 0;
		units.push({
			h: Math.max(...pair.map((e) => e.h)) + (firstRow ? 0 : px(8)),
			// Rows after the first carry the grid's own top rule, so the unit
			// before them skips the ordinary entry rule.
			gridRow: !firstRow,
			draw(x, y) {
				let top = y;
				if (!firstRow) {
					L.hline(x, y, innerW, C.dxRule, 0.5);
					top += px(8);
				}
				pair[0].draw(x, top);
				if (pair[1]) pair[1].draw(x + cellW + PANEL.gridGap * 2, top);
			}
		});
	}
	return units;
}

function diagnosticPanel(L, letter) {
	const diagnoses = letter?.content?.diagnoses ?? [];
	const innerW = L.width - 2 * PANEL.bodyPadX;
	const units = panelUnits(L, diagnoses, innerW);
	// Standard §6.5 panel note: fixed text above the principal entry. Letters stored before it have none.
	if (str(letter?.panelNote)) {
		const note = L.para(str(letter.panelNote), S.panelNote, innerW);
		const first = units[0];
		units[0] = {
			...first,
			h: note.h + px(8) + first.h,
			draw(x, y) {
				L.drawPara(note, x, y);
				first.draw(x, y + note.h + px(8));
			}
		};
	}
	const headFor = (title) => L.para(title, S.panelHead, L.width - 2 * PANEL.headPadX);
	const heading = str(letter.panelHeading);

	// Height of units[a..b) inside a panel, including the entry rules between them.
	const bodyH = (list) =>
		list.reduce(
			(sum, u, i) =>
				sum + u.h + (i < list.length - 1 && !list[i + 1].gridRow ? PANEL.entryGap * 2 : 0),
			0
		);
	const panelH = (head, list) =>
		head.h + 2 * PANEL.headPadY + PANEL.bodyPadTop + bodyH(list) + PANEL.bodyPadBottom;

	const head = headFor(heading);
	const whole = panelH(head, units);
	const marginBottom = px(4);

	if (whole <= L.fullPage) {
		L.ensure(whole);
		drawPanel(L, head, units, bodyH);
		L.y += marginBottom;
		return;
	}

	// Fallback — a panel taller than a page: split between entries only, and
	// repeat the heading on each continuation.
	let rest = units;
	let first = true;
	while (rest.length) {
		const h = first ? head : headFor(`${heading} (continued)`);
		let take = 0;
		while (take < rest.length && panelH(h, rest.slice(0, take + 1)) <= L.remaining + 0.01) take++;
		if (take === 0) {
			if (!L.atPageTop) {
				L.newPage();
				continue;
			}
			take = 1; // one entry taller than a page: draw it and let it overflow
		}
		drawPanel(L, h, rest.slice(0, take), bodyH);
		rest = rest.slice(take);
		first = false;
		if (rest.length) L.newPage();
	}
	L.y += marginBottom;
}

function drawPanel(L, head, units, bodyH) {
	const { doc } = L;
	const x = L.left;
	const w = L.width;
	const headH = head.h + 2 * PANEL.headPadY;
	const h = headH + PANEL.bodyPadTop + bodyH(units) + PANEL.bodyPadBottom;
	const y0 = L.y;
	const r = px(3);
	L.mark('panel');

	doc.save();
	doc.roundedRect(x, y0, w, h, r).clip();
	doc.rect(x, y0, w, h).fill(C.panelFill);
	doc.rect(x, y0, w, headH).fill(C.teal);
	doc.restore();
	L.drawPara(head, x + PANEL.headPadX, y0 + PANEL.headPadY);

	let cy = y0 + headH + PANEL.bodyPadTop;
	const innerX = x + PANEL.bodyPadX;
	const innerW = w - 2 * PANEL.bodyPadX;
	units.forEach((u, i) => {
		u.draw(innerX, cy);
		cy += u.h;
		const next = units[i + 1];
		if (next && !next.gridRow) {
			cy += PANEL.entryGap;
			L.hline(innerX, cy, innerW, C.dxRule, 0.5);
			cy += PANEL.entryGap;
		}
	});

	doc.save().roundedRect(x, y0, w, h, r).lineWidth(1).strokeColor(C.teal).stroke().restore();
	L.y = y0 + h;
}

// ─── Qualifiers ─────────────────────────────────────────────────────────────

// Escape-free rich text: bold each exact emphasis substring (first occurrence,
// no overlaps), mirroring the preview's withEmphasis().
function emphasisRuns(text, emphasis, st, bold) {
	const spans = [];
	for (const e of emphasis ?? []) {
		const at = e ? text.indexOf(e) : -1;
		if (at >= 0 && !spans.some(([a, b]) => at < b && at + e.length > a))
			spans.push([at, at + e.length]);
	}
	spans.sort((a, b) => a[0] - b[0]);
	const runs = [];
	let cursor = 0;
	for (const [a, b] of spans) {
		if (a > cursor) runs.push({ ...st, text: text.slice(cursor, a) });
		runs.push({ ...bold, text: text.slice(a, b) });
		cursor = b;
	}
	if (cursor < text.length) runs.push({ ...st, text: text.slice(cursor) });
	return runs;
}

function qualifiersBlock(L, qualifiers) {
	if (!qualifiers.length) return;
	const gap = px(14);
	const colW = (L.width - gap) / 2;
	const lh = S.qual.size * S.qual.lh;
	const paraGap = px(6);
	const paras = qualifiers.map((q) => {
		const lines = L.wrapRuns(emphasisRuns(str(q.text), q.emphasis, S.qual, S.qualBold), colW);
		return { lines, h: lines.length * lh };
	});
	const note = L.para('Subthreshold, ruled-out, and other-source findings', S.qualNote, L.width);
	const noteH = px(14) + note.h + px(6);

	// Balance two columns without splitting a paragraph (CSS column-count: 2).
	const colH = (list) => list.reduce((s, p) => s + p.h + paraGap, 0);
	let split = paras.length;
	let best = Infinity;
	// Ties favour the left column, as CSS columns fill left first.
	for (let k = 0; k <= paras.length; k++) {
		const h = Math.max(colH(paras.slice(0, k)), colH(paras.slice(k)));
		if (h <= best) {
			best = h;
			split = k;
		}
	}
	const blockH = noteH + best;

	const drawNote = () => {
		L.y += px(14);
		L.mark('qualifiers');
		L.drawPara(note, L.left, L.y);
		L.y += note.h + px(6);
	};
	const drawParas = (list, x, y, w) => {
		let cy = y;
		for (const p of list) {
			p.lines.forEach((line, i) => L.drawLine(line, x, cy + i * lh, lh, { width: w }));
			cy += p.h + paraGap;
		}
	};

	if (blockH <= L.fullPage) {
		L.ensure(blockH);
		drawNote();
		drawParas(paras.slice(0, split), L.left, L.y, colW);
		drawParas(paras.slice(split), L.left + colW + gap, L.y, colW);
		L.y += best;
		return;
	}

	// Fallback — taller than a page: one full-width column, paragraph by paragraph.
	L.ensure(noteH + (paras[0]?.h ?? 0));
	drawNote();
	for (const q of qualifiers) {
		const lines = L.wrapRuns(emphasisRuns(str(q.text), q.emphasis, S.qual, S.qualBold), L.width);
		L.flowPara({ lines, lh, h: lines.length * lh }, { marginBottom: paraGap });
	}
}

// ─── Tables ─────────────────────────────────────────────────────────────────

/**
 * Generic table: columns [{ title, frac }], rows of cell builders.
 * Each cell builder is (width) => { h, draw(x, y) }.
 */
function buildTable(L, { columns, headSt, headPad, cellPad, rows }) {
	const widths = columns.map((c) => c.frac * L.width);
	const headCells = columns.map((c, i) => L.para(c.title, headSt, widths[i] - 2 * headPad.x));
	const headH = Math.max(...headCells.map((p) => p.h)) + 2 * headPad.y;
	const builtRows = rows.map((cells) => {
		const built = cells.map((make, i) => make(widths[i] - 2 * cellPad.x));
		return { cells: built, h: Math.max(...built.map((b) => b.h)) + 2 * cellPad.y };
	});
	return {
		headH,
		rows: builtRows,
		drawHead() {
			L.rect(L.left, L.y, L.width, headH, C.teal);
			let x = L.left;
			headCells.forEach((p, i) => {
				L.drawPara(p, x + headPad.x, L.y + headPad.y);
				x += widths[i];
			});
			L.y += headH;
		},
		drawRow(row) {
			let x = L.left;
			row.cells.forEach((cell, i) => {
				cell.draw(x + cellPad.x, L.y + cellPad.y);
				x += widths[i];
			});
			L.y += row.h;
			L.hline(L.left, L.y, L.width, C.border, 0.5);
		}
	};
}

const textCell = (L, text, st) => (w) => {
	const p = L.para(str(text), st, w);
	return { h: p.h, draw: (x, y) => L.drawPara(p, x, y) };
};

/**
 * A block (heading + intro + table + trailer) that stays on one page when it
 * fits on one; otherwise it breaks between rows, repeating the table header.
 * The heading always keeps the header row and first row with it.
 */
function tableBlock(L, { title, intro = [], table, trailer = [], marginBottom = 0 }) {
	const head = h2(L, title);
	const introH = intro.reduce((s, b) => s + b.h, 0);
	const rowsH = table.rows.reduce((s, r) => s + r.h, 0);
	const trailerH = trailer.reduce((s, b) => s + b.h, 0);
	const whole = head.h + introH + table.headH + rowsH + trailerH;

	if (whole <= L.fullPage) {
		L.ensure(whole);
	} else {
		L.ensure(head.h + introH + table.headH + (table.rows[0]?.h ?? 0));
	}
	head.draw();
	for (const b of intro) b.draw();
	table.drawHead();
	table.rows.forEach((row, i) => {
		if (!L.fits(row.h) && i > 0) {
			L.newPage();
			table.drawHead();
		}
		table.drawRow(row);
	});
	L.mark(`tableEnd:${title}`);
	for (const b of trailer) {
		L.ensure(b.h);
		b.draw();
	}
	L.y += marginBottom;
}

// A full-width paragraph block for tableBlock's intro/trailer lists.
function blockPara(L, text, st, marginBottom) {
	const p = L.para(text, st, L.width);
	return {
		h: p.h + marginBottom,
		draw() {
			L.drawPara(p, L.left, L.y);
			L.y += p.h + marginBottom;
		}
	};
}

// ─── Risk and protective factors ────────────────────────────────────────────

function riskBlock(L, c) {
	const risks = c.risks ?? [];
	const rows = risks.map((r) => [
		textCell(L, r.domain, S.riskDomain),
		textCell(L, r.level, { ...S.riskLevel, color: LEVEL_COLOURS[r.level] ?? C.ink }),
		textCell(L, r.note, S.riskNote)
	]);
	rows.push([
		textCell(L, 'Protective factors', S.riskDomain),
		textCell(L, '', S.riskLevel),
		textCell(L, c.protectiveFactors?.text, S.riskNote)
	]);
	const table = buildTable(L, {
		columns: [
			{ title: 'Domain', frac: 0.26 },
			{ title: 'Level', frac: 0.16 },
			{ title: 'Clinical note', frac: 0.58 }
		],
		headSt: S.riskHead,
		headPad: { x: px(8), y: px(4) },
		cellPad: { x: px(8), y: px(5) },
		rows
	});
	tableBlock(L, { title: 'Risk and Protective Factors', table, marginBottom: px(4) });
}

// ─── Treatment reference ────────────────────────────────────────────────────

// ⚑ drawn as a vector (no embedded font carries U+2691). `size` = font size.
function drawFlag(L, x, y, size, colour) {
	const { doc } = L;
	const h = size * 0.8;
	const top = y + (size * 1.4 - h) / 2;
	doc.save();
	doc.lineWidth(Math.max(0.6, size * 0.08)).strokeColor(colour);
	doc
		.moveTo(x + size * 0.08, top)
		.lineTo(x + size * 0.08, top + h)
		.stroke();
	doc
		.moveTo(x + size * 0.08, top)
		.lineTo(x + size * 0.62, top + h * 0.22)
		.lineTo(x + size * 0.08, top + h * 0.46)
		.closePath()
		.fill(colour);
	doc.restore();
}
const FLAG_W = (size) => size * 0.72;

// Medication-classes cell: text, then ⚑ after the last word when flagged.
const medicationCell = (L, text, flagged) => (w) => {
	const st = S.trCell;
	const p = L.para(str(text), st, w);
	const space = L.widthOf(' ', st);
	const last = p.lines[p.lines.length - 1];
	const flagOnNewLine = flagged && last && last.w + space + FLAG_W(st.size) > w;
	const h = p.h + (flagOnNewLine ? p.lh : 0);
	return {
		h,
		draw(x, y) {
			L.drawPara(p, x, y);
			if (!flagged) return;
			const fy = flagOnNewLine ? y + p.h : y + (p.lines.length - 1) * p.lh;
			const fx = flagOnNewLine || !last ? x : x + last.w + space;
			drawFlag(L, fx, fy, st.size, C.ink);
		}
	};
};

function treatmentBlock(L, letter) {
	const c = letter?.content ?? {};
	const nameOf = (id) =>
		(c.diagnoses ?? []).find((d) => d.id === id)?.name ?? '[Unmatched diagnosis — review required]';
	const rows = (c.treatmentReference ?? []).map((r) => [
		textCell(L, nameOf(r.diagnosisId), S.trCell),
		textCell(L, r.treatmentOptions, S.trCell),
		medicationCell(L, r.medicationClasses, r.interactionFlag === true),
		textCell(L, r.planningConsiderations, S.trCell),
		textCell(L, `${str(r.evidenceStrength)} — ${str(r.guidelineSource)}`, S.trCell)
	]);
	const table = buildTable(L, {
		columns: [
			{ title: 'Diagnosis according to PsyMatch', frac: 0.18 },
			{ title: 'Guideline-supported treatment options', frac: 0.2 },
			{ title: 'Medication classes referenced in guidelines', frac: 0.2 },
			{ title: 'Treatment planning considerations', frac: 0.26 },
			{ title: 'Evidence and source', frac: 0.16 }
		],
		headSt: S.trHead,
		headPad: { x: px(6), y: px(5) },
		cellPad: { x: px(6), y: px(6) },
		rows
	});

	const trailer = [];
	const note = str(c.interactionNote).trim();
	if (note) {
		const indent = FLAG_W(S.flagNote.size) + L.widthOf(' ', S.flagNote);
		const p = L.para(note, S.flagNote, L.width - indent);
		trailer.push({
			h: px(4) + p.h + px(6),
			draw() {
				L.y += px(4);
				drawFlag(L, L.left, L.y, S.flagNote.size, C.amber);
				L.drawPara(p, L.left + indent, L.y);
				L.y += p.h + px(6);
			}
		});
	}
	trailer.push(blockPara(L, str(letter.medicationStatement), S.medStatement, 0));

	tableBlock(L, {
		title: 'Treatment Reference',
		intro: [blockPara(L, str(letter.treatmentIntroduction), S.trMessage, px(6))],
		table,
		trailer: [{ h: px(4), draw: () => (L.y += px(4)) }, ...trailer]
	});
}

// ─── Limitations + closing ──────────────────────────────────────────────────

function limitationsAndClosing(L, letter) {
	const c = letter?.content ?? {};
	const text = [str(c.limitations), ...(letter.metadataLimitations ?? []).map(str)]
		.filter(Boolean)
		.join(' ');
	const head = h2(L, 'Limitations and Provenance');
	const p = L.para(text, S.limitations, L.width);
	const afterLimitations = px(8);

	const closing = closingBlock(L, letter);

	// Heading keeps two lines with it.
	L.ensure(head.h + Math.min(2, p.lines.length) * p.lh);
	head.draw();

	// Lay out the paragraph so that the closing never lands alone on a page:
	// when the closing doesn't fit after the last line, at least two lines of
	// the paragraph move with it.
	const n = p.lines.length;
	let i = 0;
	while (i < n) {
		const room = Math.floor((L.remaining + 0.01) / p.lh);
		const left = n - i;
		const allWithClosing = left * p.lh + afterLimitations + closing.h;
		if (allWithClosing <= L.remaining + 0.01) break; // everything fits here
		let take = Math.min(room, left);
		// Carry at least two lines to the page the closing will land on.
		take = Math.min(take, left - Math.min(2, left));
		// Orphan control: don't strand a single line at the bottom of a page.
		if (take > 0 && take < 2 && left > 2) take = 0;
		if (take <= 0) {
			if (L.atPageTop) break; // can't do better; draw the rest here
			L.newPage();
			continue;
		}
		for (let k = 0; k < take; k++, i++) {
			L.drawLine(p.lines[i], L.left, L.y, p.lh, {
				align: 'justify',
				width: L.width,
				last: i === n - 1
			});
			L.y += p.lh;
		}
		L.newPage();
	}
	for (; i < n; i++) {
		if (!L.fits(p.lh)) L.newPage();
		L.drawLine(p.lines[i], L.left, L.y, p.lh, {
			align: 'justify',
			width: L.width,
			last: i === n - 1
		});
		L.y += p.lh;
	}
	L.mark('limitationsLastLine');
	L.y += afterLimitations;
	L.ensure(closing.h);
	L.mark('closing');
	closing.draw();
}

// .closing-block { margin-top: 10px } p { margin-bottom: 14px } .sig-space 40px
function closingBlock(L, letter) {
	const sig = letter.signature ?? {};
	const parts = [
		{ p: L.para(str(letter?.content?.closing), S.closing, L.width), after: px(14) },
		{ p: L.para(str(letter.signOff), S.closing, L.width), after: px(40) },
		{
			p: L.para(
				[sig.name, sig.credentials].map(str).filter(Boolean).join(', '),
				S.sigName,
				L.width
			),
			after: 0
		},
		{ p: L.para(str(sig.title), S.sigTitle, L.width), after: 0 },
		{ p: L.para(str(sig.clinic), S.sigTitle, L.width), after: 0 }
	].filter(({ p }) => p.lines.length);
	const h = px(10) + parts.reduce((s, { p, after }) => s + p.h + after, 0);
	return {
		h,
		draw() {
			L.y += px(10);
			for (const { p, after } of parts) {
				L.drawPara(p, L.left, L.y);
				L.y += p.h + after;
			}
		}
	};
}

// ─── Footer ─────────────────────────────────────────────────────────────────

// @bottom-left: the document's fixed footer text; @bottom-right: Page N of M.
function stampFooters(L, footerText) {
	const { doc } = L;
	const range = doc.bufferedPageRange();
	for (let i = range.start; i < range.start + range.count; i++) {
		doc.switchToPage(i);
		const prevBottom = doc.page.margins.bottom;
		doc.page.margins.bottom = 0;
		const lh = S.footer.size * S.footer.lh;
		// Vertically centred in the bottom margin, as CSS margin boxes are.
		const y = doc.page.height - MARGINS.bottom / 2 - lh / 2;
		const right = `Page ${i - range.start + 1} of ${range.count}`;
		const rightW = L.widthOf(right, S.footer);
		const leftLines = L.wrapRuns([{ ...S.footer, text: footerText }], L.width - rightW - px(12));
		leftLines.forEach((line, k) => L.drawLine(line, L.left, y + k * lh, lh));
		const rl = L.wrapRuns([{ ...S.footer, text: right }], 10_000)[0];
		L.drawLine(rl, L.left, y, lh, { align: 'right', width: L.width });
		doc.page.margins.bottom = prevBottom;
	}
}
