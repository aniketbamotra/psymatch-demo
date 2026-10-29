// Word counterpart of pdfGenerators/referralLetterPdf.js: the standalone
// referral letter (`psymatch.referral_letter.v1`) in the Revision 4 design.
//
// Word paginates the file itself, so the PDF's pagination rules become Word
// properties: the diagnostic panel is one table whose rows can't split and
// whose paragraphs keep with the next; table header rows repeat; headings keep
// with what follows; the last limitations lines keep with the closing.
//
// Conventions shared with aiReportDocx.js: embedded Inter for sans (same
// fontTable fix), the theme serif for body, a border-free Normal style, and
// SimpleField page numbers with a styled cached result.
//
// Input must already be de-tokenized (or masked). Pure: imports only 'docx',
// the shared theme and embedded fonts.

import {
	Document,
	Packer,
	Paragraph,
	TextRun,
	Table,
	TableRow,
	TableCell,
	WidthType,
	BorderStyle,
	AlignmentType,
	Footer,
	SimpleField,
	VerticalAlign,
	TableLayoutType,
	LineRuleType,
	ShadingType,
	TabStopType,
	Tab
} from 'docx';
import { REPORT_STYLE } from '../aiReportTheme.js';
import { FONTS } from '../pdfGenerators/embeddedAssets.js';

const twips = (points) => Math.round(points * 20);
const half = (points) => Math.round(points * 2); // docx run size = half-points
const px = (v) => v * 0.75;
const MM = 72 / 25.4;

const FONT = REPORT_STYLE.fonts.sans;
const SERIF = REPORT_STYLE.fonts.serif;
const FLAG_FONT = 'Segoe UI Symbol'; // Word substitutes a symbol font that has ⚑ elsewhere

const C = {
	teal: '14606E',
	panelFill: 'F2F7F8',
	ink: '1F2937',
	grey: '6B7280',
	labelGrey: '456369',
	border: 'D7DDDC',
	dxRule: 'CFE0DF',
	green: '2E7D4F',
	amber: 'B8860B',
	red: 'B3261E',
	white: 'FFFFFF'
};

const PAGE = { width: 612, height: 792 };
const MARGINS = { top: 0.65 * 72, right: 0.75 * 72, bottom: 0.85 * 72, left: 0.75 * 72 };
const CONTENT_W = twips(PAGE.width - MARGINS.left - MARGINS.right);
const DEFAULT_LETTERHEAD_MM = 40;

const CHIP_COLOURS = { mild: C.green, moderate: C.amber, severe: C.red };
const LEVEL_COLOURS = { Low: C.green, 'Not assessed': C.amber };

const str = (v) => (v == null ? '' : String(v));

// ─── Public entrypoint ──────────────────────────────────────────────────────

/**
 * @param {object} letter  A de-tokenized `psymatch.referral_letter.v1` document.
 * @returns {Promise<Buffer>}
 */
export async function renderReferralLetterDocx(letter) {
	const doc = new Document({
		creator: 'PsyMatch',
		title: 'Referral letter',
		fonts: [
			{ name: FONT, data: FONTS.regular },
			{ name: `${FONT} Bold`, data: FONTS.bold },
			{ name: `${FONT} SemiBold`, data: FONTS.semibold },
			{ name: `${FONT} Italic`, data: FONTS.italic }
		],
		styles: {
			paragraphStyles: [
				{ id: 'Normal', name: 'Normal', next: 'Normal' },
				{
					id: 'LetterFooter',
					name: 'Letter Footer',
					basedOn: 'Normal',
					run: { font: FONT, size: half(7), italics: false, bold: false, color: C.grey },
					paragraph: { spacing: { before: 0, after: 0 } }
				}
			],
			default: {
				document: {
					run: { font: SERIF, size: half(10), color: C.ink },
					paragraph: { spacing: { before: 0, after: 0 }, widowControl: true }
				}
			}
		},
		sections: [
			{
				properties: {
					page: {
						size: { width: twips(PAGE.width), height: twips(PAGE.height) },
						margin: {
							top: twips(MARGINS.top),
							right: twips(MARGINS.right),
							bottom: twips(MARGINS.bottom),
							left: twips(MARGINS.left),
							footer: twips(MARGINS.bottom / 2 - 6)
						}
					}
				},
				footers: { default: footer(str(letter?.footer)) },
				children: letterChildren(letter)
			}
		]
	});

	// Same fontTable override as aiReportDocx.js: bind the bold/italic files to
	// the family, with braced GUIDs so LibreOffice honours them.
	const keys = doc.FontTable.fontOptionsWithKey.map((font) => font.fontKey);
	const embedded = (tag, index) =>
		`<w:${tag} r:id="rId${index + 1}" w:fontKey="{${keys[index].toUpperCase()}}"/>`;
	const fontTable = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:font w:name="${FONT}"><w:family w:val="swiss"/>${embedded('embedRegular', 0)}${embedded('embedBold', 1)}${embedded('embedItalic', 3)}</w:font>
<w:font w:name="${FONT} SemiBold"><w:family w:val="swiss"/>${embedded('embedRegular', 2)}</w:font>
</w:fonts>`;
	return Packer.toBuffer(doc, false, [{ path: 'word/fontTable.xml', data: fontTable }]);
}

// ─── Primitives ─────────────────────────────────────────────────────────────

// opts: { sans, bold, semibold, italic, size (pt), color, spacing (pt), upper, shading }
function run(text, opts = {}) {
	const t = opts.upper ? str(text).toUpperCase() : str(text);
	return new TextRun({
		text: t,
		font: opts.font ?? (opts.sans ? (opts.semibold ? `${FONT} SemiBold` : FONT) : SERIF),
		size: half(opts.size ?? 10),
		bold: !!opts.bold,
		italics: !!opts.italic,
		color: opts.color ?? C.ink,
		characterSpacing: opts.spacing ? twips(opts.spacing) : undefined,
		shading: opts.shading
	});
}

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
// Clear body borders explicitly (see aiReportDocx.js: Pages draws stray rules).
const BODY_PARAGRAPH_BORDERS = {
	bottom: NO_BORDER,
	left: NO_BORDER,
	right: NO_BORDER,
	between: NO_BORDER
};
const NONE_BORDERS = {
	top: NO_BORDER,
	bottom: NO_BORDER,
	left: NO_BORDER,
	right: NO_BORDER,
	insideHorizontal: NO_BORDER,
	insideVertical: NO_BORDER
};
const rule = (color, pt) => ({
	style: BorderStyle.SINGLE,
	size: Math.max(2, Math.round(pt * 8)),
	color
});

// opts: { after, before (pt), lh (multiple), align, keepNext, keepLines, border, indent }
function para(children, opts = {}) {
	return new Paragraph({
		style: 'Normal',
		children: Array.isArray(children) ? children : [children],
		alignment: opts.align ?? AlignmentType.LEFT,
		spacing: {
			before: twips(opts.before ?? 0),
			after: twips(opts.after ?? 0),
			line: Math.round(240 * (opts.lh ?? 1.25)),
			lineRule: LineRuleType.AUTO
		},
		keepNext: opts.keepNext,
		keepLines: opts.keepLines,
		indent: opts.indent,
		border: opts.border ?? BODY_PARAGRAPH_BORDERS
	});
}

function cell(children, { width, fill, margins, borders, columnSpan, verticalAlign } = {}) {
	return new TableCell({
		width: width ? { size: width, type: WidthType.DXA } : undefined,
		columnSpan,
		shading: fill ? { type: ShadingType.CLEAR, color: 'auto', fill } : undefined,
		margins: margins ?? { top: 0, bottom: 0, left: 0, right: 0 },
		borders: borders ?? { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER },
		verticalAlign: verticalAlign ?? VerticalAlign.TOP,
		children
	});
}

function h2(title, { keepNext = true } = {}) {
	return para([run(title, { sans: true, bold: true, size: 10.5, color: C.teal })], {
		before: px(14),
		after: px(8),
		keepNext,
		border: { ...BODY_PARAGRAPH_BORDERS, bottom: { ...rule(C.teal, 1), space: 2 } }
	});
}

// ─── The letter ─────────────────────────────────────────────────────────────

function letterChildren(letter) {
	const c = letter?.content ?? {};
	const out = [];

	// §14.5 letterhead clearance on page 1: the page margin already gives
	// MARGINS.top, the rest is an exact-height empty paragraph.
	const mm =
		Number(letter?.layout?.letterheadDepthMm) > 0
			? Number(letter.layout.letterheadDepthMm)
			: DEFAULT_LETTERHEAD_MM;
	const extra = mm * MM - MARGINS.top;
	if (extra > 1) {
		out.push(
			new Paragraph({
				style: 'Normal',
				border: BODY_PARAGRAPH_BORDERS,
				spacing: { before: 0, after: 0, line: twips(extra), lineRule: LineRuleType.EXACT },
				children: [new TextRun({ text: '', size: 2 })]
			})
		);
	}

	out.push(para([run(letter.reportDate)], { after: px(22), lh: 1.4 }));
	const r = letter.recipient ?? {};
	const addr = [r.name, r.practice, r.street, r.locality].map(str).filter(Boolean);
	addr.forEach((line, i) =>
		out.push(
			para([run(line)], { lh: 1.55, after: i === addr.length - 1 ? px(18) : 0, keepNext: true })
		)
	);
	out.push(
		para(
			[
				run(
					`Patient ID: ${str(letter.patientId)} · ${str(letter.assessmentDateLabel)}: ${str(letter.assessmentDate)} · Report date: ${str(letter.reportDate)}`,
					{ sans: true, size: 8, color: C.grey }
				)
			],
			{ after: px(6), lh: 1.4 }
		)
	);
	out.push(...identification(letter));
	out.push(para([run(letter.salutation)], { after: px(12), lh: 1.4, keepNext: true }));
	out.push(para([run(letter.opening)], { after: px(16), lh: 1.4, align: AlignmentType.JUSTIFIED }));

	out.push(h2('Clinical Snapshot'));
	out.push(para([run(c.clinicalSnapshot, { size: 9.8 })], { after: px(16), lh: 1.4 }));

	out.push(diagnosticPanel(letter));
	out.push(...qualifiers(c.qualifiers ?? []));

	out.push(riskTable(c));
	out.push(treatmentTable(c, letter));
	if (str(c.interactionNote).trim()) {
		out.push(
			para(
				[
					run('⚑ ', { font: FLAG_FONT, size: 7.8, color: C.amber }),
					run(str(c.interactionNote).trim(), { sans: true, size: 7.8, color: C.amber })
				],
				{ before: px(4), after: px(6), lh: 1.4 }
			)
		);
	}
	out.push(
		para(
			[run(letter.medicationStatement, { sans: true, italic: true, size: 7.5, color: C.grey })],
			{
				before: px(4),
				lh: 1.4
			}
		)
	);

	const limitations = [str(c.limitations), ...(letter.metadataLimitations ?? []).map(str)]
		.filter(Boolean)
		.join(' ');
	out.push(h2('Limitations and Provenance'));
	// keepNext: the paragraph's last lines travel with the closing, so the
	// closing never sits alone on a page (widow control keeps two lines).
	out.push(
		para([run(limitations, { size: 9.3 })], {
			after: px(8),
			lh: 1.4,
			align: AlignmentType.JUSTIFIED,
			keepNext: true
		})
	);
	out.push(...closing(letter));
	return out;
}

function identification(letter) {
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
	const out = [];
	rows.forEach(([label, value], i) => {
		const last = i === rows.length - 1;
		// Rev 4 §4.2 (client edit): label and entry on the same line.
		out.push(
			para(
				[
					run(`${label}:`, {
						sans: true,
						bold: true,
						size: 7.5,
						color: C.labelGrey,
						upper: true,
						spacing: 0.3
					}),
					run(` ${str(value)}`, { size: 9.5 })
				],
				{
					before: px(2),
					after: last ? px(8) + px(14) : px(2),
					lh: 1.4,
					border: last
						? { ...BODY_PARAGRAPH_BORDERS, bottom: { ...rule(C.border, 0.75), space: 4 } }
						: undefined
				}
			)
		);
	});
	return out;
}

// ─── Diagnostic panel ───────────────────────────────────────────────────────

function severityLabel(severity) {
	return (str(severity).replace(/-/g, ' ') || 'not specified').toUpperCase();
}
function severityColour(severity) {
	// Neutral for every label beyond mild/moderate/severe (never relabelled).
	return CHIP_COLOURS[str(severity).toLowerCase()] ?? C.labelGrey;
}

// One diagnosis entry as paragraphs. Every paragraph keeps with the next so
// the whole panel stays on one page when it fits.
// `release` drops keepNext from the last paragraph: the panel's final row must
// not bind to what follows it.
function dxParas(d, release = false) {
	const primary = d.role === 'primary';
	const chipFill = severityColour(d.severity);
	const keep = { keepNext: true, keepLines: true };
	return [
		para(
			[
				run(primary ? 'Principal diagnosis' : 'Comorbid diagnosis', {
					sans: true,
					size: 7.5,
					color: C.labelGrey,
					upper: true,
					spacing: 0.375
				})
			],
			{ after: px(2), ...keep }
		),
		para(
			[
				run(d.name, { sans: true, bold: true, size: primary ? 13 : 11, color: C.teal }),
				// No-break spaces bind the chip to the name's last word.
				run('\u00a0\u00a0', { sans: true, size: 7.5 }),
				run(`\u00a0${severityLabel(d.severity)}\u00a0`, {
					sans: true,
					bold: true,
					size: 7.5,
					color: C.white,
					spacing: 0.2,
					shading: { type: ShadingType.CLEAR, color: 'auto', fill: chipFill }
				})
			],
			{ after: px(3), ...keep }
		),
		para(
			[
				run(`DSM-5-TR ${str(d.dsmCode)} · ICD-11 ${str(d.icd11Code)}`, {
					sans: true,
					size: 8,
					color: C.labelGrey
				})
			],
			{
				after: px(3),
				lh: 1.4,
				...keep
			}
		),
		para([run(`Rationale: ${str(d.rationale)}`, { size: 9.5 })], {
			lh: 1.4,
			...keep,
			keepNext: !release
		})
	];
}

function diagnosticPanel(letter) {
	const diagnoses = letter?.content?.diagnoses ?? [];
	const primary = diagnoses.filter((d) => d.role === 'primary');
	const comorbid = diagnoses.filter((d) => d.role !== 'primary');
	const padX = twips(px(14));
	const half_ = Math.floor(CONTENT_W / 2);
	const widths = [half_, CONTENT_W - half_];
	const inner = rule(C.dxRule, 0.5);
	const entryMargins = (first, last) => ({
		top: twips(first ? px(10) : px(8)),
		bottom: twips(last ? px(6) : px(8)),
		left: padX,
		right: padX
	});

	// Body rows: primary full width; comorbid full width if only one, else in
	// pairs (the preview's two-column grid). Each cell is a builder taking the
	// `release` flag, set only on the last row.
	const body = [];
	if (!diagnoses.length) {
		body.push([
			() => [
				para([run('No confirmed structured-interview diagnosis was identified.', { size: 9.5 })], {
					lh: 1.4
				})
			]
		]);
	}
	for (const d of primary) body.push([(release) => dxParas(d, release)]);
	if (comorbid.length === 1) body.push([(release) => dxParas(comorbid[0], release)]);
	else
		for (let i = 0; i < comorbid.length; i += 2) {
			const [a, b] = [comorbid[i], comorbid[i + 1]];
			body.push([
				(release) => dxParas(a, release),
				(release) => (b ? dxParas(b, release) : [para([])])
			]);
		}

	// Standard §6.5 panel note: fixed text above the principal entry. Letters stored before it have none.
	if (str(letter?.panelNote) && body.length) {
		const [build, ...rest] = body[0];
		body[0] = [
			(release) => [
				para([run(letter.panelNote, { sans: true, italic: true, size: 8, color: C.labelGrey })], {
					after: px(8),
					lh: 1.4
				}),
				...build(release)
			],
			...rest
		];
	}

	const rows = [
		new TableRow({
			cantSplit: true,
			children: [
				cell(
					[
						para(
							[
								run(str(letter.panelHeading), {
									sans: true,
									bold: true,
									size: 10.5,
									color: C.white
								})
							],
							{ keepNext: true }
						)
					],
					{
						width: CONTENT_W,
						columnSpan: 2,
						fill: C.teal,
						margins: {
							top: twips(px(5)),
							bottom: twips(px(5)),
							left: twips(px(12)),
							right: twips(px(12))
						}
					}
				)
			]
		}),
		...body.map((cells, i) => {
			const first = i === 0;
			const last = i === body.length - 1;
			const edge = {
				top: first ? NO_BORDER : inner,
				bottom: NO_BORDER,
				left: NO_BORDER,
				right: NO_BORDER
			};
			const content = cells.map((build) => build(last));
			return new TableRow({
				cantSplit: true,
				children:
					content.length === 1
						? [
								cell(content[0], {
									width: CONTENT_W,
									columnSpan: 2,
									fill: C.panelFill,
									margins: entryMargins(first, last),
									borders: edge
								})
							]
						: content.map((paras, k) =>
								cell(paras, {
									width: widths[k],
									fill: C.panelFill,
									margins: {
										...entryMargins(first, last),
										left: k === 0 ? padX : twips(px(12)),
										right: k === 0 ? twips(px(12)) : padX
									},
									borders: edge
								})
							)
			});
		})
	];

	const outer = rule(C.teal, 1);
	return new Table({
		layout: TableLayoutType.FIXED,
		width: { size: CONTENT_W, type: WidthType.DXA },
		columnWidths: widths,
		borders: { ...NONE_BORDERS, top: outer, bottom: outer, left: outer, right: outer },
		rows
	});
}

// ─── Qualifiers ─────────────────────────────────────────────────────────────

function emphasisRuns(text, emphasis, opts) {
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
		if (a > cursor) runs.push(run(text.slice(cursor, a), opts));
		runs.push(run(text.slice(a, b), { ...opts, bold: true }));
		cursor = b;
	}
	if (cursor < text.length) runs.push(run(text.slice(cursor), opts));
	return runs;
}

function qualifiers(list) {
	if (!list.length) return [];
	const note = para(
		[
			run('Subthreshold, ruled-out, and other-source findings', {
				sans: true,
				size: 7,
				color: C.labelGrey,
				upper: true,
				spacing: 0.35
			})
		],
		// The note is the table's first row (see dataTable's `lead`).
		{ before: px(14), after: px(6), keepNext: true }
	);
	// Two balanced columns (by text length), paragraphs never split.
	const lengths = list.map((q) => str(q.text).length + 40);
	const total = lengths.reduce((a, b) => a + b, 0);
	let split = list.length;
	let best = Infinity;
	// Ties favour the left column, as CSS columns fill left first.
	for (let k = 0, acc = 0; k <= list.length; acc += lengths[k] ?? 0, k++) {
		const h = Math.max(acc, total - acc);
		if (h <= best) {
			best = h;
			split = k;
		}
	}
	const colParas = (qs) =>
		qs.length
			? qs.map((q) =>
					para(emphasisRuns(str(q.text), q.emphasis, { size: 8.3 }), {
						after: px(6),
						lh: 1.35,
						keepLines: true
					})
				)
			: [para([])];
	const gap = twips(px(14));
	const colW = Math.floor((CONTENT_W - gap) / 2);
	return [
		new Table({
			layout: TableLayoutType.FIXED,
			width: { size: CONTENT_W, type: WidthType.DXA },
			columnWidths: [colW, CONTENT_W - colW],
			borders: NONE_BORDERS,
			rows: [
				new TableRow({
					cantSplit: true,
					children: [cell([note], { width: CONTENT_W, columnSpan: 2 })]
				}),
				new TableRow({
					cantSplit: true,
					children: [
						cell(colParas(list.slice(0, split)), {
							width: colW,
							margins: { top: 0, bottom: 0, left: 0, right: gap }
						}),
						cell(colParas(list.slice(split)), { width: CONTENT_W - colW })
					]
				})
			]
		})
	];
}

// ─── Tables ─────────────────────────────────────────────────────────────────

// Rows are arrays of cell builders `(keepNext) => Paragraph[]`. Every row but
// the last keeps with the next, so the table stays on one page when it fits
// (CSS break-inside: avoid); a longer table breaks between rows (cantSplit)
// and repeats its header row.
//
// `lead` (the section heading, plus any intro) is the table's first row, not a
// paragraph before it: Pages reads keep-with-next on a paragraph before a table
// as "keep with the whole table and what follows" and pushes the block a page
// down. Inside the table it binds only to the header row.
function dataTable({ lead = [], columns, headSize, headSpacing, cellPad, headPad, rows }) {
	const widths = columns.map((c) => Math.round(c.frac * CONTENT_W));
	widths[widths.length - 1] = CONTENT_W - widths.slice(0, -1).reduce((a, b) => a + b, 0);
	const line = rule(C.border, 0.5);
	const header = new TableRow({
		tableHeader: true,
		cantSplit: true,
		children: columns.map((c, i) =>
			cell(
				[
					para(
						[
							run(c.title, {
								sans: true,
								bold: true,
								size: headSize,
								color: C.white,
								upper: true,
								spacing: headSpacing
							})
						],
						{ lh: 1.3, keepNext: true }
					)
				],
				{
					width: widths[i],
					fill: C.teal,
					verticalAlign: VerticalAlign.CENTER,
					margins: {
						top: twips(headPad.y),
						bottom: twips(headPad.y),
						left: twips(headPad.x),
						right: twips(headPad.x)
					}
				}
			)
		)
	});
	const body = rows.map(
		(cells, r) =>
			new TableRow({
				cantSplit: true,
				children: cells.map((build, i) =>
					cell(build(r < rows.length - 1), {
						width: widths[i],
						margins: {
							top: twips(cellPad.y),
							bottom: twips(cellPad.y),
							left: twips(cellPad.x),
							right: twips(cellPad.x)
						},
						borders: { top: NO_BORDER, left: NO_BORDER, right: NO_BORDER, bottom: line }
					})
				)
			})
	);
	const leadRow = lead.length
		? [
				new TableRow({
					cantSplit: true,
					children: [cell(lead, { width: CONTENT_W, columnSpan: columns.length })]
				})
			]
		: [];
	return new Table({
		layout: TableLayoutType.FIXED,
		width: { size: CONTENT_W, type: WidthType.DXA },
		columnWidths: widths,
		borders: NONE_BORDERS,
		rows: [...leadRow, header, ...body]
	});
}

function riskTable(c) {
	const text = (value, opts) => (keepNext) => [para([run(value, opts)], { lh: 1.4, keepNext })];
	const rows = (c.risks ?? []).map((r) => [
		text(r.domain, { sans: true, semibold: true, size: 8.8 }),
		text(r.level, { sans: true, bold: true, size: 8.8, color: LEVEL_COLOURS[r.level] ?? C.ink }),
		text(r.note, { size: 8.8 })
	]);
	rows.push([
		text('Protective factors', { sans: true, semibold: true, size: 8.8 }),
		text('', { size: 8.8 }),
		text(c.protectiveFactors?.text, { size: 8.8 })
	]);
	return dataTable({
		lead: [h2('Risk and Protective Factors')],
		columns: [
			{ title: 'Domain', frac: 0.26 },
			{ title: 'Level', frac: 0.16 },
			{ title: 'Clinical note', frac: 0.58 }
		],
		headSize: 7.5,
		headSpacing: 0.3,
		headPad: { x: px(8), y: px(4) },
		cellPad: { x: px(8), y: px(5) },
		rows
	});
}

function treatmentTable(c, letter) {
	const nameOf = (id) =>
		(c.diagnoses ?? []).find((d) => d.id === id)?.name ?? '[Unmatched diagnosis — review required]';
	const cellPara = (text) => (keepNext) => [para([run(text, { size: 8 })], { lh: 1.4, keepNext })];
	const rows = (c.treatmentReference ?? []).map((r) => [
		cellPara(nameOf(r.diagnosisId)),
		cellPara(r.treatmentOptions),
		(keepNext) => [
			para(
				[
					run(r.medicationClasses, { size: 8 }),
					// ⚑ comes only from interactionFlag, never from the text.
					...(r.interactionFlag === true ? [run('\u00a0⚑', { font: FLAG_FONT, size: 8 })] : [])
				],
				{ lh: 1.4, keepNext }
			)
		],
		cellPara(r.planningConsiderations),
		cellPara(`${str(r.evidenceStrength)} — ${str(r.guidelineSource)}`)
	]);
	return dataTable({
		lead: [
			h2('Treatment Reference'),
			para(
				[
					run(letter.treatmentIntroduction, {
						sans: true,
						italic: true,
						size: 8.3,
						color: C.labelGrey
					})
				],
				{
					after: px(6),
					lh: 1.4,
					keepNext: true
				}
			)
		],
		columns: [
			{ title: 'Diagnosis according to PsyMatch', frac: 0.18 },
			{ title: 'Guideline-supported treatment options', frac: 0.2 },
			{ title: 'Medication classes referenced in guidelines', frac: 0.2 },
			{ title: 'Treatment planning considerations', frac: 0.26 },
			{ title: 'Evidence and source', frac: 0.16 }
		],
		headSize: 7,
		headSpacing: 0.14,
		headPad: { x: px(6), y: px(5) },
		cellPad: { x: px(6), y: px(6) },
		rows
	});
}

// ─── Closing ────────────────────────────────────────────────────────────────

function closing(letter) {
	const sig = letter.signature ?? {};
	const keep = { keepNext: true, keepLines: true, lh: 1.4 };
	const out = [
		para([run(letter?.content?.closing)], { ...keep, before: px(10), after: px(14) }),
		para([run(letter.signOff)], { ...keep, after: px(40) })
	];
	const lines = [
		[[sig.name, sig.credentials].map(str).filter(Boolean).join(', '), { bold: true }],
		[str(sig.title), { size: 9.5, color: C.grey }],
		[str(sig.clinic), { size: 9.5, color: C.grey }]
	].filter(([text]) => text);
	lines.forEach(([text, opts], i) =>
		out.push(para([run(text, opts)], { ...keep, keepNext: i < lines.length - 1 }))
	);
	return out;
}

// ─── Footer: fixed text left, Page N of M right ─────────────────────────────

function pageField(instruction) {
	const field = new SimpleField(instruction);
	field.addChildElement(
		new TextRun({
			text: '1',
			font: FONT,
			size: half(7),
			italics: false,
			bold: false,
			color: C.grey
		})
	);
	return field;
}

// One paragraph with a right tab stop: Pages ignores the column widths of a
// footer table and runs the two parts together.
function footer(text) {
	const footRun = (t) =>
		new TextRun({ text: t, font: FONT, size: half(7), italics: false, bold: false, color: C.grey });
	return new Footer({
		children: [
			new Paragraph({
				style: 'LetterFooter',
				tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W }],
				children: [
					footRun(text),
					new TextRun({ children: [new Tab()], font: FONT, size: half(7) }),
					footRun('Page '),
					pageField('PAGE'),
					footRun(' of '),
					pageField('NUMPAGES')
				]
			})
		]
	});
}
