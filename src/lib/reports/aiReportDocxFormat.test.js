import { beforeAll, describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { renderAiDocx } from '../utils/docxGenerators/aiReportDocx.js';
import { themeFor, REPORT_STYLE } from '../utils/aiReportTheme.js';
import { FONTS, LOGO } from '../utils/pdfGenerators/embeddedAssets.js';
import { SAMPLES, sampleReportData } from './__fixtures__/sampleReportData.js';

// Inspect the real packaged Word output. Buffer signatures alone cannot catch
// layout regressions, omitted patient fields, or missing embedded assets.
const xmlPart = (zip, name) => zip.file(`word/${name}.xml`).async('string');
const paragraphs = (xml) => xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || [];
const paragraphWith = (xml, text) => paragraphs(xml).find((p) => p.includes(text));
const attribute = (xml, key) => xml.match(new RegExp(`${key}="([^"]+)"`))?.[1];

describe('AI Word exports use the PDF design', () => {
	const exports = {};
	beforeAll(async () => {
		await Promise.all(
			Object.entries(SAMPLES).map(async ([format, sample]) => {
				const zip = await JSZip.loadAsync(await renderAiDocx(sample(), { format, language: 'en' }));
				exports[format] = { zip, xml: await xmlPart(zip, 'document') };
			})
		);
	});

	for (const format of Object.keys(SAMPLES)) {
		it(`${format}: uses the PDF page dimensions and margins, even during concurrent exports`, () => {
			const { xml } = exports[format];
			const theme = themeFor(format);
			const size = xml.match(/<w:pgSz\b[^>]*>/)[0];
			const margins = xml.match(/<w:pgMar\b[^>]*>/)[0];
			expect(Number(attribute(size, 'w:w'))).toBe(theme.page.width * 20);
			expect(Number(attribute(size, 'w:h'))).toBe(theme.page.height * 20);
			for (const [side, points] of Object.entries(theme.margins)) {
				expect(Number(attribute(margins, `w:${side}`))).toBe(points * 20);
			}
			// Every table declares a fixed width fitting within this format's body.
			const maxWidth = (theme.page.width - theme.margins.left - theme.margins.right) * 20;
			for (const match of xml.matchAll(/<w:tblW\b[^>]*>/g)) {
				expect(Number(attribute(match[0], 'w:w'))).toBeLessThanOrEqual(maxWidth);
			}
		});

		it(`${format}: embeds the same logo and Inter font bytes used by PDFKit`, async () => {
			const { zip, xml } = exports[format];
			expect(xml).toContain('<w:drawing>');
			const images = Object.values(zip.files).filter(
				(f) => f.name.startsWith('word/media/') && !f.dir
			);
			expect(images).toHaveLength(1);
			expect((await images[0].async('nodebuffer')).equals(LOGO)).toBe(true);
			const fonts = Object.values(zip.files).filter((f) => f.name.endsWith('.odttf'));
			expect(fonts).toHaveLength(4);
			const fontTable = await xmlPart(zip, 'fontTable');
			expect(fontTable).toContain('<w:embedBold ');
			expect(fontTable).toContain('<w:embedItalic ');
			// Unbraced GUIDs silently caused serif substitution in the rendered DOCX.
			expect([...fontTable.matchAll(/w:fontKey="\{[A-F0-9-]{36}\}"/g)]).toHaveLength(4);
			for (const [index, data] of [
				FONTS.regular,
				FONTS.bold,
				FONTS.semibold,
				FONTS.italic
			].entries()) {
				const embedded = await zip.file(`word/fonts/font${index + 1}.odttf`).async('nodebuffer');
				// OOXML font obfuscation changes only the first 32 bytes.
				expect(embedded.subarray(32).equals(data.subarray(32))).toBe(true);
			}
		});

		it(`${format}: retains live page-number fields and PDF footer typography`, async () => {
			const footer = await xmlPart(exports[format].zip, 'footer1');
			expect(footer).toContain('PAGE');
			expect(footer).toContain('NUMPAGES');
			expect(footer).not.toContain('<undefined>');
			expect(footer).toContain(`w:sz w:val="${REPORT_STYLE.size.footer * 2}"`);
		});
	}

	it('comprehensive: uses Field/Details rows, the PDF masthead, and numbered headings', () => {
		const { xml } = exports.comprehensive;
		for (const text of [
			'Field',
			'Details',
			'Patient Name',
			'Patient ID',
			'Date of Assessment',
			'Education / Career Training',
			'Current Medications',
			'1. Patient Identification',
			'Interviews completed: ',
			'3. CLINICAL SNAPSHOT',
			'V2.18 Core Clinical Standard.'
		]) {
			expect(xml).toContain(text);
		}
		expect(xml).not.toContain('01   ');
		const heading = paragraphWith(xml, '1. Patient Identification');
		expect(heading).toContain('w:sz w:val="28"');
		expect(heading).toContain('w:keepNext');
		expect(heading).toContain('w:color="8FB9B3"');
		const body = paragraphWith(xml, 'Jordan reports a several-month');
		expect(body).toContain('Times New Roman');
		expect(body).toContain('w:sz w:val="20"');
	});

	it('patient summary: preserves the unheaded opening and 11.5pt serif body', () => {
		const { xml } = exports.patient_summary;
		expect(xml).not.toContain('>OPENING<');
		expect(xml).toContain('w:sz w:val="23"');
		expect(xml).toContain('Times New Roman');
		expect(xml).toContain('w:color="D4A84B"');
	});

	for (const format of ['comprehensive', 'concise']) {
		it(`${format}: keeps section rules out of history, case conceptualization, and treatment paragraphs`, async () => {
			const { xml, zip } = exports[format];
			const styles = await xmlPart(zip, 'styles');
			const normal = styles.match(/<w:style\b[^>]*w:styleId="Normal"[\s\S]*?<\/w:style>/)?.[0];
			expect(normal).toBeDefined();
			expect(normal).not.toContain('<w:pBdr');
			const data = SAMPLES[format]();
			for (const text of [
				...data.history,
				...data.caseConceptualization,
				...data.treatment.flatMap((phase) => [`${phase.phase} — `, phase.body])
			]) {
				const body = paragraphWith(xml, text);
				expect(body).toBeDefined();
				expect(body).toContain('<w:pStyle w:val="Normal"/>');
				for (const side of ['bottom', 'left', 'right', 'between']) {
					expect(body).toContain(`<w:${side} w:val="none"`);
				}
				expect(body).not.toContain('<w:top');
				expect(body).not.toContain('w:val="single"');
			}
			for (const title of ['5. Autobiographical', '8. Case Conceptualization']) {
				const heading = paragraphWith(xml, title);
				expect(heading.match(/<w:bottom\b/g)).toHaveLength(1);
				expect(heading).toContain('<w:bottom w:val="single"');
			}
		});
	}

	it('does not add an unsupported clinical risk statement for empty data', async () => {
		const data = sampleReportData();
		data.risk = {};
		data.identification = {};
		const zip = await JSZip.loadAsync(await renderAiDocx(data, { format: 'comprehensive' }));
		const xml = await xmlPart(zip, 'document');
		expect(xml).not.toContain('No acute risk indicators recorded');
		expect(xml).toContain('Patient Name');
	});

	it('preserves French text, clinical symbols, and long table content', async () => {
		const data = sampleReportData('comprehensive', 'fr');
		const phrase = 'Évaluation clinique — symptômes ≥2 semaines; âge 34; cœur. ';
		data.identification.primaryConcerns = phrase.repeat(50);
		const zip = await JSZip.loadAsync(
			await renderAiDocx(data, { format: 'comprehensive', language: 'fr' })
		);
		const xml = await xmlPart(zip, 'document');
		expect(xml).toContain(data.identification.primaryConcerns.trim());
		// Table text must be allowed to grow; fixed row heights would clip it.
		expect(xml).not.toContain('<w:trHeight');
	});
});
