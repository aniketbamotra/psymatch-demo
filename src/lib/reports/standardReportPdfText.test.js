import { inflateSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateJsonBasedPdf } from '../utils/pdfGenerators/jsonBasedPdfGenerator.js';
import { processAdultBioData } from '../utils/reportGenerators/adultBioProcessor.js';

// Decode text from this renderer's built-in WinAnsi fonts. Inspect the actual
// PDF content streams so a valid PDF containing garbled text still fails.
function pdfText(buffer) {
	const winAnsi = '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ';
	const text = [];
	for (const stream of buffer.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
		const content = inflateSync(Buffer.from(stream[1], 'latin1')).toString('latin1');
		for (const run of content.matchAll(/\[([^\]]*)\]\s*TJ/g)) {
			const hex = [...run[1].matchAll(/<([\da-f]+)>/gi)].map((match) => match[1]);
			text.push(
				Buffer.from(hex.join(''), 'hex')
					.toString('latin1')
					.replace(/[\u0080-\u009f]/g, (char) => winAnsi[char.charCodeAt(0) - 0x80])
			);
		}
	}
	return text.join('\n').replace(/\s+/g, ' ');
}

function report(report_sections, patientInfo = {}) {
	return {
		patientInfo: {
			firstName: 'Test',
			lastName: 'Patient',
			fileMakerId: 'TEST-001',
			completedTests: ['Adult Biographical Interview'],
			...patientInfo
		},
		reports: [{ report_title: 'Adult Biographical Interview', report_sections }]
	};
}

describe('standard PDF pasted tabs', () => {
	beforeEach(() => vi.spyOn(console, 'log').mockImplementation(() => {}));
	afterEach(() => vi.restoreAllMocks());

	it('preserves Adult Bio multiline pasted bullets without changing the response', async () => {
		const concerns = [
			'Sleep concern and nighttime awakenings',
			'Difficulty concentrating and multitasking',
			'Sensitivity to light and sometimes sound',
			'Periodic irritability/anger'
		];
		const pasted = `Current symptoms\n${concerns.map((line) => `•\t${line}`).join('\n')}`;
		const responses = { q30: pasted };
		const processed = processAdultBioData({ _responses: responses });
		const data = report(processed.outcomes.adult_bio.report_sections);
		const original = structuredClone(data);
		const text = pdfText(await generateJsonBasedPdf(data));
		for (const concern of concerns) expect(text).toContain(`• ${concern}`);
		expect(text).toContain('Current symptoms');
		expect(responses.q30).toBe(pasted);
		expect(data).toEqual(original);
	});

	it('handles tabs in headings, variables, bullets, tables and page headers', async () => {
		const data = report(
			[
				{ heading: 'Current\tsymptoms', text: '{concern}', bold: true },
				{ bullet_points: [{ text: 'Focus\tconcern' }], italic: true },
				{ text: 'Repeated\t\ttabs; café — “quoted” • text.' },
				{
					type: 'table',
					headers: ['First\tcolumn', 'Second\tcolumn'],
					rows: [{ characteristic: 'Table\tlabel', importance: 'Table\tvalue' }]
				}
			],
			{ firstName: 'Test\tName', completedTests: ['Adult\tBio'] }
		);
		data.reports[0].report_title = 'Adult\tBiographical Interview';
		data.reports[0].variables = { concern: 'Sleep\tconcern' };
		const text = pdfText(await generateJsonBasedPdf(data));
		for (const expected of [
			'Current symptoms',
			'Sleep concern',
			'• Focus concern',
			'Repeated tabs; café — “quoted” • text.',
			'First column',
			'Second column',
			'Table label',
			'Table value',
			'Test Name Patient',
			'Adult Bio',
			'Adult Biographical Interview'
		])
			expect(text).toContain(expected);
	});
});
