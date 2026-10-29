import { json } from '@sveltejs/kit';
import { randomUUID, createHash } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { buildAgentInput } from '$lib/server/agentInput/index.js';
import { anonymizeCaseForAgent } from '$lib/server/anonymizeCase.js';
import { GenerativeReport, User } from '$lib/database/schemas.js';
import { connectToDatabase } from '$lib/database/connection.js';
import { computeReadinessAndStaleness } from '$lib/server/aiReportReadiness.js';
import { REFERRAL_LETTER_KEY, findLetterJob, letterState } from '$lib/server/referralLetter.js';

function ensureAdmin(locals) {
	if (!locals.user) {
		return new Response(null, { status: 302, headers: { Location: '/login' } });
	}
	if (locals.user.userType !== 'admin') {
		return json({ error: 'Unauthorized: admin access required' }, { status: 403 });
	}
	return null;
}

/**
 * GET /api/comprehensive-report/[patientId]
 *
 * Two roles:
 *   ?inspect=1  → returns the agent_input.v1 payload we'd dispatch (admin debug)
 *   default     → returns the current GenerativeReport doc for this patient
 *                 (status, finalReport, agentError, etc.) so the admin UI can
 *                 poll for completion.
 */
export async function GET({ params, url, locals }) {
	const guard = ensureAdmin(locals);
	if (guard) return guard;
	await connectToDatabase();

	if (url.searchParams.get('inspect') === '1') {
		try {
			const agentInput = await buildAgentInput({ patientId: params.patientId });
			return json(agentInput);
		} catch (err) {
			return json({ error: err.message }, { status: 500 });
		}
	}

	// ?inspect=redacted → original vs redacted payload + the redCode map, WITHOUT
	// dispatching to the agent or persisting anything. This is the test/compare
	// surface: eyeball exactly what PHI became which token (and its descriptor),
	// confirm leak.blocked === false, and see the allow-list we'd send the agent.
	if (url.searchParams.get('inspect') === 'redacted') {
		try {
			const agentInput = await buildAgentInput({ patientId: params.patientId });
			const result = await anonymizeCaseForAgent({ patientId: params.patientId, agentInput });
			return json({
				original: agentInput,
				redacted: result.redactedCase,
				redCodeMap: result.redCodeMap,
				allowList: (result.redCodeMap ?? []).map((e) => ({ token: e.token, desc: e.desc })),
				leak: result.leak,
				warnings: result.warnings,
				counts: {
					tokens: result.redCodeMap?.length ?? 0,
					byCategory: (result.redCodeMap ?? []).reduce((acc, e) => {
						acc[e.category || 'other'] = (acc[e.category || 'other'] || 0) + 1;
						return acc;
					}, {})
				}
			});
		} catch (err) {
			return json({ error: err.message }, { status: 500 });
		}
	}

	// Single pollable payload that drives the 5-state AI Report button:
	//   - latest:    most recent run (status/jobId/cost) → Generating/Download states
	//   - readiness: required-interview gate            → Disabled vs Ready
	//   - staleness: new interviews since the report     → Regenerate-suggested
	//   - aiCost:    per-patient spend ledger            → "AI credit used $X.XX"
	const latest = await GenerativeReport.findOne({ patientId: params.patientId })
		.sort({ createdAt: -1 })
		.lean();

	const { readiness, staleness } = await computeReadinessAndStaleness(params.patientId, latest);

	// Per-variant readiness for the multi-select download dropdown. The agent
	// generates comprehensive_en first, then derives the other 5 — so right after
	// a run the derived variants are briefly 'generating'.
	const variants = computeVariantReadiness(latest);

	// Isolated: a failure here must never break the existing AI report polling.
	let referralLetter;
	try {
		referralLetter = await computeReferralLetterStatus(params.patientId, latest, staleness);
	} catch (err) {
		console.error('[comprehensive-report GET] referral letter status failed:', err);
		referralLetter = { state: 'absent', jobId: null, error: 'status_unavailable' };
	}

	const userDoc = await User.findById(params.patientId).select('patientProfile.aiCost').lean();
	const ledger = userDoc?.patientProfile?.aiCost ?? { totalUsd: 0, traces: [] };
	const aiCost = {
		totalUsd: ledger.totalUsd ?? 0,
		updatedAt: ledger.updatedAt ?? null,
		traceCount: (ledger.traces ?? []).length,
		traces: (ledger.traces ?? []).map((trace) => ({
			source: trace.source,
			refId: trace.refId,
			totalUsd: trace.totalUsd,
			at: trace.at
		}))
	};

	return json({
		// Legacy top-level fields (kept for existing callers / Postman polling).
		status: latest?.status ?? 'none',
		jobId: latest?.jobId ?? null,
		hasFinalReport: Boolean(latest?.finalReport),
		agentError: latest?.agentError ?? null,
		// Structured payload for the 5-state AI Report button.
		latest: latest
			? {
					jobId: latest.jobId,
					status: latest.status,
					hasFinalReport: Boolean(latest.finalReport),
					agentError: latest.agentError ?? null,
					createdAt: latest.createdAt,
					completedAt: latest.completedAt ?? null,
					costUsd: latest.cost?.totalUsd ?? null
				}
			: null,
		readiness,
		staleness,
		variants,
		referralLetter,
		aiCost
	});
}

// Standalone referral letter status. Looked up on the latest job that HAS the
// letter (not `latest`): each comprehensive dispatch makes a new job, and the
// letter stays on the job it was generated on. Staleness is measured against
// that job's snapshot, since that is the case the letter was written from.
async function computeReferralLetterStatus(patientId, latest, latestStaleness) {
	const path = `sot.variants.${REFERRAL_LETTER_KEY}`;
	const job = await findLetterJob(patientId, {
		jobId: 1,
		createdAt: 1,
		completedAt: 1,
		agentInput: 1,
		[`${path}.status`]: 1,
		[`${path}.completedAt`]: 1,
		[`${path}.reviewWarnings`]: 1,
		[`${path}.error`]: 1
	});
	if (!job) {
		return { state: 'absent', jobId: null, staleness: { stale: false, newInterviews: [] } };
	}
	const v = job.sot?.variants?.[REFERRAL_LETTER_KEY];
	const staleness =
		latest && String(latest._id) === String(job._id)
			? latestStaleness
			: (await computeReadinessAndStaleness(patientId, job)).staleness;
	return {
		state: letterState(v),
		jobId: job.jobId,
		// True when a newer comprehensive run exists than the one the letter used.
		onOlderJob: Boolean(latest) && String(latest._id) !== String(job._id),
		completedAt: v?.completedAt ?? null,
		reviewWarnings: v?.reviewWarnings ?? [],
		error: v?.error ?? null,
		staleness
	};
}

// Map the stored SoT to a { `${format}_${language}`: 'ready'|'generating'|'failed'|'absent' }
// table the download dropdown uses to gate each report row.
function computeVariantReadiness(latest) {
	const FORMATS = ['comprehensive', 'concise', 'referral', 'patient_summary'];
	const LANGS = ['en', 'fr'];
	const sot = latest?.sot ?? null;
	const runStatus = latest?.status ?? null;
	const out = {};
	for (const f of FORMATS) {
		for (const l of LANGS) {
			const key = `${f}_${l}`;
			if (f === 'comprehensive' && l === 'en') {
				// The base report lives on sot.sections, not sot.variants.
				const hasSections = sot?.sections && Object.keys(sot.sections).length > 0;
				out[key] =
					runStatus === 'successful' && hasSections
						? 'ready'
						: runStatus === 'failed'
							? 'failed'
							: runStatus === 'generating'
								? 'generating'
								: 'absent';
				continue;
			}
			// LAZY: a derived variant is only generated on demand (via /ensure), so
			// "base succeeded" no longer implies the variant is in flight. It is
			// 'absent' until something actually dispatches it.
			const v = sot?.variants?.[key];
			if (v?.status === 'successful') out[key] = 'ready';
			else if (v?.status === 'failed') out[key] = 'failed';
			else if (v?.status === 'generating') out[key] = 'generating';
			else out[key] = 'absent';
		}
	}
	return out;
}

/**
 * POST /api/comprehensive-report/[patientId]
 *
 * Lifecycle:
 *   1. Build the agent_input.v1 payload.
 *   2. Upsert a GenerativeReport doc with { agentInput, status: null, jobId }.
 *   3. POST to the agent's /workflows/comprehensive-report endpoint.
 *   4. On agent 2xx → flip status to 'generating' (agent owns the run from here).
 *   5. On dispatch failure → flip status to 'failed' with the error.
 *
 * The agent itself writes status='successful' (with finalReport) or
 * status='failed' (with agentError) directly to this same doc when done.
 *
 * Body (optional):
 *   { "dryRun": true } — build + persist the JSON but skip the agent call.
 */
export async function POST({ params, request, locals }) {
	const guard = ensureAdmin(locals);
	if (guard) return guard;
	await connectToDatabase();

	let body = {};
	try {
		const text = await request.text();
		if (text) body = JSON.parse(text);
	} catch {
		body = {};
	}
	const dryRun = body.dryRun === true;

	const agentBaseUrl = env.AGENT_BASE_URL;
	const workflowSecret = env.WORKFLOW_SECRET;
	const userSalt = env.LANGFUSE_USER_SALT ?? '';

	// Step 1: build the V1 payload.
	let agentInput;
	try {
		agentInput = await buildAgentInput({ patientId: params.patientId });
	} catch (err) {
		console.error('[comprehensive-report POST] build failed:', err);
		return json({ accepted: false, error: err.message }, { status: 500 });
	}

	// Step 1b: redact PHI into reversible coded tokens BEFORE the case leaves our
	// server. The redCodeMap snapshot is persisted on the SOT doc and reused to
	// de-tokenize the returned report. `leak.blocked` ⇒ a known patient
	// identifier survived redaction; we must not dispatch.
	let redactedCase = agentInput;
	let redCodeMap = [];
	let anonLeak = { blocked: false, residual: [] };
	try {
		const result = await anonymizeCaseForAgent({ patientId: params.patientId, agentInput });
		redactedCase = result.redactedCase;
		redCodeMap = result.redCodeMap;
		anonLeak = result.leak;
		if (result.warnings.length) {
			console.warn('[comprehensive-report POST] anonymization warnings:', result.warnings);
		}
	} catch (err) {
		// Could not guarantee redaction → fail closed (treat as a leak).
		console.error('[comprehensive-report POST] anonymization failed:', err);
		anonLeak = { blocked: true, residual: ['<anonymization error>'] };
	}

	const jobId = randomUUID();

	// Step 2: persist the source-of-truth doc with status=null.
	// We always create a new doc per dispatch so the history is preserved.
	const doc = await GenerativeReport.create({
		patientId: params.patientId,
		jobId,
		status: null,
		agentInput,
		redCodeMap,
		finalReport: null,
		agentError: null
	});

	// Short-circuit: agent isn't wired up yet, or caller asked for dry run.
	if (dryRun || !agentBaseUrl || !workflowSecret) {
		return json({
			accepted: false,
			jobId,
			status: null,
			reason: dryRun
				? 'dryRun=true'
				: 'AGENT_BASE_URL / WORKFLOW_SECRET not configured — payload persisted with status=null'
		});
	}

	// Leak guard: a known patient identifier survived redaction — do NOT send
	// raw PHI to the agent / Langfuse. Mark this dispatch failed.
	if (anonLeak.blocked) {
		const leakError = `PHI leak guard: residual identifier(s) after redaction: ${anonLeak.residual.join(', ')}`;
		await GenerativeReport.updateOne(
			{ _id: doc._id },
			{ $set: { status: 'failed', agentError: leakError, failedAt: new Date(), updatedAt: new Date() } }
		);
		return json({ accepted: false, jobId, status: 'failed', error: leakError }, { status: 422 });
	}

	// Step 3: dispatch to the agent. Hash patientId so Langfuse traces never
	// contain the raw Mongo _id.
	const userId = createHash('sha256').update(params.patientId + userSalt).digest('hex').slice(0, 32);

	// Allow-list for the agent's per-call token validator: the opaque token + its
	// descriptor ONLY. The original PHI value (`find`) and reverse `value` are
	// deliberately stripped so they never leave our server / reach Langfuse.
	const redCodeAllowList = (redCodeMap ?? []).map((e) => ({ token: e.token, desc: e.desc }));

	let agentResponse = null;
	let agentStatusCode = null;
	let dispatchError = null;
	try {
		const res = await fetch(`${agentBaseUrl}/workflows/comprehensive-report`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-workflow-secret': workflowSecret
			},
			body: JSON.stringify({ case: redactedCase, jobId, userId, redCodeAllowList })
		});
		agentStatusCode = res.status;
		if (res.ok) {
			agentResponse = await res.json().catch(() => ({}));
		} else {
			dispatchError = `agent returned ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`;
		}
	} catch (err) {
		dispatchError = `agent fetch failed: ${err.message}`;
	}

	// Step 4 / 5: update status based on the dispatch outcome.
	if (dispatchError) {
		await GenerativeReport.updateOne(
			{ _id: doc._id },
			{
				$set: {
					status: 'failed',
					agentError: dispatchError,
					failedAt: new Date(),
					updatedAt: new Date()
				}
			}
		);
		return json(
			{ accepted: false, jobId, status: 'failed', error: dispatchError, agentStatusCode },
			{ status: 502 }
		);
	}

	await GenerativeReport.updateOne(
		{ _id: doc._id },
		{ $set: { status: 'generating', updatedAt: new Date() } }
	);

	return json({
		accepted: true,
		jobId,
		status: 'generating',
		agentResponse
	});
}
