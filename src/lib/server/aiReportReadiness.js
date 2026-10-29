// AI Report readiness + staleness for the Download Report popup's 5-state button.
//
// Readiness gate (State 1 "Disabled"): a fixed set of interviews must be
// completed before a comprehensive report can be generated. Staleness
// (State 5 "Regenerate suggested"): interviews completed AFTER the latest
// report was built — i.e. present now but absent from that run's captured
// agent_input snapshot.

import { buildModuleCoverage } from './agentInput/moduleCoverage.js';
import { INTERVIEW_DISPLAY, interviewLabel } from './agentInput/knownInterviewKeys.js';
import { TEST_CODE_TO_INTERVIEW_KEY } from './agentInput/testCodeMap.js';
import { Assignment } from '../database/schemas.js';

// Product decision (2026-05-31): the five interviews shown in the design's
// readiness tooltip. Keys are agent interview keys (see agentInput/testCodeMap).
export const REQUIRED_AI_REPORT_INTERVIEWS = [
	'therapist_matching',
	'adult_biographical',
	'stressful_beliefs_index',
	'depression',
	'generalized_anxiety'
];

// Display labels come from the one table the rendered report also uses. This
// file used to keep a second, independent 17-entry copy whose fallback was the
// RAW KEY — so a newly mapped interview showed up in the tooltip as
// "obsessive_compulsive_personality". Two tables drifting is exactly the bug.
export const INTERVIEW_LABELS = INTERVIEW_DISPLAY;

const labelFor = (key) => interviewLabel(key);

/**
 * @param {string} patientId
 * @param {object|null} latestReport - most recent GenerativeReport (lean) or null
 * @returns {Promise<{
 *   readiness: { ready: boolean, required: Array<{key,label,done}>, completedCount: number, requiredCount: number },
 *   staleness: { stale: boolean, newInterviews: Array<{key,label}> }
 * }>}
 */
export async function computeReadinessAndStaleness(patientId, latestReport) {
	const { coverage } = await buildModuleCoverage(patientId);
	const administered = new Set(coverage.administered);

	const required = REQUIRED_AI_REPORT_INTERVIEWS.map((key) => ({
		key,
		label: labelFor(key),
		done: administered.has(key)
	}));
	const completedCount = required.filter((r) => r.done).length;
	const ready = completedCount === required.length;

	// Staleness: interviews the PATIENT completed after the report was built.
	//
	// Comparing today's coverage against the stored snapshot alone is not enough:
	// when twenty-nine questionnaires became mappable on 2026-08-04, `administered`
	// grew for every patient while their stored snapshots did not, so every report
	// ever generated would have flipped to "Regenerate suggested" on deploy day for
	// interviews the patient completed months earlier. A key only counts as new if
	// its assignment was actually completed after the report finished.
	let staleness = { stale: false, newInterviews: [] };
	const snapshot = latestReport?.agentInput?.interviews;
	if (snapshot && typeof snapshot === 'object') {
		const captured = new Set(Object.keys(snapshot));
		const candidates = [...administered].filter((k) => !captured.has(k));
		const newKeys = candidates.length
			? await completedAfter(patientId, candidates, latestReport?.completedAt)
			: [];
		staleness = {
			stale: newKeys.length > 0,
			newInterviews: newKeys.map((k) => ({ key: k, label: labelFor(k) }))
		};
	}

	return {
		readiness: { ready, required, completedCount, requiredCount: required.length },
		staleness
	};
}

/**
 * Of `interviewKeys`, which were completed after `reportCompletedAt`?
 *
 * A key absent from a report's snapshot can mean two different things: the
 * patient completed it later (genuinely stale) or the code could not map its
 * test_code when the report ran (not stale — nothing about the patient changed).
 * Only the first should prompt a regeneration.
 */
async function completedAfter(patientId, interviewKeys, reportCompletedAt) {
	if (!reportCompletedAt) return interviewKeys;
	const cutoff = new Date(reportCompletedAt);
	if (Number.isNaN(cutoff.getTime())) return interviewKeys;

	const wanted = new Set(interviewKeys);
	const assignments = await Assignment.find({
		patientId,
		status: { $in: ['completed', 'downloaded'] }
	})
		.populate('questionnaireId')
		.lean();

	const out = [];
	for (const a of assignments) {
		const key = TEST_CODE_TO_INTERVIEW_KEY[a.questionnaireId?.test_code];
		if (!key || !wanted.has(key) || out.includes(key)) continue;
		// No completedAt on an older assignment: treat it as pre-existing rather
		// than as a change, otherwise the ambiguity reads as "regenerate".
		if (a.completedAt && new Date(a.completedAt) > cutoff) out.push(key);
	}
	return out;
}
