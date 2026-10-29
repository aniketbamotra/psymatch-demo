// In-app docx renderer for the AI clinical reports — the Word counterpart of
// aiReportPdf.js. Same content, same four formats, but as a flowing styled Word
// document (cards/grids → bordered Tables). Colors come from the shared theme.
//
// Pure-ish: imports 'docx', shared theme and embedded assets (no $env/$app/$lib)
// so it stays node-testable AND route-importable. Accepts the SAME three data
// shapes the PDF renderer does (buildReportData / buildLetterData /
// buildPatientSummaryData).

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
	ImageRun,
	TableLayoutType,
	LineRuleType,
	HeadingLevel,
	LevelFormat
} from 'docx';
import { themeFor, REPORT_STYLE, identificationRows, reportSubtitle } from '../aiReportTheme.js';
import { FONTS, LOGO } from '../pdfGenerators/embeddedAssets.js';

// Geometry is always derived per render (never global mutable state).
const twips = (points) => Math.round(points * 20);
const contentWidth = (theme) => twips(theme.page.width - theme.margins.left - theme.margins.right);

const hex = (c) => String(c || '').replace('#', '') || '000000';
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
const FONT = REPORT_STYLE.fonts.sans;
const SERIF = REPORT_STYLE.fonts.serif;
const SZ = Object.fromEntries(
	Object.entries(REPORT_STYLE.size).map(([key, points]) => [key, points * 2])
);

// ─── Public entrypoint ──────────────────────────────────────────────────────

/**
 * @param {object} data
 * @param {object} opts
 * @param {'comprehensive'|'concise'|'referral'|'patient_summary'} opts.format
 * @param {'en'|'fr'} [opts.language]
 * @returns {Promise<Buffer>}
 */
export async function renderAiDocx(data, { format, language } = {}) {
	const theme = themeFor(format);
	const ctx = { theme, format, language };

	let children;
	if (format === 'referral') children = letterChildren(ctx, data);
	else if (format === 'patient_summary') children = summaryChildren(ctx, data);
	else children = reportChildren(ctx, data);

	const doc = new Document({
		creator: 'PsyMatch',
		title: data?.meta?.title || theme.title,
		// Reuse the PDF's embedded Inter assets, including each weight used below.
		fonts: [
			{ name: FONT, data: FONTS.regular },
			{ name: `${FONT} Bold`, data: FONTS.bold },
			{ name: `${FONT} SemiBold`, data: FONTS.semibold },
			{ name: `${FONT} Italic`, data: FONTS.italic }
		],
		numbering: {
			config: [
				{
					reference: 'report-bullets',
					levels: [
						{
							level: 0,
							format: LevelFormat.BULLET,
							text: '•',
							alignment: AlignmentType.LEFT,
							style: {
								run: { font: FONT, size: 12, color: hex(theme.palette.accent) },
								paragraph: { indent: { left: 200, hanging: 200 } }
							}
						}
					]
				}
			]
		},
		styles: {
			paragraphStyles: [
				{
					id: 'Normal',
					name: 'Normal',
					next: 'Normal'
				},
				{
					id: 'ReportFooter',
					name: 'Report Footer',
					basedOn: 'Normal',
					run: {
						font: FONT,
						size: SZ.footer,
						italics: false,
						bold: false,
						color: hex(theme.palette.muted)
					},
					paragraph: { spacing: { before: 0, after: 0 } }
				}
			],
			default: {
				document: {
					run: { font: FONT, size: SZ.body, color: hex(theme.palette.ink) },
					paragraph: { spacing: { before: 0, after: 0 }, widowControl: true }
				}
			}
		},
		sections: [
			{
				properties: {
					page: {
						size: { width: twips(theme.page.width), height: twips(theme.page.height) },
						margin: {
							...Object.fromEntries(
								Object.entries(theme.margins).map(([key, value]) => [key, twips(value)])
							),
							footer: twips(26)
						}
					}
				},
				footers: { default: footer(theme) },
				children
			}
		]
	});

	// docx's fonts option emits embedRegular for every supplied font. Bind the
	// bold/italic files to their actual family, otherwise Word/LibreOffice can
	// substitute a serif face when asked for the nonexistent family "Inter Display Bold".
	const keys = doc.FontTable.fontOptionsWithKey.map((font) => font.fontKey);
	// OOXML ST_Guid requires braces; without them LibreOffice silently ignores the fonts.
	const embedded = (tag, index) =>
		`<w:${tag} r:id="rId${index + 1}" w:fontKey="{${keys[index].toUpperCase()}}"/>`;
	const fontTable = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:font w:name="${FONT}"><w:family w:val="swiss"/>${embedded('embedRegular', 0)}${embedded('embedBold', 1)}${embedded('embedItalic', 3)}</w:font>
<w:font w:name="${FONT} SemiBold"><w:family w:val="swiss"/>${embedded('embedRegular', 2)}</w:font>
</w:fonts>`;
	return Packer.toBuffer(doc, false, [{ path: 'word/fontTable.xml', data: fontTable }]);
}

// ─── Shared primitives ──────────────────────────────────────────────────────

// `raw` skips txt()'s trim — needed for inline label runs like "Rationale: "
// whose trailing space must survive, or Word renders "Rationale:Meets full…".
function run(text, opts = {}) {
	return new TextRun({
		text: opts.raw ? String(text ?? '') : txt(text),
		font: opts.serif ? SERIF : opts.semibold ? `${FONT} SemiBold` : FONT,
		size: opts.size || SZ.body,
		bold: !!opts.bold,
		italics: !!opts.italic,
		color: opts.color ? hex(opts.color) : undefined,
		characterSpacing: opts.spacing
	});
}

function para(children, opts = {}) {
	return new Paragraph({
		style: 'Normal',
		children: Array.isArray(children) ? children : [children],
		alignment: opts.align || AlignmentType.LEFT,
		spacing: {
			after: opts.after ?? 100,
			before: opts.before ?? 0,
			line: opts.line,
			lineRule: opts.line ? LineRuleType.AT_LEAST : undefined
		},
		keepNext: opts.keepNext,
		indent: opts.indent,
		border: opts.border ?? BODY_PARAGRAPH_BORDERS
	});
}

function bodyParas(
	theme,
	list,
	{ italic = false, color, align = AlignmentType.JUSTIFIED, size = SZ.body } = {}
) {
	return arr(list).map((p) =>
		para([run(p, { size, italic, color: color || theme.palette.ink, serif: true })], {
			align,
			after: twips((size / 2) * 0.55),
			line: twips(size / 2 + REPORT_STYLE.lineGap)
		})
	);
}

function spacer(after = 100) {
	return new Paragraph({
		children: [new TextRun({ text: '', size: 2 })],
		spacing: { after, line: 1, lineRule: LineRuleType.EXACT }
	});
}

// Numbered section heading with a bottom rule.
function sectionHeading(theme, num, title) {
	return new Paragraph({
		heading: HeadingLevel.HEADING_2,
		keepNext: true,
		children: [
			run(`${num}. ${title}`, { semibold: true, size: SZ.h2, color: theme.palette.heading })
		],
		spacing: { before: 160, after: 160 },
		border: {
			bottom: { style: BorderStyle.SINGLE, size: 12, color: hex(theme.palette.accent), space: 3 }
		}
	});
}

function miniHeading(theme, title, color) {
	return new Paragraph({
		heading: HeadingLevel.HEADING_3,
		keepNext: true,
		children: [
			run(title, { semibold: true, size: SZ.miniHeading, color: color || theme.palette.heading })
		],
		spacing: { before: 70, after: 50 }
	});
}

// Reference .dx-comorbid-header — bold DEEP-TEAL uppercase kicker fenced by
// light-teal rules above AND below (not a bare grey label).
function kicker(theme, label) {
	const rule = { style: BorderStyle.SINGLE, size: 12, color: hex(theme.palette.accent), space: 4 };
	return new Paragraph({
		children: [
			run(String(label).toUpperCase(), {
				bold: true,
				size: SZ.code,
				color: theme.palette.deep || theme.palette.heading,
				spacing: 8
			})
		],
		border: { top: rule, bottom: rule },
		spacing: { before: 200, after: 140 }
	});
}

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
// Clear body borders explicitly, especially the rule between paragraphs.
// The border-free Normal style supplies the top edge: a direct top="none"
// can suppress the preceding heading's bottom rule in document readers.
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

// Single-cell tinted box with an accent left border bar.
function box(
	theme,
	innerParagraphs,
	{
		fill,
		accent = theme.palette.accent,
		width = contentWidth(theme),
		rules = false,
		outline = false,
		bar = 3,
		padX = 12,
		padY = 12
	} = {}
) {
	const edge = { style: BorderStyle.SINGLE, size: 6, color: hex(theme.palette.rule) };
	const rule = { style: BorderStyle.SINGLE, size: 11, color: hex(theme.palette.accent) };
	const borders = {
		top: rules ? rule : outline ? edge : NO_BORDER,
		bottom: rules ? rule : outline ? edge : NO_BORDER,
		right: outline ? edge : NO_BORDER,
		left: rules ? NO_BORDER : { style: BorderStyle.SINGLE, size: bar * 8, color: hex(accent) }
	};
	return new Table({
		layout: TableLayoutType.FIXED,
		width: { size: width, type: WidthType.DXA },
		columnWidths: [width],
		borders: NONE_BORDERS,
		rows: [
			new TableRow({
				cantSplit: true,
				children: [
					new TableCell({
						width: { size: width, type: WidthType.DXA },
						borders,
						shading: fill ? { fill: hex(fill) } : undefined,
						margins: {
							top: twips(padY),
							bottom: twips(padY),
							left: twips(padX),
							right: twips(padX)
						},
						children: innerParagraphs
					})
				]
			})
		]
	});
}

// Word-native title and logo columns. The image uses the same embedded PNG as
// PDFKit; no server filesystem or image service is needed.
function brandedTitle(theme, paragraphs, logoWidth = 110, gap = 10) {
	const width = contentWidth(theme);
	const imageW = twips(logoWidth);
	const textW = width - twips(logoWidth + gap);
	const aspect = LOGO ? LOGO.readUInt32BE(20) / LOGO.readUInt32BE(16) : 1;
	const cell = (w, children) =>
		new TableCell({
			width: { size: w, type: WidthType.DXA },
			borders: NONE_BORDERS,
			margins: { top: 0, bottom: 0, left: 0, right: 0 },
			children
		});
	return new Table({
		layout: TableLayoutType.FIXED,
		width: { size: width, type: WidthType.DXA },
		columnWidths: [textW, twips(gap), imageW],
		borders: NONE_BORDERS,
		rows: [
			new TableRow({
				cantSplit: true,
				children: [
					cell(textW, paragraphs),
					cell(twips(gap), [spacer(0)]),
					cell(imageW, [
						para(
							LOGO
								? [
										new ImageRun({
											type: 'png',
											data: LOGO,
											transformation: {
												width: (logoWidth * 96) / 72,
												height: (logoWidth * aspect * 96) / 72
											},
											altText: {
												title: 'PsyMatch',
												description: 'PsyMatch logo',
												name: 'PsyMatch logo'
											}
										})
									]
								: [],
							{ after: 0 }
						)
					])
				]
			})
		]
	});
}

// ─── Comprehensive / concise ────────────────────────────────────────────────

function reportChildren(ctx, data) {
	const { theme } = ctx;
	const out = [];
	const meta = data.meta || {};

	// Same masthead text, hierarchy and logo as the PDF.
	out.push(
		brandedTitle(theme, [
			para(
				[
					run(txt(meta.eyebrow) || theme.eyebrow, {
						semibold: true,
						size: SZ.eyebrow,
						color: theme.palette.muted,
						spacing: 24
					})
				],
				{ after: 80 }
			),
			para(
				[
					run(txt(meta.title) || theme.title, {
						bold: true,
						size: SZ.h1,
						color: theme.palette.heading
					})
				],
				{ after: 0 }
			)
		])
	);
	out.push(spacer(160));
	out.push(
		para(
			[
				run(`Patient: ${txt(meta.patient) || 'Patient'}   ·   ID ${txt(meta.patientId) || '—'}`, {
					bold: true,
					size: 24,
					color: theme.palette.ink
				})
			],
			{ after: 80 }
		)
	);
	out.push(
		para([run(reportSubtitle(meta), { size: SZ.small, color: theme.palette.muted })], {
			after: 180,
			line: 220
		})
	);

	// 01 Identification.
	out.push(sectionHeading(theme, 1, 'Patient Identification'));
	out.push(identificationTable(theme, data));
	out.push(spacer());

	// 02 Interviews.
	out.push(sectionHeading(theme, 2, 'PsyMatch Assessment'));
	out.push(interviewsParagraph(theme, data.interviews || []));

	// 03 Snapshot.
	const snap = (data.snapshot || []).filter((s) => txt(s?.label) || txt(s?.text));
	if (snap.length) {
		out.push(snapshotBox(theme, snap));
		out.push(spacer());
	}

	// 04 Clinical Summary.
	out.push(sectionHeading(theme, 4, 'Clinical Summary'));
	out.push(...bodyParas(theme, data.clinicalSummary));

	// 05 History.
	out.push(sectionHeading(theme, 5, 'Autobiographical & Psychosocial History'));
	out.push(...bodyParas(theme, data.history));

	// 06 Risk.
	out.push(sectionHeading(theme, 6, 'Risk Assessment'));
	out.push(riskBox(theme, data.risk || {}));
	out.push(spacer());

	// 07 Diagnostic.
	out.push(sectionHeading(theme, 7, 'Diagnostic Considerations'));
	out.push(...diagnosticBlock(theme, data.diagnostic || {}));

	// 08 Case Conceptualization.
	out.push(sectionHeading(theme, 8, 'Case Conceptualization'));
	out.push(...bodyParas(theme, data.caseConceptualization));

	// 09 Treatment.
	out.push(sectionHeading(theme, 9, 'Treatment Rationale'));
	out.push(...treatmentBlocks(theme, data.treatment || []));
	if (data.treatmentReference?.rows?.length) out.push(...treatmentReferenceBlock(theme, data.treatmentReference));

	// 10 Medication, then the fixed medication statement (once).
	out.push(sectionHeading(theme, 10, 'Medication Considerations'));
	out.push(...bodyParas(theme, data.medication));
	if (txt(data.medicationStatement)) {
		out.push(
			para([run(data.medicationStatement, { italic: true, size: SZ.small - 2, color: theme.palette.muted })], {
				after: 120
			})
		);
	}

	// 11 Prognosis.
	out.push(sectionHeading(theme, 11, 'Prognosis'));
	out.push(...bodyParas(theme, data.prognosis?.body));
	if (txt(data.prognosis?.closing)) {
		out.push(
			para([
				run(data.prognosis.closing, {
					italic: true,
					color: theme.palette.deep || theme.palette.heading
				})
			])
		);
	}

	return out;
}

function identificationTable(theme, data) {
	const width = contentWidth(theme);
	const c1 = twips(Math.round((width / 20) * 0.32));
	const widths = [c1, width - c1];
	const edge = { style: BorderStyle.SINGLE, size: 6, color: hex(theme.palette.rule) };
	const row = (values, header = false) =>
		new TableRow({
			tableHeader: header,
			children: values.map(
				(value, i) =>
					new TableCell({
						width: { size: widths[i], type: WidthType.DXA },
						borders: { top: edge, bottom: edge, left: edge, right: edge },
						shading: header ? { fill: 'DCE8E6' } : i === 0 ? { fill: 'FAFBFB' } : undefined,
						margins: { top: 100, bottom: 100, left: 160, right: 160 },
						children: [
							para(
								[
									run(value, {
										semibold: header || i === 0,
										size: SZ.body,
										color: header ? theme.palette.deep : theme.palette.ink
									})
								],
								{ after: 0 }
							)
						]
					})
			)
		});
	return new Table({
		layout: TableLayoutType.FIXED,
		width: { size: width, type: WidthType.DXA },
		columnWidths: widths,
		borders: NONE_BORDERS,
		rows: [
			row(['Field', 'Details'], true),
			...identificationRows(data).map((values) => row(values))
		]
	});
}

function interviewsParagraph(theme, interviews) {
	const list = interviews.map(txt).filter(Boolean);
	if (!list.length)
		return bodyParas(theme, ['No structured interviews were recorded for this assessment.'], {
			align: AlignmentType.LEFT
		})[0];
	const joined =
		list.length === 1
			? list[0]
			: list.slice(0, -1).join(', ') +
				(list.length > 2 ? ',' : '') +
				' and ' +
				list[list.length - 1];
	return para(
		[
			run('Interviews completed: ', {
				raw: true,
				serif: true,
				bold: true,
				color: theme.palette.ink
			}),
			run(joined + '.', { serif: true, color: theme.palette.ink })
		],
		{ align: AlignmentType.JUSTIFIED, line: twips(REPORT_STYLE.size.body + REPORT_STYLE.lineGap) }
	);
}

function labeledBullet(theme, item, size = SZ.small) {
	return new Paragraph({
		children: [
			run(txt(item.label) + (txt(item.label) ? ': ' : ''), {
				raw: true,
				semibold: true,
				size,
				color: theme.palette.deep || theme.palette.heading
			}),
			run(txt(item.text), { size, color: theme.palette.ink })
		],
		numbering: { reference: 'report-bullets', level: 0 },
		indent: { left: 200, hanging: 200 },
		spacing: { after: 80 }
	});
}

function snapshotBox(theme, snapshot) {
	return box(
		theme,
		[
			para(
				[
					run('3. CLINICAL SNAPSHOT', {
						semibold: true,
						size: 24,
						color: theme.palette.deep,
						spacing: 10
					})
				],
				{ after: 120, keepNext: true }
			),
			...snapshot.map((s) => labeledBullet(theme, s, 20))
		],
		{ fill: theme.palette.tint, rules: true }
	);
}

function riskBox(theme, risk) {
	const inner = [];
	if (txt(risk.lead))
		inner.push(
			para(
				[
					run(risk.lead, {
						bold: true,
						size: SZ.small,
						color: theme.palette.deep || theme.palette.heading
					})
				],
				{ after: 80 }
			)
		);
	for (const b of (risk.bullets || []).map(txt).filter(Boolean)) {
		inner.push(
			new Paragraph({
				children: [run(b, { size: SZ.small, color: theme.palette.ink })],
				numbering: { reference: 'report-bullets', level: 0 },
				spacing: { after: 40 }
			})
		);
	}
	if (txt(risk.narrative))
		inner.push(
			para([run(risk.narrative, { size: SZ.small, color: theme.palette.ink })], {
				align: AlignmentType.JUSTIFIED
			})
		);
	if (!inner.length) inner.push(spacer(0));
	return box(theme, inner, { fill: theme.palette.tint });
}

function diagnosticBlock(theme, dx) {
	const out = [];
	if (txt(dx.note)) {
		out.push(para([run(dx.note, { italic: true, size: SZ.small, color: theme.palette.muted })], { after: 120 }));
	}
	if (dx.primary) {
		out.push(primaryCard(theme, dx.primary));
		out.push(spacer(80));
	}
	const comorbid = (dx.comorbid || []).filter(Boolean);
	if (comorbid.length) {
		out.push(kicker(theme, 'Co-Morbid Diagnoses'));
		out.push(comorbidTable(theme, comorbid));
		out.push(spacer(80));
	}
	if (txt(dx.subthreshold)) {
		out.push(kicker(theme, 'Subthreshold / Rule-Out'));
		out.push(...bodyParas(theme, dx.subthreshold, { align: AlignmentType.LEFT }));
	}
	if (txt(dx.disclaimer)) {
		out.push(
			para([run(dx.disclaimer, { italic: true, size: SZ.tiny, color: theme.palette.muted })], {
				after: 80
			})
		);
	}
	return out;
}

// Slate used for code-band values + the italic selection note (reference #44504F).
const CODE_INK = '#44504F';

// Reference .code-row — the DSM/ICD/Severity band: soft-grey fill, hairline
// border, BOLD deep-teal labels, muted pipe separators, slate values.
function codeBand(theme, d, size = SZ.code, designation = null) {
	const deep = theme.palette.deep || theme.palette.heading;
	const items = [
		d.dsm ? ['DSM-5-TR:', txt(d.dsm)] : null,
		d.icd ? ['ICD-11:', txt(d.icd)] : null,
		d.severity ? ['Severity:', txt(d.severity)] : null,
		designation ? ['Designation:', txt(designation)] : null
	].filter(Boolean);
	if (!items.length) return null;

	const kids = [];
	items.forEach(([label, value], i) => {
		if (i) kids.push(run('  |  ', { raw: true, size, color: theme.palette.muted }));
		kids.push(run(`${label} `, { raw: true, bold: true, size, color: deep }));
		kids.push(run(value, { size, color: CODE_INK }));
	});
	const edge = { style: BorderStyle.SINGLE, size: 4, color: hex(theme.palette.rule), space: 3 };
	return new Paragraph({
		children: kids,
		shading: { fill: hex(theme.palette.tint) },
		border: { top: edge, bottom: edge, left: edge, right: edge },
		spacing: { before: 60, after: 100 }
	});
}

// "Rationale: <text>" — bold deep-teal lead, plain body.
function rationaleP(theme, text, size = SZ.small, align = AlignmentType.JUSTIFIED) {
	const deep = theme.palette.deep || theme.palette.heading;
	return para(
		[
			run('Rationale: ', { raw: true, bold: true, size, color: deep }),
			run(txt(text), { size, color: theme.palette.ink })
		],
		{ align, after: 0 }
	);
}

// Reference .dx-primary — soft fill + DEEP-teal left bar.
// Order: title → italic selection note → code band → rationale.
function primaryCard(theme, primary, opts = {}) {
	const { titlePrefix = true, designation = null, rationaleLabel = true } = opts;
	const deep = theme.palette.deep || theme.palette.heading;
	const name = txt(primary.name) || 'Principal diagnosis';
	const inner = [
		para(
			[
				run(titlePrefix ? `${txt(primary.selection) ? 'Principal' : 'Primary'} Diagnosis: ${name}` : name, {
					bold: true,
					size: SZ.cardTitle,
					color: deep
				})
			],
			{ after: 100, keepNext: true }
		)
	];
	if (txt(primary.selection)) {
		inner.push(
			para([run(txt(primary.selection), { italic: true, size: SZ.small, color: CODE_INK })], {
				after: 160,
				indent: { left: 160 },
				border: {
					left: { style: BorderStyle.SINGLE, size: 16, color: hex(theme.palette.accent), space: 6 }
				}
			})
		);
	}
	const band = codeBand(theme, primary, SZ.code, designation);
	if (band) inner.push(band);
	if (txt(primary.rationale)) {
		inner.push(
			rationaleLabel
				? rationaleP(theme, primary.rationale)
				: para([run(txt(primary.rationale), { size: SZ.small, color: theme.palette.ink })], {
						align: AlignmentType.JUSTIFIED,
						after: 0
					})
		);
	}
	return box(theme, inner, {
		fill: '#F7FAF9',
		accent: deep,
		outline: true,
		bar: 6,
		padX: 14,
		padY: 10
	});
}

function comorbidTable(theme, list, opts = {}) {
	const { rationaleLabel = true } = opts;
	const gap = twips(14);
	const colW = Math.floor((contentWidth(theme) - gap) / 2);
	const cardCell = (d) => {
		const band = d ? codeBand(theme, d, SZ.code) : null;
		const body =
			d && txt(d.rationale)
				? rationaleLabel
					? rationaleP(theme, d.rationale, SZ.cardBody, AlignmentType.LEFT)
					: para([run(txt(d.rationale), { size: SZ.cardBody, color: theme.palette.ink })], {
							after: 0
						})
				: null;
		return new TableCell({
			width: { size: colW, type: WidthType.DXA },
			margins: { top: 140, bottom: 140, left: 200, right: 200 },
			borders: d
				? {
						top: { style: BorderStyle.SINGLE, size: 6, color: hex(theme.palette.rule) },
						bottom: { style: BorderStyle.SINGLE, size: 6, color: hex(theme.palette.rule) },
						right: { style: BorderStyle.SINGLE, size: 6, color: hex(theme.palette.rule) },
						left: { style: BorderStyle.SINGLE, size: 32, color: hex(theme.palette.accent) }
					}
				: NONE_BORDERS,
			shading: d ? { fill: hex('#FAFBFB') } : undefined,
			children: d
				? [
						// BOLD deep-teal title (reference .diagnosis-title), code band, rationale.
						para(
							[
								run(txt(d.name) || 'Condition', {
									bold: true,
									size: SZ.cardTitle,
									color: theme.palette.deep || theme.palette.heading
								})
							],
							{ after: 40 }
						),
						...(band ? [band] : []),
						...(body ? [body] : [])
					]
				: [para([run('')])]
		});
	};
	const rows = [];
	for (let i = 0; i < list.length; i += 2) {
		const pair = [list[i], list[i + 1] || null];
		rows.push(
			new TableRow({
				cantSplit: true,
				children: [
					cardCell(pair[0]),
					new TableCell({
						width: { size: gap, type: WidthType.DXA },
						borders: NONE_BORDERS,
						children: [spacer(0)]
					}),
					cardCell(pair[1])
				]
			})
		);
		if (i + 2 < list.length)
			rows.push(
				new TableRow({
					children: [
						new TableCell({
							columnSpan: 3,
							width: { size: contentWidth(theme), type: WidthType.DXA },
							borders: NONE_BORDERS,
							children: [spacer(160)]
						})
					]
				})
			);
	}
	return new Table({
		layout: TableLayoutType.FIXED,
		width: { size: contentWidth(theme), type: WidthType.DXA },
		columnWidths: [colW, gap, colW],
		borders: NONE_BORDERS,
		rows
	});
}

// Reference .phase-label — NO accent pill/chip. Each phase is a plain bold
// deep-teal subheading, "Phase I — Safety, Stabilization, and Alliance".
function treatmentBlocks(theme, treatment) {
	const out = [];
	const deep = theme.palette.deep || theme.palette.heading;
	for (const phase of treatment || []) {
		const label = txt(phase.phase);
		const title = txt(phase.title);
		const heading = label && title ? `${label} — ${title}` : label || title;
		out.push(
			para([run(heading, { bold: true, size: SZ.phase, color: deep })], {
				keepNext: true,
				before: 200,
				after: 80
			})
		);
		out.push(...bodyParas(theme, phase.body, { size: SZ.small }));
	}
	return out;
}

// Core §9.10.1 Treatment Reference: label, fixed message, five-column table
// (deep-teal header row, thin rules, header repeats) and the optional ⚑ note.
const FLAG_FONT = 'Segoe UI Symbol'; // Word substitutes a symbol font that has U+2691

function treatmentReferenceBlock(theme, tr) {
	const deep = theme.palette.deep || theme.palette.heading;
	const width = contentWidth(theme);
	const fracs = [0.18, 0.2, 0.2, 0.26, 0.16];
	const widths = fracs.map((f) => Math.round(width * f));
	const rule = { style: BorderStyle.SINGLE, size: 4, color: hex(theme.palette.rule) };
	const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
	const size = SZ.small - 2;
	const headers = [
		'Diagnosis according to PsyMatch',
		'Guideline-supported treatment options',
		'Medication classes referenced in guidelines',
		'Treatment planning considerations',
		'Evidence and source'
	];
	const cell = (children, i, header) =>
		new TableCell({
			width: { size: widths[i], type: WidthType.DXA },
			borders: { top: none, left: none, right: none, bottom: header ? none : rule },
			shading: header ? { fill: hex(deep) } : undefined,
			margins: { top: 70, bottom: 70, left: 100, right: 100 },
			children
		});
	const textPara = (value, header, extra = []) =>
		para(
			[run(value, { size, semibold: header, color: header ? '#FFFFFF' : theme.palette.ink }), ...extra],
			{ after: 0 }
		);
	const head = new TableRow({
		tableHeader: true,
		cantSplit: true,
		children: headers.map((h, i) => cell([textPara(h, true)], i, true))
	});
	const rows = tr.rows.map(
		(r) =>
			new TableRow({
				cantSplit: true,
				children: [
					cell([textPara(r.diagnosis)], 0),
					cell([textPara(r.options)], 1),
					cell(
						[
							textPara(
								r.medicationClasses,
								false,
								r.flag === true ? [new TextRun({ text: '\u00a0\u2691', font: FLAG_FONT, size })] : []
							)
						],
						2
					),
					cell([textPara(r.planning)], 3),
					cell([textPara(r.evidence)], 4)
				]
			})
	);
	const out = [
		para([run('Treatment Reference', { bold: true, size: SZ.phase, color: deep })], {
			keepNext: true,
			before: 200,
			after: 60
		}),
		para([run(tr.message, { italic: true, size: SZ.small - 1, color: theme.palette.muted })], {
			keepNext: true,
			after: 80
		}),
		new Table({
			layout: TableLayoutType.FIXED,
			width: { size: width, type: WidthType.DXA },
			columnWidths: widths,
			borders: NONE_BORDERS,
			rows: [head, ...rows]
		})
	];
	if (txt(tr.note)) {
		out.push(
			para(
				[
					new TextRun({ text: '\u2691 ', font: FLAG_FONT, size, color: 'B8860B' }),
					run(tr.note, { size, color: '#B8860B' })
				],
				{ before: 80, after: 120 }
			)
		);
	}
	return out;
}

// ─── Referral letter ────────────────────────────────────────────────────────

function letterField(theme, label, value) {
	return para(
		[
			run(label, { raw: true, bold: true, size: SZ.small, color: theme.palette.deep }),
			run(value, { size: SZ.small, color: theme.palette.ink })
		],
		{ after: 100 }
	);
}

function letterChildren(ctx, data) {
	const { theme } = ctx;
	const out = [];
	const meta = data.meta || {};

	// The PDF letterhead has a compact brand line, right-hand logo and blue rule.
	out.push(
		brandedTitle(
			theme,
			[
				para(
					[
						run(theme.footerSystem.toUpperCase(), {
							bold: true,
							size: 18,
							color: theme.palette.deep,
							spacing: 10
						})
					],
					{ after: 40 }
				),
				para([run(theme.tagline || '', { size: 15, color: theme.palette.muted })], { after: 0 })
			],
			120,
			16
		)
	);
	out.push(
		new Paragraph({
			children: [run('', { size: 2 })],
			spacing: { before: 160, after: 260, line: 1, lineRule: LineRuleType.EXACT },
			border: {
				bottom: { style: BorderStyle.SINGLE, size: 16, color: hex(theme.palette.accent), space: 0 }
			}
		})
	);
	out.push(
		para(
			[
				run(txt(meta.eyebrow) || theme.eyebrow, {
					semibold: true,
					size: 15,
					color: theme.palette.muted,
					spacing: 24
				})
			],
			{ after: 100 }
		)
	);
	out.push(letterField(theme, 'Date of Assessment: ', txt(meta.dateOfAssessment) || '—'));
	out.push(
		para(
			[
				run('Re: ', { raw: true, bold: true, size: SZ.small, color: theme.palette.deep }),
				run(`${txt(meta.patient) || 'Patient'} · Patient ID ${txt(meta.patientId) || '—'}`, {
					size: SZ.small,
					color: theme.palette.ink
				})
			],
			{
				after: 100,
				indent: { left: 200 },
				border: {
					left: { style: BorderStyle.SINGLE, size: 16, color: hex(theme.palette.accent), space: 8 }
				}
			}
		)
	);
	out.push(
		para([run(theme.title, { bold: true, size: SZ.title, color: theme.palette.heading })], {
			after: 130,
			keepNext: true
		})
	);
	out.push(letterField(theme, 'Date: ', txt(meta.letterDate) || txt(meta.dateOfAssessment) || '—'));

	// Recipient address (literal placeholders when empty).
	const recip = data.recipient || {};
	[
		txt(recip.name) || 'Referring Source Name',
		txt(recip.address) || 'Source Address',
		txt(recip.cityStateZip) || '[City, State ZIP]'
	].forEach((line) =>
		out.push(para([run(line, { size: SZ.small, color: theme.palette.ink })], { after: 20 }))
	);
	out.push(spacer(80));

	out.push(
		para(
			[
				run(txt(data.salutation) || 'Dear Referring Clinician,', {
					size: SZ.body,
					color: theme.palette.ink
				})
			],
			{ after: 120 }
		)
	);

	// The H1 now sits up by the patient-ID block, so the body follows the salutation.
	out.push(...bodyParas(theme, data.opening));

	// Clinical Snapshot box (top + bottom blue rules, bold-label bullets).
	const snapBullets = (data.snapshot?.bullets || []).filter((b) => txt(b?.label) || txt(b?.text));
	if (snapBullets.length) {
		out.push(
			box(
				theme,
				[
					para(
						[
							run('Clinical Snapshot', {
								semibold: true,
								size: SZ.cardTitle,
								color: theme.palette.deep
							})
						],
						{ after: 80, keepNext: true }
					),
					...snapBullets.map((b) => labeledBullet(theme, b))
				],
				{ fill: theme.palette.tint, rules: true }
			)
		);
		out.push(spacer(100));
	}

	if (arr(data.riskNote).length) {
		out.push(
			box(
				theme,
				[
					para(
						[
							run('Brief Risk Note', {
								semibold: true,
								size: SZ.cardTitle,
								color: theme.palette.deep
							})
						],
						{ after: 80, keepNext: true }
					),
					...arr(data.riskNote).map((p) =>
						para([run(p, { size: SZ.small, color: theme.palette.ink })], {
							after: 80,
							align: AlignmentType.JUSTIFIED
						})
					)
				],
				{ fill: theme.palette.tint }
			)
		);
		out.push(spacer(100));
	}

	// Brief Autobiographical / Psychosocial Summary — was missing its heading.
	if (arr(data.psychosocial).length) {
		out.push(miniHeading(theme, 'Brief Autobiographical / Psychosocial Summary'));
		out.push(...bodyParas(theme, data.psychosocial));
	}

	// Primary diagnosis. In the letter the heading names the section, so the card
	// title is the bare diagnosis, the band carries the designation, and the body
	// has no "Rationale:" lead (matches the reference).
	if (data.primary) {
		out.push(miniHeading(theme, 'Primary Diagnosis'));
		out.push(
			primaryCard(theme, data.primary, {
				titlePrefix: false,
				designation: 'Primary',
				rationaleLabel: false
			})
		);
		out.push(spacer(80));
	}

	// Co-morbid. The letter cards at most four; any further SUPPORTED diagnoses
	// are named in one line beneath them — under this heading, never under
	// Subthreshold, which asserts the opposite of what they are.
	const comorbid = (data.comorbid || []).filter(Boolean);
	if (comorbid.length) {
		out.push(miniHeading(theme, 'Co-Morbid Diagnoses'));
		out.push(comorbidTable(theme, comorbid, { rationaleLabel: false }));
		if (txt(data.comorbidOverflow)) {
			out.push(...bodyParas(theme, [data.comorbidOverflow], { align: AlignmentType.LEFT }));
		}
		out.push(spacer(80));
	}

	// Subthreshold.
	if (arr(data.subthreshold).length) {
		out.push(miniHeading(theme, 'Subthreshold Diagnoses'));
		out.push(...bodyParas(theme, data.subthreshold, { align: AlignmentType.LEFT }));
	}

	// Brief Case Conceptualization.
	if (arr(data.conceptualization).length) {
		out.push(miniHeading(theme, 'Brief Case Conceptualization'));
		out.push(...bodyParas(theme, data.conceptualization));
	}

	// Brief Treatment Plan.
	if (arr(data.treatment).length) {
		out.push(miniHeading(theme, 'Brief Treatment Plan'));
		out.push(...bodyParas(theme, data.treatment));
	}

	// Closing — the reference gives this its own heading before the signoff.
	const closing = data.closing || {};
	out.push(miniHeading(theme, 'Closing'));
	if (arr(closing.body).length) out.push(...bodyParas(theme, closing.body));
	out.push(spacer(160));
	out.push(
		para([run(txt(closing.signoff) || 'Sincerely,', { size: SZ.body, color: theme.palette.ink })], {
			after: 280
		})
	);
	out.push(
		para(
			[
				run(txt(closing.clinician) || '[Clinician Name, Credentials]', {
					bold: true,
					size: SZ.body,
					color: theme.palette.ink
				})
			],
			{ after: 20 }
		)
	);
	out.push(
		para(
			[
				run(txt(closing.system) || theme.footerSystem, {
					size: SZ.small,
					color: theme.palette.muted
				})
			],
			{ after: 160 }
		)
	);

	if (txt(data.footerNote)) {
		out.push(
			para([run(data.footerNote, { italic: true, size: SZ.tiny, color: theme.palette.muted })])
		);
	}

	return out;
}

// ─── Patient summary ────────────────────────────────────────────────────────

function summaryChildren(ctx, data) {
	const { theme } = ctx;
	const out = [];
	const meta = data.meta || {};

	out.push(
		brandedTitle(
			theme,
			[
				para(
					[
						run((txt(meta.eyebrow) || theme.eyebrow).toUpperCase(), {
							semibold: true,
							size: SZ.eyebrow,
							color: theme.palette.muted,
							spacing: 16
						})
					],
					{ after: 80 }
				),
				para(
					[
						run(txt(meta.title) || theme.title, {
							bold: true,
							size: SZ.h1,
							color: theme.palette.heading
						})
					],
					{ after: 0 }
				)
			],
			96,
			14
		)
	);
	out.push(spacer(80));
	out.push(
		para(
			[
				run(theme.subtitle || 'Prepared for you to read and keep', {
					italic: true,
					size: 21,
					color: theme.palette.muted
				})
			],
			{ after: 200 }
		)
	);

	const sections = (data.sections || []).filter((s) => txt(s?.title) || arr(s?.paragraphs).length);
	sections.forEach((section, i) => {
		// The opening flows straight from the subtitle — no gold rule, no heading
		// (matches the reference). Every later section is fenced by a gold rule.
		if (!isOpeningSection(section, i)) {
			out.push(
				new Paragraph({
					keepNext: true,
					heading: HeadingLevel.HEADING_2,
					children: [
						run(txt(section.title).toUpperCase(), {
							bold: true,
							size: SZ.summaryHeading,
							color: theme.palette.heading,
							spacing: 8
						})
					],
					spacing: { before: 240, after: 120 },
					border: {
						top: { style: BorderStyle.SINGLE, size: 16, color: hex(theme.palette.accent), space: 8 }
					}
				})
			);
		}
		out.push(
			...bodyParas(theme, section.paragraphs, {
				italic: !!section.italic,
				color: theme.palette.body || theme.palette.ink,
				size: SZ.summaryBody
			})
		);
	});
	return out;
}

// ─── Footer (3-part: system | center | Page X of Y) ─────────────────────────

// A styled cached result prevents Word-compatible readers from inheriting the
// final body paragraph's italic font/size when they calculate a page field.
function pageField(theme, instruction) {
	const field = new SimpleField(instruction);
	field.addChildElement(
		new TextRun({
			text: '1',
			font: FONT,
			size: SZ.footer,
			italics: false,
			bold: false,
			color: hex(theme.palette.muted)
		})
	);
	return field;
}

function footer(theme) {
	const third = Math.floor(contentWidth(theme) / 3);
	return new Footer({
		children: [
			new Table({
				layout: TableLayoutType.FIXED,
				width: { size: contentWidth(theme), type: WidthType.DXA },
				columnWidths: [third, third, contentWidth(theme) - third * 2],
				borders: {
					...NONE_BORDERS,
					top: { style: BorderStyle.SINGLE, size: 4, color: hex(theme.palette.rule), space: 2 }
				},
				rows: [
					new TableRow({
						children: [
							new TableCell({
								width: { size: third, type: WidthType.DXA },
								verticalAlign: VerticalAlign.CENTER,
								margins: { top: 80, bottom: 0, left: 0, right: 0 },
								children: [
									para([run(theme.footerSystem, { size: SZ.footer, color: theme.palette.muted })], {
										align: AlignmentType.LEFT,
										after: 0
									})
								]
							}),
							new TableCell({
								width: { size: third, type: WidthType.DXA },
								verticalAlign: VerticalAlign.CENTER,
								margins: { top: 80, bottom: 0, left: 0, right: 0 },
								children: [
									para([run(theme.footerCenter, { size: SZ.footer, color: theme.palette.muted })], {
										align: AlignmentType.CENTER,
										after: 0
									})
								]
							}),
							new TableCell({
								width: { size: contentWidth(theme) - third * 2, type: WidthType.DXA },
								verticalAlign: VerticalAlign.CENTER,
								margins: { top: 80, bottom: 0, left: 0, right: 0 },
								children: [
									new Paragraph({
										alignment: AlignmentType.RIGHT,
										style: 'ReportFooter',
										run: {
											font: FONT,
											size: SZ.footer,
											italics: false,
											bold: false,
											color: hex(theme.palette.muted)
										},
										spacing: { after: 0 },
										children: [
											new TextRun({
												text: 'Page ',
												font: FONT,
												size: SZ.footer,
												italics: false,
												bold: false,
												color: hex(theme.palette.muted)
											}),
											pageField(theme, 'PAGE'),
											new TextRun({
												text: ' of ',
												font: FONT,
												size: SZ.footer,
												italics: false,
												bold: false,
												color: hex(theme.palette.muted)
											}),
											pageField(theme, 'NUMPAGES')
										]
									})
								]
							})
						]
					})
				]
			})
		]
	});
}
