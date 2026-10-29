// One normalisation of stored answers for the rule engine, shared by the
// algorithmic ("standard") report and the AI report.
//
// They used to normalise differently, and the rule engine is sensitive to the
// difference: 67 comparisons across the live report logics test a response
// against a STRING-typed numerical constant (`{"type":"numerical","value":"0"}`)
// and the evaluator's `==` is JavaScript `===`. Coerce the answer to a number
// and every one of those comparisons flips to false.
//
// Measured on four real patients (2026-08-04), 13 of 117 test evaluations fired
// a DIFFERENT outcome in the two paths — including a patient whose algorithmic
// report said "meets DSM-5 criteria for a Major Depressive Episode" while the AI
// report was told the criteria were not met, and three patients positive for
// Agoraphobia in one report and negative in the other. Anorexia diverged too,
// because only the print path flattened its composite BMI answer.
//
// The algorithmic report is the reference: it is what clinicians already
// receive. So this is the print path's normalisation, quirks included, and both
// callers now use it.

/**
 * @param {Array<{questionId: string, value: unknown}>|Record<string, unknown>} responses
 *        Either the raw `Response.responses` array or an already-keyed object.
 * @param {string} [testCode]
 * @returns {Record<string, unknown>} `{ q1: <value>, q2: <value>, … }`
 */
export function normalizeRuleEngineResponses(responses, testCode) {
	const entries = Array.isArray(responses)
		? responses.map((r) => [r.questionId, r.value])
		: Object.entries(responses ?? {});

	const out = {};
	for (const [key, value] of entries) {
		// `value.value || value` — NOT `??`. A stored `{value: 0}` therefore keeps
		// the whole object rather than collapsing to 0. That is the algorithmic
		// report's behaviour and the rule logic is written against it: an object
		// fails `> 0` and fails `=== '0'`, which is how a "not at all" answer is
		// meant to score. Changing it to `??` silently re-scores every interview.
		out[key] = typeof value === 'object' && value !== null ? value.value || value : value;
	}

	// The anorexia interview stores q11 as a composite
	// {weight, weightUnit, height, standardWeight, standardHeight, bmi};
	// its report logic compares q11 against BMI thresholds.
	if (testCode === 'anorexia_test' && out.q11 && typeof out.q11 === 'object') {
		if (out.q11.bmi !== undefined) out.q11 = out.q11.bmi;
	}

	return out;
}
