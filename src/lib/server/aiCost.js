// Per-patient AI cost ledger writer (Vercel side).
//
// The redaction pipeline (`/api/anonymization/process`) is itself AI spend:
// AWS Comprehend (PII detection) + Bedrock Haiku (rewrite/discovery). That cost
// is computed inside aiProcessor.js but historically discarded — here we price
// it and fold it into User.patientProfile.aiCost, the same ledger the agent
// writes its Sonnet report cost into.
//
// Writes are atomic ($inc + $push) so they never clobber a concurrent rollup
// from psymatch-agent writing to the same User document.

import { User } from '$lib/database/schemas.js';

// Bedrock Haiku 3 on-demand, kept in sync with psymatch-agent/src/cost.ts.
// USD per 1M tokens. Comprehend $ is already computed in aiProcessor.js.
export const HAIKU_PRICING = { inputPerMTok: 0.25, outputPerMTok: 1.25 };

const round6 = (n) => Math.round(n * 1e6) / 1e6;

export function priceHaikuUsd(promptTokens = 0, completionTokens = 0) {
	const usd =
		(promptTokens / 1e6) * HAIKU_PRICING.inputPerMTok +
		(completionTokens / 1e6) * HAIKU_PRICING.outputPerMTok;
	return round6(usd);
}

/**
 * Build a `redaction_profile` ledger trace from a processWithAI() result.
 * Tolerant of missing fields — returns a zero-cost trace rather than throwing.
 *
 * @param {object} aiResults - the object returned by processWithAI()
 * @param {{ version?: number|string }} [opts]
 */
export function buildRedactionTrace(aiResults, { version } = {}) {
	const usage = aiResults?.usage?.total ?? {};
	const promptTokens = usage.prompt_tokens ?? 0;
	const completionTokens = usage.completion_tokens ?? 0;
	const haikuUsd = priceHaikuUsd(promptTokens, completionTokens);

	const prePass = aiResults?.comprehend?.prePass ?? {};
	const postPass = aiResults?.comprehend?.postPass ?? {};
	const comprehendUnits = (prePass.units ?? 0) + (postPass.units ?? 0);
	const comprehendUsd = round6((prePass.cost ?? 0) + (postPass.cost ?? 0));

	const totalUsd = round6(haikuUsd + comprehendUsd);

	return {
		source: 'redaction_profile',
		refId: `redaction_v${version ?? 'x'}_${Date.now()}`,
		totalUsd,
		breakdown: {
			bedrock: {
				model: 'haiku',
				inputTokens: promptTokens,
				outputTokens: completionTokens,
				usd: haikuUsd
			},
			comprehend: { units: comprehendUnits, usd: comprehendUsd }
		},
		at: new Date()
	};
}

/**
 * Atomically append a trace to User.patientProfile.aiCost and bump the running
 * total. Best-effort: never throws into the caller's flow.
 *
 * @param {string} patientId
 * @param {object} trace - shape from buildRedactionTrace (or equivalent)
 */
export async function addAiCostTrace(patientId, trace) {
	if (!patientId || !trace) return;
	try {
		await User.updateOne(
			{ _id: patientId },
			{
				$inc: { 'patientProfile.aiCost.totalUsd': trace.totalUsd ?? 0 },
				$push: { 'patientProfile.aiCost.traces': trace },
				$set: { 'patientProfile.aiCost.updatedAt': new Date() }
			}
		);
	} catch (err) {
		console.error('[aiCost] failed to append trace:', err?.message);
	}
}
