import { beforeEach, describe, expect, it, vi } from 'vitest';

// Dispatch rules for POST /api/ai-report/[patientId]/referral-letter. Mongo and
// the agent are mocked: these check what the route decides and what it sends,
// never a real generation.

const state = { letterJob: null, dispatchJob: null, latestJob: null, anonymized: null };
const db = { created: [], updated: [] };

vi.mock('$env/dynamic/private', () => ({
	env: {
		AGENT_BASE_URL: 'http://agent.test',
		WORKFLOW_SECRET: 'secret',
		LANGFUSE_USER_SALT: 'salt'
	}
}));
vi.mock('$lib/database/connection.js', () => ({ connectToDatabase: vi.fn(async () => {}) }));
vi.mock('$lib/server/referralLetter.js', async (importOriginal) => ({
	...(await importOriginal()),
	findLetterJob: vi.fn(async () => state.letterJob),
	findDispatchJob: vi.fn(async () => state.dispatchJob),
	findLatestJob: vi.fn(async () => state.latestJob)
}));
vi.mock('$lib/database/schemas.js', () => ({
	GenerativeReport: {
		create: vi.fn(async (doc) => db.created.push(doc)),
		updateOne: vi.fn(async (filter, update) => db.updated.push({ filter, update }))
	}
}));
vi.mock('$lib/server/agentInput/index.js', () => ({
	buildAgentInput: vi.fn(async () => ({ case_id: 'case_p1', patient: { name: 'Alex Real' } })),
	loadFamilyDoctor: vi.fn(async () => state.doctor ?? null)
}));
vi.mock('$lib/server/anonymizeCase.js', () => ({
	anonymizeCaseForAgent: vi.fn(async () => state.anonymized)
}));

const { POST } = await import('./+server.js');

const admin = { user: { userType: 'admin' } };
const call = (body, locals = admin) =>
	POST({
		params: { patientId: 'p1' },
		request: new Request('http://app.test', {
			method: 'POST',
			body: body === undefined ? '' : JSON.stringify(body)
		}),
		locals
	});
const letterIn = (status) => ({ sot: { variants: { referral_letter_en: { status } } } });
const DISPATCH_JOB = {
	jobId: 'job-1',
	redCodeMap: [
		{
			code: 'NAME',
			token: '⟦NAME⟧',
			desc: 'Patient name',
			category: 'name',
			find: 'Alex Real',
			value: 'Alex Real'
		}
	]
};

let fetchMock;
const FRESH = {
	redactedCase: { case_id: 'case_p1', patient: { name: '⟦NAME⟧' } },
	redCodeMap: [
		DISPATCH_JOB.redCodeMap[0],
		{
			code: 'DOB',
			token: '⟦DOB⟧',
			desc: 'Date of birth',
			category: 'date',
			find: '1990-01-01',
			value: '1990-01-01'
		}
	],
	leak: { blocked: false, residual: [] }
};

beforeEach(() => {
	state.letterJob = null;
	state.dispatchJob = DISPATCH_JOB;
	state.latestJob = null;
	state.anonymized = FRESH;
	state.doctor = null;
	db.created.length = 0;
	db.updated.length = 0;
	fetchMock = vi.fn(
		async () => new Response(JSON.stringify({ accepted: true, runId: 'run-1' }), { status: 202 })
	);
	vi.stubGlobal('fetch', fetchMock);
});

describe('referral letter dispatch', () => {
	it('is admin only', async () => {
		expect((await call({}, { user: { userType: 'patient' } })).status).toBe(403);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('sends the primary physician as a tokenized referral_metadata, never in the clear', async () => {
		state.doctor = 'Jane Smith';
		state.dispatchJob = {
			...DISPATCH_JOB,
			redCodeMap: [
				...DISPATCH_JOB.redCodeMap,
				{ code: 'DOC', token: '⟦DOC⟧', desc: 'Name of Doctor', category: 'name', find: 'Smith', value: 'Smith' }
			]
		};
		await call({});
		const body = JSON.parse(fetchMock.mock.calls[0][1].body);
		expect(body.referral_metadata).toEqual({ referringClinician: { name: 'Dr. Jane ⟦DOC⟧' } });
		expect(fetchMock.mock.calls[0][1].body).not.toContain('Smith');
	});

	it('omits the referrer when the redaction profile did not cover the physician', async () => {
		state.doctor = 'Jane Smith';
		await call({});
		const init = fetchMock.mock.calls[0][1];
		expect(JSON.parse(init.body).referral_metadata).toBeUndefined();
		expect(init.body).not.toContain('Smith');
	});

	it('sends only the job id, hashed user id and token allow-list — no case, no PHI values', async () => {
		const res = await call({});
		expect(res.status).toBe(202);
		expect(await res.json()).toMatchObject({ state: 'generating', jobId: 'job-1', runId: 'run-1' });
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('http://agent.test/workflows/referral-letter');
		expect(init.headers['x-workflow-secret']).toBe('secret');
		const body = JSON.parse(init.body);
		expect(Object.keys(body).sort()).toEqual(['jobId', 'redCodeAllowList', 'userId']);
		expect(body.redCodeAllowList).toEqual([{ token: '⟦NAME⟧', desc: 'Patient name' }]);
		expect(init.body).not.toContain('Alex Real');
		expect(body.userId).not.toContain('p1');
	});

	for (const status of ['successful', 'needs_review']) {
		it(`never silently replaces a ${status} letter: needs regenerate:true`, async () => {
			state.letterJob = letterIn(status);
			const res = await call({});
			expect(res.status).toBe(409);
			expect((await res.json()).error).toBe('letter_exists');
			expect(fetchMock).not.toHaveBeenCalled();

			expect((await call({ regenerate: true })).status).toBe(202);
			expect(fetchMock).toHaveBeenCalledTimes(1);
		});
	}

	it('does not start a second run while one is generating, even with regenerate', async () => {
		state.letterJob = letterIn('generating');
		const res = await call({ regenerate: true });
		expect(res.status).toBe(409);
		expect((await res.json()).error).toBe('already_generating');
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('retries a failed letter without the regenerate flag', async () => {
		state.letterJob = letterIn('failed');
		expect((await call({})).status).toBe(202);
	});

	describe('no comprehensive snapshot: the letter redacts and sends its own case', () => {
		beforeEach(() => {
			state.dispatchJob = null;
		});

		it('patient with no report at all: creates the job and sends only the redacted case', async () => {
			const res = await call({});
			expect(res.status).toBe(202);
			expect(db.created).toHaveLength(1);
			expect(db.created[0]).toMatchObject({
				patientId: 'p1',
				status: null,
				redCodeMap: FRESH.redCodeMap
			});
			const body = JSON.parse(fetchMock.mock.calls[0][1].body);
			expect(body.jobId).toBe(db.created[0].jobId);
			expect(body.case).toEqual(FRESH.redactedCase);
			expect(body.redCodeAllowList).toEqual([
				{ token: '⟦NAME⟧', desc: 'Patient name' },
				{ token: '⟦DOB⟧', desc: 'Date of birth' }
			]);
			// The clear case (real name) never leaves the server.
			expect(fetchMock.mock.calls[0][1].body).not.toContain('Alex Real');
		});

		it('existing job without a snapshot: only ADDS the new tokens to its map', async () => {
			state.latestJob = {
				_id: 'j0',
				jobId: 'job-0',
				status: 'successful',
				redCodeMap: DISPATCH_JOB.redCodeMap
			};
			const res = await call({});
			expect(res.status).toBe(202);
			expect(db.created).toHaveLength(0);
			expect(db.updated[0].filter).toEqual({ _id: 'j0' });
			expect(db.updated[0].update.$set.redCodeMap).toEqual([
				DISPATCH_JOB.redCodeMap[0],
				FRESH.redCodeMap[1]
			]);
			expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
				jobId: 'job-0',
				case: FRESH.redactedCase
			});
		});

		it('never dispatches while a comprehensive run is in progress', async () => {
			state.latestJob = { _id: 'j0', jobId: 'job-0', status: 'generating' };
			const res = await call({});
			expect(res.status).toBe(409);
			expect((await res.json()).error).toBe('agent_conflict');
			expect(fetchMock).not.toHaveBeenCalled();
			expect(db.created).toHaveLength(0);
		});

		it('fails closed when redaction is not guaranteed', async () => {
			state.anonymized = { ...FRESH, leak: { blocked: true, residual: ['Alex Real'] } };
			const res = await call({});
			expect(res.status).toBe(422);
			const text = await res.text();
			expect(text).toContain('redaction_blocked');
			expect(text).not.toContain('Alex Real');
			expect(fetchMock).not.toHaveBeenCalled();
			expect(db.created).toHaveLength(0);
		});
	});

	it('with a comprehensive snapshot: sends no case and changes no job', async () => {
		expect((await call({})).status).toBe(202);
		expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty('case');
		expect(db.created).toHaveLength(0);
		expect(db.updated).toHaveLength(0);
	});

	it('reports the agent switch being off', async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify({ accepted: false, error: 'referral_letter_disabled' }), {
				status: 404
			})
		);
		const res = await call({});
		expect(res.status).toBe(503);
		expect((await res.json()).error).toBe('referral_letter_disabled');
	});

	it('maps agent refusals and outages', async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify({ error: 'job_missing_or_busy' }), { status: 409 })
		);
		expect((await call({})).status).toBe(409);
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify({ error: 'invalid_referral_case_or_metadata' }), { status: 400 })
		);
		expect((await call({})).status).toBe(422);
		fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
		expect((await call({})).status).toBe(502);
	});

	it('rejects a malformed body', async () => {
		const res = await POST({
			params: { patientId: 'p1' },
			request: new Request('http://app.test', { method: 'POST', body: '{not json' }),
			locals: admin
		});
		expect(res.status).toBe(400);
	});
});
