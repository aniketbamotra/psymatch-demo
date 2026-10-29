import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { renderReferralLetterPdf } from '../utils/pdfGenerators/referralLetterPdf.js';
import { renderReferralLetterDocx } from '../utils/docxGenerators/referralLetterDocx.js';
import { deTokenizeReport, maskTokensReport } from '../server/anonymizeCase.js';

// The standalone referral letter (`psymatch.referral_letter.v1`) through the real
// PDFKit and docx renderers. Fixtures are the design targets: letters the real
// AI wrote for synthetic cases (~/Downloads/referral-letter-test/design/target),
// whose approved Chrome/Paged.js PDFs put every section on the pages in
// TARGET_PAGES. No agent, no Mongo, no credits.

const FIXTURES = ['sample', 'risk', 'many'];
const load = (name) =>
	JSON.parse(
		readFileSync(
			new URL(`./__fixtures__/referralLetter/ai-${name}.document.json`, import.meta.url),
			'utf8'
		)
	);

// A synthetic redCodeMap for every token in a document, so the renderers get
// de-tokenized text exactly as the download route gives it to them.
function redCodeMapFor(doc) {
	const tokens = [...new Set(JSON.stringify(doc).match(/⟦[^⟧]+⟧/g) ?? [])];
	return tokens.map((token) => {
		const code = token.slice(1, -1);
		const desc = code
			.replace(/_(SAMPLE01|RISK|MANY)$/, '')
			.toLowerCase()
			.replace(/_/g, ' ');
		return {
			code,
			token,
			desc,
			category: 'test',
			find: `Synthetic ${desc}`,
			value: `Synthetic ${desc}`
		};
	});
}
const clinicianCopy = (doc) => deTokenizeReport(doc, redCodeMapFor(doc));

// Page of each block in the approved target PDFs (same for all three letters).
const TARGET_PAGES = {
	'heading:Clinical Snapshot': 1,
	panel: 2,
	qualifiers: 2,
	'heading:Risk and Protective Factors': 2,
	'tableEnd:Risk and Protective Factors': 2,
	'heading:Treatment Reference': 3,
	'tableEnd:Treatment Reference': 3,
	'heading:Limitations and Provenance': 3,
	closing: 3
};
// Rev 4 client edits (§2.1 no Re line, §4.2 one-line identification fields)
// shortened page 1, so the risk letter's single-diagnosis panel now fits there.
const PAGE_OVERRIDES = {
	risk: {
		panel: 1,
		'heading:Treatment Reference': 2,
		'tableEnd:Treatment Reference': 2,
		'heading:Limitations and Provenance': 2
	}
};

async function pdfWithTrace(doc) {
	const trace = [];
	const buf = await renderReferralLetterPdf(doc, { trace });
	const pages = Number(buf.toString('latin1').match(/\/Type \/Pages[\s\S]*?\/Count (\d+)/)?.[1]);
	const pageOf = (name) => trace.filter((m) => m.name === name).map((m) => m.page);
	return { buf, trace, pages, pageOf };
}

// A letter far beyond the targets: 14 diagnoses (panel taller than a page) and
// a long limitations paragraph, to exercise the fallbacks.
function stressLetter() {
	const doc = clinicianCopy(load('sample'));
	const base = doc.content.diagnoses[1];
	const severities = ['severe', 'extreme', 'minimal', 'not specified', 'moderately-severe', 'mild'];
	for (let n = 4; n <= 14; n++) {
		doc.content.diagnoses.push({
			...base,
			id: `dx${n}`,
			role: 'comorbid',
			severity: severities[n % severities.length],
			name:
				n === 4
					? 'Other Specified Trauma- and Stressor-Related Disorder, Persistent Complex Bereavement Presentation'
					: `Synthetic Disorder ${n}`,
			rationale: `${base.rationale} ${base.rationale}`
		});
		doc.content.treatmentReference.push({
			...doc.content.treatmentReference[1],
			diagnosisId: `dx${n}`
		});
	}
	doc.content.limitations = Array(9).fill(doc.content.limitations).join(' ');
	return doc;
}

describe('referral letter PDF — pagination matches the design targets', () => {
	for (const name of FIXTURES) {
		it(`ai-${name}: 3 pages, every block on its target page`, async () => {
			const { buf, pages, pageOf } = await pdfWithTrace(clinicianCopy(load(name)));
			expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
			expect(pages).toBe(3);
			for (const [block, page] of Object.entries({ ...TARGET_PAGES, ...PAGE_OVERRIDES[name] })) {
				expect(pageOf(block), block).toEqual([page]);
			}
		});
	}

	it('a zero-diagnosis letter still renders the panel, with no treatment rows', async () => {
		const doc = clinicianCopy(load('sample'));
		doc.content.diagnoses = [];
		doc.content.treatmentReference = [];
		const { pageOf } = await pdfWithTrace(doc);
		expect(pageOf('panel')).toHaveLength(1);
		expect(pageOf('closing')).toHaveLength(1);
	});

	it('stress: an over-tall panel splits between entries; the closing never sits alone', async () => {
		const { pages, pageOf } = await pdfWithTrace(stressLetter());
		const panelPages = pageOf('panel');
		expect(panelPages.length).toBeGreaterThan(1); // fallback split, heading repeated
		expect(new Set(panelPages).size).toBe(panelPages.length); // one part per page
		expect(pageOf('closing')).toEqual(pageOf('limitationsLastLine'));
		expect(pages).toBeGreaterThanOrEqual(pageOf('closing')[0]);
	});
});

describe('referral letter DOCX', () => {
	const exports = {};
	beforeAll(async () => {
		for (const name of FIXTURES) {
			const doc = clinicianCopy(load(name));
			const zip = await JSZip.loadAsync(await renderReferralLetterDocx(doc));
			exports[name] = {
				doc,
				xml: await zip.file('word/document.xml').async('string'),
				styles: await zip.file('word/styles.xml').async('string'),
				footer: await zip.file(/word\/footer\d*\.xml/)[0].async('string')
			};
		}
	});

	for (const name of FIXTURES) {
		it(`ai-${name}: fixed wording, flags from data, footer and page fields`, () => {
			const { doc, xml, footer } = exports[name];
			expect(xml).toContain(doc.panelHeading);
			expect(xml).not.toContain('⟦');
			// ⚑ comes only from interactionFlag, plus one before a non-empty note.
			const flags = (xml.match(/⚑/g) ?? []).length;
			const expected =
				doc.content.treatmentReference.filter((r) => r.interactionFlag === true).length +
				(doc.content.interactionNote.trim() ? 1 : 0);
			expect(flags).toBe(expected);
			// Risk and treatment header rows repeat on a page break.
			expect((xml.match(/<w:tblHeader\/>/g) ?? []).length).toBeGreaterThanOrEqual(2);
			expect(footer).toContain(doc.footer);
			expect(footer).toContain('PAGE');
			expect(footer).toContain('NUMPAGES');
		});
	}

	it('reserves the 40 mm letterhead on page 1 and keeps Normal border-free (Pages)', () => {
		const { xml, styles } = exports.sample;
		expect(xml).toMatch(/w:lineRule="exact"/);
		const normal = styles.match(/<w:style\b[^>]*w:styleId="Normal"[\s\S]*?<\/w:style>/)?.[0];
		expect(normal).toBeDefined();
		expect(normal).not.toContain('<w:pBdr');
	});
});

describe('referral letter redacted copy', () => {
	it('masks every token to a label; no real value or raw token survives', async () => {
		const doc = load('sample');
		const map = redCodeMapFor(doc);
		const masked = maskTokensReport(doc, map);
		const text = JSON.stringify(masked);
		expect(text).not.toContain('⟦');
		expect(text).not.toContain('Synthetic ');
		expect(text).toContain('[name of patient]');
		// Both renderers accept the masked document.
		expect((await renderReferralLetterPdf(masked)).subarray(0, 5).toString('latin1')).toBe('%PDF-');
		expect((await renderReferralLetterDocx(masked)).subarray(0, 2).toString('latin1')).toBe('PK');
	});
});
