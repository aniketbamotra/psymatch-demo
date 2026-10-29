import { json } from '@sveltejs/kit';
import { createHash } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { GenerativeReport } from '$lib/database/schemas.js';
import { connectToDatabase } from '$lib/database/connection.js';
import { chainTo, FORMATS, LANGUAGES } from '$lib/reports/reportGraph.js';

/**
 * POST /api/ai-report/[patientId]/ensure
 *
 * Lazy dependency-chain driver for the AI report variants. The agent generates
 * `comprehensive_en` (the SoT root) eagerly; every other variant is derived
 * ON DEMAND, one step at a time, so we never block a serverless request on a
 * long LLM generation.
 *
 * Dependency graph (root → leaves):
 *   comprehensive_en → { concise, referral, patient_summary }_en
 *   comprehensive_en → comprehensive_fr
 *   ${F}_en          → ${F}_fr     (F ∈ {concise, referral, patient_summary})
 *
 * Body: { format, language, regenerate?:boolean }
 *
 * Contract:
 *   202 { state:'generating', triggered:{format,language}, chain }  — a step was dispatched
 *   200 { state:'ready' }                                           — whole chain is ready
 *   409 { error:'generate_first' }                                  — comprehensive_en missing
 *   202 { state:'generating', triggered:{format:'comprehensive',language:'en'} }
 *                                                                   — fresh comprehensive (regenerate)
 *   400 bad input · 403 not admin · 500 agent not configured · 502 agent dispatch failed
 *
 * The UI polls GET /api/comprehensive-report for variant readiness and re-calls
 * this endpoint to advance the chain until the target is ready, then downloads.
 */

// Formats / languages / the ordered ancestor→target build chain all come from the
// single report graph (src/lib/reports/reportGraph.js) so the flow, download route
// and renderers agree on what derives from what.

const hasSections = (sot) => Boolean(sot?.sections && Object.keys(sot.sections).length > 0);

// Same readiness rule the download gate uses.
function nodeReady(report, node) {
	if (node.format === 'comprehensive' && node.language === 'en') {
		return report?.status === 'successful' && hasSections(report?.sot);
	}
	return report?.sot?.variants?.[`${node.format}_${node.language}`]?.status === 'successful';
}

export async function POST({ params, request, locals, fetch }) {
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
		body = {};
	}
	const format = String(body.format || 'comprehensive').toLowerCase();
	const language = String(body.language || 'en').toLowerCase();
	const regenerate = body.regenerate === true;
	if (!FORMATS.includes(format)) {
		return json({ error: `Unknown format "${format}"` }, { status: 400 });
	}
	if (!LANGUAGES.includes(language)) {
		return json({ error: `Unknown language "${language}"` }, { status: 400 });
	}

	await connectToDatabase();

	const target = { format, language };
	const isCompEn = format === 'comprehensive' && language === 'en';

	let report = await GenerativeReport.findOne({ patientId }).sort({ createdAt: -1 }).lean();

	// ── Regenerate mutations ────────────────────────────────────────────────
	if (regenerate) {
		if (isCompEn) {
			// A fresh comprehensive run is a brand-new doc ⇒ every derived variant
			// is discarded automatically. Delegate to our own comprehensive POST.
			const res = await fetch(`/api/comprehensive-report/${patientId}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: '{}'
			});
			if (!res.ok) {
				const detail = await res.json().catch(() => ({}));
				return json(
					{ error: 'comprehensive_dispatch_failed', detail },
					{ status: res.status }
				);
			}
			return json(
				{ state: 'generating', triggered: { format: 'comprehensive', language: 'en' } },
				{ status: 202 }
			);
		}
		// Non-comprehensive English target: discard its French descendant so a
		// regenerated parent doesn't leave a stale child behind.
		if (report && language === 'en') {
			await GenerativeReport.updateOne(
				{ _id: report._id },
				{ $unset: { [`sot.variants.${format}_fr`]: '' }, $set: { updatedAt: new Date() } },
				{ strict: false }
			);
			// Reflect the discard locally so the advance walk sees it gone.
			if (report.sot?.variants) delete report.sot.variants[`${format}_fr`];
		}
		// (F,fr) / (comprehensive,fr): no descendants — fall through to regenerate target.
	}

	// ── Advance one step ────────────────────────────────────────────────────
	// Ordered ancestors → target, from the report graph (parents first, target last).
	const nodes = chainTo(format, language);

	// For regenerate, the target node must be re-run even if it currently reads
	// 'successful' — treat it as not-ready in the walk.
	const forceRegen = (node) =>
		regenerate && node.format === target.format && node.language === target.language;

	let firstNotReady = null;
	for (const node of nodes) {
		if (forceRegen(node) || !nodeReady(report, node)) {
			firstNotReady = node;
			break;
		}
	}

	if (!firstNotReady) {
		return json({ state: 'ready' });
	}

	// Can't derive anything without the SoT root. (Fresh comprehensive regenerate
	// was already handled above.)
	if (firstNotReady.format === 'comprehensive' && firstNotReady.language === 'en') {
		return json({ error: 'generate_first' }, { status: 409 });
	}

	// Trigger the first-not-ready node. Its parent (the preceding chain node) is
	// guaranteed ready, since every node before firstNotReady passed the check.
	const agentBaseUrl = env.AGENT_BASE_URL;
	const workflowSecret = env.WORKFLOW_SECRET;
	if (!agentBaseUrl || !workflowSecret) {
		return json(
			{ error: 'AGENT_BASE_URL / WORKFLOW_SECRET not configured' },
			{ status: 500 }
		);
	}

	const userId = createHash('sha256')
		.update(patientId + (env.LANGFUSE_USER_SALT ?? ''))
		.digest('hex')
		.slice(0, 32);
	const redCodeAllowList = (report?.redCodeMap ?? []).map((e) => ({ token: e.token, desc: e.desc }));

	let dispatchError = null;
	let agentStatusCode = null;
	try {
		const res = await fetch(`${agentBaseUrl}/workflows/regenerate-variant`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-workflow-secret': workflowSecret
			},
			body: JSON.stringify({
				jobId: report.jobId,
				format: firstNotReady.format,
				language: firstNotReady.language,
				userId,
				redCodeAllowList
			})
		});
		agentStatusCode = res.status;
		if (!res.ok) {
			dispatchError = `agent returned ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`;
		}
	} catch (err) {
		dispatchError = `agent fetch failed: ${err.message}`;
	}

	if (dispatchError) {
		return json({ error: 'variant_dispatch_failed', detail: dispatchError, agentStatusCode }, { status: 502 });
	}

	return json({ state: 'generating', triggered: firstNotReady, chain: nodes }, { status: 202 });
}
