import { describe, it, expect } from 'vitest';
import { renderAiPdf } from '../utils/pdfGenerators/aiReportPdf.js';
import { renderAiDocx } from '../utils/docxGenerators/aiReportDocx.js';
import { SAMPLES, sampleReportData } from './__fixtures__/sampleReportData.js';
import { FORMATS, structureFor } from './reportGraph.js';

// These exercise the real PDFKit + docx renderers against fixture `data` — NO AI
// report is generated (no agent, no Mongo, no credits). Every format is rendered
// in both output types so PDF and DOCX stay in lockstep.

const isPdf = (buf) =>
	Buffer.isBuffer(buf) && buf.length > 1000 && buf.subarray(0, 5).toString('latin1') === '%PDF-';
const isDocx = (buf) =>
	Buffer.isBuffer(buf) && buf.length > 1000 && buf.subarray(0, 2).toString('latin1') === 'PK';

describe('AI report render — PDF (all formats, no AI generation)', () => {
	for (const format of FORMATS) {
		it(`renders ${format} → PDF`, async () => {
			const buf = await renderAiPdf(SAMPLES[format](), { format, language: 'en' });
			expect(isPdf(buf), `${format} PDF should be a valid non-empty %PDF- buffer`).toBe(true);
		});
	}

	it('renders a French comprehensive report → PDF', async () => {
		const buf = await renderAiPdf(sampleReportData('comprehensive', 'fr'), {
			format: 'comprehensive',
			language: 'fr'
		});
		expect(isPdf(buf)).toBe(true);
	});
});

describe('AI report render — DOCX (all formats, no AI generation)', () => {
	for (const format of FORMATS) {
		it(`renders ${format} → DOCX`, async () => {
			const buf = await renderAiDocx(SAMPLES[format](), { format, language: 'en' });
			expect(isDocx(buf), `${format} DOCX should be a valid non-empty PK zip buffer`).toBe(true);
		});
	}
});

describe('AI report structure — data carries every declared section', () => {
	it('the comprehensive fixture has all 11 manifest section keys', () => {
		const data = sampleReportData('comprehensive');
		for (const s of structureFor('comprehensive').sections) {
			expect(data[s.key], `missing section "${s.key}"`).toBeDefined();
		}
	});

	it('the referral fixture has all letter section keys', () => {
		const data = SAMPLES.referral();
		for (const s of structureFor('referral').sections) {
			expect(data[s.key], `missing letter section "${s.key}"`).toBeDefined();
		}
	});

	it('the patient-summary fixture has the declared section count with an italic final section', () => {
		const st = structureFor('patient_summary').structure;
		const data = SAMPLES.patient_summary();
		expect(data.sections).toHaveLength(st.sectionCount);
		expect(data.sections.find((s) => s.id === st.italicSectionId).italic).toBe(true);
	});
});

// A referral letter cards at most four co-morbid diagnoses; the rest are named
// in one line. That line was briefly appended to `subthreshold`, so on a patient
// with ten supported diagnoses it printed "Additional supported co-morbid
// diagnoses: …" directly beneath a heading asserting they were subthreshold.
describe('referral letter — supported comorbidities are never labelled subthreshold', () => {
	const manyDx = (n) =>
		Array.from({ length: n }, (_, i) => ({
			name: `Disorder ${i + 1}`,
			dsmCode: '300.0',
			icd11Code: '6B00',
			severity: 'moderate',
			rationale: 'x'
		}));

	it('names the overflow under Co-Morbid, not under Subthreshold', async () => {
		const { buildLetterData } = await import('../server/buildReportData.js');
		const d = buildLetterData({
			letterSections: {},
			comprehensiveSections: {
				7: { primary: manyDx(1)[0], comorbid: manyDx(9), subthreshold: [] }
			},
			language: 'en',
			patient: 'Test Patient',
			patientId: '5968'
		});
		expect(d.comorbid).toHaveLength(4);
		expect(d.comorbidOverflow).toContain('Additional supported co-morbid diagnoses');
		// The claim must not live in the subthreshold block at all.
		expect(d.subthreshold.join(' ')).not.toContain('Additional supported');
		expect(d.subthreshold).toEqual([]);
	});

	it('emits no overflow line when everything fits', async () => {
		const { buildLetterData } = await import('../server/buildReportData.js');
		const d = buildLetterData({
			letterSections: {},
			comprehensiveSections: { 7: { primary: manyDx(1)[0], comorbid: manyDx(3) } },
			language: 'en',
			patient: 'Test Patient',
			patientId: '5968'
		});
		expect(d.comorbid).toHaveLength(3);
		expect(d.comorbidOverflow).toBe('');
	});
});

describe('AI report render — revised standard (Treatment Reference, Principal, medication statement)', () => {
	const withTable = () => {
		const data = sampleReportData('comprehensive');
		data.diagnostic.primary.selection =
			'Principal diagnosis selected at Step 2 (organizing condition): overlap and attribution are documented.\nPresenting focus: panic, which brought Jordan to assessment.';
		data.treatmentReference = {
			message:
				'Treatment options below are selected on the basis of evidence. The evidence column names the guideline source and the strength of evidence for effectiveness.',
			rows: [
				{ diagnosis: 'Major Depressive Disorder', options: 'Cognitive behavioural therapy; behavioural activation', medicationClasses: 'Antidepressants', planning: 'First line, psychological: cognitive behavioural therapy. Medication is co-first line with psychotherapy.', evidence: 'Strong — CANMAT', flag: true },
				{ diagnosis: 'Generalized Anxiety Disorder', options: 'Cognitive behavioural therapy', medicationClasses: 'SSRIs; SNRIs', planning: 'First line, psychological: cognitive behavioural therapy. Medication is co-first line.', evidence: 'Strong — CANMAT', flag: false }
			],
			note: 'A current medication may interact; see Medication Considerations.'
		};
		data.medicationStatement = 'PsyMatch provides general background information about medication considerations and does not make medication recommendations.';
		data.diagnostic.note = 'The following categories reflect the patient\'s PsyMatch structured DSM-5 diagnostic interview responses and are provided for independent clinician review.';
		return data;
	};

	it('renders the table, selection note and statement → PDF and DOCX', async () => {
		const pdf = await renderAiPdf(withTable(), { format: 'comprehensive', language: 'en' });
		expect(isPdf(pdf)).toBe(true);
		const docx = await renderAiDocx(withTable(), { format: 'comprehensive', language: 'en' });
		expect(isDocx(docx)).toBe(true);
	});

	it('buildReportData carries the fixed §7 note', async () => {
		const { buildReportData, DIAGNOSTIC_NOTE } = await import('../server/buildReportData.js');
		const data = buildReportData({ sections: { 7: { primary: { name: 'X' } } }, format: 'comprehensive', language: 'en' });
		expect(data.diagnostic.note).toBe(DIAGNOSTIC_NOTE);
	});

	it('a legacy report (no table, no statement) still renders', async () => {
		const data = sampleReportData('comprehensive');
		expect(data.treatmentReference).toBeUndefined();
		expect(isPdf(await renderAiPdf(data, { format: 'comprehensive', language: 'en' }))).toBe(true);
		expect(isDocx(await renderAiDocx(data, { format: 'comprehensive', language: 'en' }))).toBe(true);
	});
});
