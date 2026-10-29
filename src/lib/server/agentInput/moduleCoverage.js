import { Assignment } from '../../database/schemas.js';
import { TEST_CODE_TO_INTERVIEW_KEY } from './testCodeMap.js';
import { ALL_KNOWN_INTERVIEW_KEYS } from './knownInterviewKeys.js';

const COMPLETED_STATUSES = new Set(['completed', 'downloaded']);

/**
 * Build the module_coverage block of the agent_input.v1 payload.
 *
 * Walks every known interview key the agent expects and classifies it
 * relative to this patient's Assignment records:
 *   - administered:     assignment exists AND status ∈ {completed, downloaded}
 *   - not_administered: assignment exists with any other status, OR no assignment
 *   - unknown:          reserved; we always classify, so this stays empty
 *
 * Returned shape matches the V2.16 standard sample.
 *
 * @param {string} patientId
 * @returns {Promise<{
 *   coverage: { administered: string[], not_administered: string[], unknown: string[] },
 *   administeredAssignments: Array<{ assignment: object, interviewKey: string, testCode: string }>
 * }>}
 */
export async function buildModuleCoverage(patientId) {
	const assignments = await Assignment.find({ patientId })
		.populate('questionnaireId')
		.lean();

	const administered = new Set();
	const notAdministered = new Set();
	const administeredAssignments = [];

	for (const assignment of assignments) {
		const questionnaire = assignment.questionnaireId;
		if (!questionnaire || !questionnaire.test_code) continue;
		const interviewKey = TEST_CODE_TO_INTERVIEW_KEY[questionnaire.test_code];
		if (!interviewKey) continue; // a questionnaire we don't yet map

		if (COMPLETED_STATUSES.has(assignment.status)) {
			administered.add(interviewKey);
			administeredAssignments.push({
				assignment,
				interviewKey,
				testCode: questionnaire.test_code
			});
		} else {
			// assigned but not completed → still in progress; from the agent's
			// perspective it's "not_administered" (no data to work with)
			notAdministered.add(interviewKey);
		}
	}

	// Any known key with no Assignment at all is also not_administered.
	for (const key of ALL_KNOWN_INTERVIEW_KEYS) {
		if (!administered.has(key) && !notAdministered.has(key)) {
			notAdministered.add(key);
		}
	}

	// Stable, alphabetical ordering so snapshots are deterministic.
	const sortedArr = (s) => [...s].sort();

	return {
		coverage: {
			administered: sortedArr(administered),
			not_administered: sortedArr(notAdministered),
			unknown: []
		},
		administeredAssignments
	};
}
