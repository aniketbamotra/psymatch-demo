import { json } from '@sveltejs/kit';
import { createHash, randomUUID } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { connectToDatabase } from '$lib/database/connection.js';
import { GenerativeReport } from '$lib/database/schemas.js';
import { buildAgentInput, loadFamilyDoctor } from '$lib/server/agentInput/index.js';
import { anonymizeCaseForAgent } from '$lib/server/anonymizeCase.js';
import {
	REFERRAL_LETTER_KEY,
	findDispatchJob,
	findLatestJob,
	findLetterJob,
	isBusyJob,
	letterState,
	mergeRedCodeMaps,
	referringClinicianFrom,
	tokenizeReferrer
} from '$lib/server/referralLetter.js';

/**
 * POST /api/ai-report/[patientId]/referral-letter
 *
 * Dispatches the standalone referral letter (`referral_letter_en`) to the
 * agent's POST /workflows/referral-letter. On demand only; nothing else
 * triggers it.
 *
 * Source case:
 *   - a comprehensive run already saved a redacted snapshot (`sot.redactedCase`)
 *     → the agent reads it; no `case` is sent;
 *   - otherwise the case is built and redacted here exactly as the comprehensive
 *     dispatch does (buildAgentInput → anonymizeCaseForAgent → leak guard) and
 *     sent as `case`. The clear agentInput never leaves the server. The letter
 *     goes on the patient's latest job (its token map is extended; tokens are
 *     stable, so existing reports still de-tokenize) or on a new job when the
 *     patient has none.
 *
 * The agent claims the variant (status 'generating') before replying and owns
 * every later status write; this route never writes the letter's status.
 *
 * Body: { regenerate?: boolean } — required to replace an existing
 *   ready / needs_review letter, so a click can't silently pay for a new one.
 *
 * Contract:
 *   202 { state:'generating', jobId, runId }
 *   409 { error:'agent_conflict' }       a comprehensive run is in progress
 *   422 { error:'redaction_blocked' }    redaction could not be guaranteed
 *   500 { error:'case_build_failed' }    the case could not be built
 *   409 { error:'already_generating' }   a letter run is in flight
 *   409 { error:'letter_exists', state } existing letter; resend with regenerate
 *   409 { error:'agent_conflict' }       agent refused (active work / identity)
 *   422 { error:'agent_rejected', detail }  agent refused the case (400)
 *   503 { error:'referral_letter_disabled' }  agent switch is off
 *   400 bad body · 403 not admin · 500 agent not configured · 502 dispatch failed
 */
export async function POST({ params, request, locals }) {
	if (!locals.user) {
		return new Response(null, { status: 302, headers: { Location: '/login' } });
	}
	if (locals.user.userType !== 'admin') {
		return json({ error: 'Unauthorized: admin access required' }, { status: 403 });
	}

	const { patientId } = params;
	if (!patientId) {
		return json({ error: 'Patient ID is required' }, { status: 400 });
	}

	let body = {};
	try {
		const text = await request.text();
		if (text) body = JSON.parse(text);
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}
	const regenerate = body.regenerate === true;

	const agentBaseUrl = env.AGENT_BASE_URL;
	const workflowSecret = env.WORKFLOW_SECRET;
	if (!agentBaseUrl || !workflowSecret) {
		return json({ error: 'AGENT_BASE_URL / WORKFLOW_SECRET not configured' }, { status: 500 });
	}

	await connectToDatabase();

	const current = await findLetterJob(patientId, {
		[`sot.variants.${REFERRAL_LETTER_KEY}.status`]: 1
	});
	const currentState = letterState(current?.sot?.variants?.[REFERRAL_LETTER_KEY]);
	if (currentState === 'generating') {
		return json({ error: 'already_generating' }, { status: 409 });
	}
	if ((currentState === 'ready' || currentState === 'needs_review') && !regenerate) {
		return json({ error: 'letter_exists', state: currentState }, { status: 409 });
	}

	let job = await findDispatchJob(patientId);
	let redactedCase;
	if (!job) {
		const latest = await findLatestJob(patientId);
		if (isBusyJob(latest)) {
			return json({ error: 'agent_conflict' }, { status: 409 });
		}
		let agentInput;
		try {
			agentInput = await buildAgentInput({ patientId });
		} catch (err) {
			console.error('[referral-letter POST] build failed:', err);
			return json({ error: 'case_build_failed' }, { status: 500 });
		}
		// Fail closed, as the comprehensive dispatch does: no guaranteed redaction,
		// nothing leaves the server. Residual values are PHI, so only log a count.
		let result;
		try {
			result = await anonymizeCaseForAgent({ patientId, agentInput });
		} catch (err) {
			console.error('[referral-letter POST] anonymization failed:', err);
		}
		if (!result || result.leak?.blocked) {
			console.error(
				'[referral-letter POST] leak guard blocked dispatch:',
				result?.leak?.residual?.length ?? 'error'
			);
			return json({ error: 'redaction_blocked' }, { status: 422 });
		}
		const redCodeMap = mergeRedCodeMaps(latest?.redCodeMap, result.redCodeMap);
		if (latest) {
			await GenerativeReport.updateOne(
				{ _id: latest._id },
				{ $set: { redCodeMap, updatedAt: new Date() } }
			);
			job = { jobId: latest.jobId, redCodeMap };
		} else {
			// Same record shape the comprehensive dispatch creates.
			const jobId = randomUUID();
			await GenerativeReport.create({
				patientId,
				jobId,
				status: null,
				agentInput,
				redCodeMap,
				finalReport: null,
				agentError: null
			});
			job = { jobId, redCodeMap };
		}
		redactedCase = result.redactedCase;
	}

	// Standard §2.1 addressee = the patient's primary physician. The stored redacted
	// case never carries it, so it is sent alongside, tokenized with this job's map.
	// Best effort: any problem leaves the letter's placeholder.
	let referralMetadata;
	try {
		referralMetadata = tokenizeReferrer(
			referringClinicianFrom(await loadFamilyDoctor({ patientId })),
			job.redCodeMap
		);
	} catch (err) {
		console.error('[referral-letter POST] referrer lookup failed:', err.message);
	}

	// Same opaque Langfuse user id and token allow-list as the other workflows:
	// token + descriptor only, never the original PHI value.
	const userId = createHash('sha256')
		.update(patientId + (env.LANGFUSE_USER_SALT ?? ''))
		.digest('hex')
		.slice(0, 32);
	const redCodeAllowList = (job.redCodeMap ?? []).map((e) => ({ token: e.token, desc: e.desc }));

	let res;
	try {
		res = await fetch(`${agentBaseUrl}/workflows/referral-letter`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-workflow-secret': workflowSecret
			},
			body: JSON.stringify({
				jobId: job.jobId,
				userId,
				redCodeAllowList,
				...(redactedCase && { case: redactedCase }),
				...(referralMetadata && { referral_metadata: referralMetadata })
			})
		});
	} catch (err) {
		return json(
			{ error: 'dispatch_failed', detail: `agent fetch failed: ${err.message}` },
			{ status: 502 }
		);
	}

	const payload = await res.json().catch(() => ({}));
	if (res.ok) {
		return json(
			{ state: 'generating', jobId: job.jobId, runId: payload.runId ?? null },
			{ status: 202 }
		);
	}
	if (res.status === 404 && payload.error === 'referral_letter_disabled') {
		return json({ error: 'referral_letter_disabled' }, { status: 503 });
	}
	if (res.status === 409) {
		return json({ error: 'agent_conflict', detail: payload }, { status: 409 });
	}
	// e.g. an administered interview without a standard_report.summary.
	if (res.status === 400) {
		return json({ error: 'agent_rejected', detail: payload }, { status: 422 });
	}
	return json(
		{ error: 'dispatch_failed', agentStatusCode: res.status, detail: payload },
		{ status: 502 }
	);
}
