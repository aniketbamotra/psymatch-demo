import { beforeEach, describe, expect, it, vi } from 'vitest';

// GET /api/download-generative-summary/[patientId]?format=referral_letter.
// Mongo and the renderers are mocked: these check which letter is served, in
// what state, with which tokens resolved — not the layout (see
// src/lib/reports/referralLetterRender.test.js for that).

const state = { letterJob: null };
const rendered = { pdf: [], docx: [] };

vi.mock('$lib/database/connection.js', () => ({ connectToDatabase: vi.fn(async () => {}) }));
vi.mock('$lib/database/schemas.js', () => ({
	GenerativeReport: { findOne: vi.fn() },
	User: {
		findById: () => ({
			select: () => ({ lean: async () => ({ patientProfile: { fileMakerId: 'FM42' } }) })
		})
	}
}));
vi.mock('$lib/server/referralLetter.js', async (importOriginal) => ({
	...(await importOriginal()),
	findLetterJob: vi.fn(async () => state.letterJob)
}));
vi.mock('$lib/utils/pdfGenerators/referralLetterPdf.js', () => ({
	renderReferralLetterPdf: vi.fn(async (letter, opts) => {
		rendered.pdf.push({ letter, opts });
		return Buffer.from('%PDF-test');
	})
}));
vi.mock('$lib/utils/docxGenerators/referralLetterDocx.js', () => ({
	renderReferralLetterDocx: vi.fn(async (letter, opts) => {
		rendered.docx.push({ letter, opts });
		return Buffer.from('PKtest');
	})
}));

const { GET } = await import('./+server.js');
const { GenerativeReport } = await import('$lib/database/schemas.js');

const admin = { user: { userType: 'admin' } };
const get = (query, locals = admin) =>
	GET({
		params: { patientId: 'p1' },
		url: new URL(`http://app.test/x?format=referral_letter&${query}`),
		locals
	});

const REDCODE = [
	{
		code: 'NAME',
		token: '⟦NAME_OF_PATIENT_X⟧',
		desc: 'Patient name',
		category: 'name',
		find: 'Alex Real',
		value: 'Alex Real'
	}
];
const jobWith = (
	status,
	document = {
		re: 'Re: ⟦NAME_OF_PATIENT_X⟧',
		content: { closing: 'Thank you ⟦NAME_OF_PATIENT_X⟧.' }
	}
) => ({
	patientId: 'p1',
	redCodeMap: REDCODE,
	sot: { variants: { referral_letter_en: { status, document } } }
});

beforeEach(() => {
	state.letterJob = null;
	rendered.pdf.length = 0;
	rendered.docx.length = 0;
});

describe('referral letter download', () => {
	it('is admin only and English only', async () => {
		expect((await get('language=en', { user: { userType: 'patient' } })).status).toBe(403);
		expect((await get('language=fr')).status).toBe(400);
	});

	it('serves the final letter with tokens resolved before layout', async () => {
		state.letterJob = jobWith('successful');
		const res = await get('type=pdf');
		expect(res.status).toBe(200);
		expect(res.headers.get('Content-Disposition')).toBe(
			'attachment; filename="psymatch-referral-letter-en-FM42.pdf"'
		);
		const { letter } = rendered.pdf[0];
		expect(letter.re).toBe('Re: Alex Real');
		expect(JSON.stringify(letter)).not.toContain('⟦');
	});

	it('serves a needs_review letter with a normal file name', async () => {
		state.letterJob = jobWith('needs_review');
		for (const type of ['pdf', 'docx']) {
			const res = await get(`type=${type}`);
			expect(res.status).toBe(200);
			expect(res.headers.get('Content-Disposition')).toBe(
				`attachment; filename="psymatch-referral-letter-en-FM42.${type}"`
			);
		}
		expect(rendered.pdf).toHaveLength(1);
		expect(rendered.docx).toHaveLength(1);
	});

	it('prints interview display names, not raw keys', async () => {
		state.letterJob = jobWith('successful', {
			re: 'Re: x',
			interviewsCompleted: [
				'comprehensive_suicide_self_harm',
				'post_traumatic_stress',
				'some_new_interview',
				'Depression Interview'
			],
			content: {}
		});
		await get('type=pdf');
		expect(rendered.pdf[0].letter.interviewsCompleted).toEqual([
			'Suicide & Self-Harm',
			'Post-Traumatic Stress',
			'Some New Interview',
			'Depression Interview'
		]);
	});

	for (const status of ['generating', 'failed']) {
		it(`does not render a ${status} letter`, async () => {
			state.letterJob = jobWith(status);
			const res = await get('type=pdf');
			expect(res.status).toBe(409);
			expect(await res.json()).toMatchObject({ preparing: true, status });
			expect(rendered.pdf).toHaveLength(0);
		});
	}

	it('reports absent when no job has a letter', async () => {
		const res = await get('type=pdf');
		expect(res.status).toBe(409);
		expect((await res.json()).status).toBe('absent');
	});

	it('redacted copy masks tokens to labels and never exposes the real value', async () => {
		state.letterJob = jobWith('successful');
		const res = await get('type=pdf&redact=1');
		expect(res.headers.get('Content-Disposition')).toContain('-redacted-');
		const text = JSON.stringify(rendered.pdf[0].letter);
		expect(text).toContain('[Patient name]');
		expect(text).not.toContain('Alex Real');
		expect(text).not.toContain('⟦');
	});

	it('does not touch the old formats: they still read the latest job', async () => {
		GenerativeReport.findOne.mockReturnValue({ sort: () => ({ lean: async () => null }) });
		const res = await GET({
			params: { patientId: 'p1' },
			url: new URL('http://app.test/x?format=referral&language=en'),
			locals: admin
		});
		expect(res.status).toBe(404);
		expect(rendered.pdf).toHaveLength(0);
	});
});
