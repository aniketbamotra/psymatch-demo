import { beforeEach, describe, expect, it, vi } from 'vitest';

// The `referralLetter` field on GET /api/comprehensive-report/[patientId]. This
// endpoint drives the existing AI report button, so the letter lookup must
// never change or break the rest of the payload.

const state = { latest: null, letterJob: null, letterThrows: false };

vi.mock('$lib/database/connection.js', () => ({ connectToDatabase: vi.fn(async () => {}) }));
vi.mock('$lib/server/agentInput/index.js', () => ({ buildAgentInput: vi.fn() }));
vi.mock('$lib/server/anonymizeCase.js', () => ({ anonymizeCaseForAgent: vi.fn() }));
vi.mock('$lib/server/aiReportReadiness.js', () => ({
	computeReadinessAndStaleness: vi.fn(async (_id, report) => ({
		readiness: { ready: true, required: [], completedCount: 5, requiredCount: 5 },
		staleness: {
			stale: report?.jobId === 'old',
			newInterviews: report?.jobId === 'old' ? [{ key: 'ptsd', label: 'PTSD' }] : []
		}
	}))
}));
vi.mock('$lib/database/schemas.js', () => ({
	GenerativeReport: { findOne: () => ({ sort: () => ({ lean: async () => state.latest }) }) },
	User: { findById: () => ({ select: () => ({ lean: async () => null }) }) }
}));
vi.mock('$lib/server/referralLetter.js', async (importOriginal) => ({
	...(await importOriginal()),
	findLetterJob: vi.fn(async () => {
		if (state.letterThrows) throw new Error('boom');
		return state.letterJob;
	})
}));

const { GET } = await import('./+server.js');
const get = async () =>
	(
		await GET({
			params: { patientId: 'p1' },
			url: new URL('http://app.test/x'),
			locals: { user: { userType: 'admin' } }
		})
	).json();

const job = (id, jobId, variants = {}) => ({
	_id: id,
	jobId,
	status: 'successful',
	sot: { sections: { 1: {} }, variants }
});

beforeEach(() => {
	state.latest = job('a', 'new');
	state.letterJob = null;
	state.letterThrows = false;
});

describe('comprehensive-report GET: referral letter status', () => {
	it('absent when no job has a letter; existing fields unchanged', async () => {
		const data = await get();
		expect(data.referralLetter.state).toBe('absent');
		expect(data.status).toBe('successful');
		expect(data.variants.comprehensive_en).toBe('ready');
		expect(data.variants).not.toHaveProperty('referral_letter_en');
	});

	it('maps needs_review to ready (warnings kept) and reads the letter from an OLDER job', async () => {
		state.letterJob = job('b', 'old', {
			referral_letter_en: { status: 'needs_review', reviewWarnings: ['w1'], completedAt: 't' }
		});
		const { referralLetter } = await get();
		expect(referralLetter).toMatchObject({
			state: 'ready',
			jobId: 'old',
			onOlderJob: true,
			reviewWarnings: ['w1']
		});
		// Staleness is measured against the letter's own job.
		expect(referralLetter.staleness.stale).toBe(true);
	});

	it('successful maps to ready', async () => {
		state.letterJob = job('a', 'new', { referral_letter_en: { status: 'successful' } });
		expect((await get()).referralLetter).toMatchObject({ state: 'ready', onOlderJob: false });
	});

	it('a failing letter lookup never breaks the existing payload', async () => {
		state.letterThrows = true;
		const data = await get();
		expect(data.referralLetter).toMatchObject({ state: 'absent', error: 'status_unavailable' });
		expect(data.status).toBe('successful');
		expect(data.variants.comprehensive_en).toBe('ready');
	});
});
