import { getReportLogic } from '$lib/database/reportLogicSchemas.js';
import { evaluateTestExpressions } from '$lib/utils/reportLogicTransformer/utils/helpers.js';
import { renderReportSectionsText } from '$lib/utils/reportText.js';
import { normalizeRuleEngineResponses } from '$lib/utils/reportResponses.js';
import { patientInfoForRender } from './standardReport.js';
import { processTherapistMatchData } from '$lib/utils/reportGenerators/therapistMatchProcessor.js';
import { processStressfulBeliefsData } from '$lib/utils/reportGenerators/stressfulBeliefsIndexProcessor.js';
import { processAdultBioData } from '$lib/utils/reportGenerators/adultBioProcessor.js';
import { processSpecificPhobiaData } from '$lib/utils/reportGenerators/specificPhobiaProcessor.js';

// Interviews whose report is produced by a bespoke processor rather than the
// generic rule engine. Mirrors SPECIAL_TEST_PROCESSORS in the download path
// (utils/reportGenerators/index.js) — the agent must receive the SAME document
// the clinician downloads, so the two lists have to stay in step.
const SPECIAL_PROCESSORS = {
	THERAPIST_MATCH: processTherapistMatchData,
	stressful_beliefs_index: processStressfulBeliefsData,
	ADULT_BIO: processAdultBioData,
	specific_phobia_test: processSpecificPhobiaData
};

/**
 * Render one interview's COMPLETE standard report as plain text.
 *
 * WHY THIS EXISTS. The agent used to receive rule-engine internals: raw
 * qN answers (`_raw_eval`), per-item endorsement flags (`risk_relevant_items`),
 * and semantic regroupings of the same answers (`structured_result`). Product
 * decision 2026-08-24: the agent sees the standard reports and nothing else —
 * the same documents the clinician downloads, no raw values, no derived flags.
 *
 * The trigger was a scoring defect. `endorsedValue()` tested `value > 0` on
 * scales coded `1 = No`, so four self-harm denials were sent to the agent as
 * endorsements and every report asserted active self-injury for patients who
 * had denied it. Derived flags are a second source of truth that can silently
 * disagree with the report a clinician reads; this removes that class of bug by
 * removing the second source.
 *
 * `summaryOnly: false` is the whole point — `resolveFiredOutcome()` renders
 * with `summaryOnly: true`, which keeps only sections flagged `summary` and
 * returns '' for interviews (the suicide module among them) whose sections
 * carry no such flag. That is why those interviews had no `standard_report` in
 * the payload at all.
 *
 * @returns {Promise<{ text: string|null, evaluated: object|null }>} full report
 *   text (null when nothing renders) and the evaluation it came from, which the
 *   principal-diagnosis rule reads the verdict and severity off
 */
export async function renderStandardReportText({
	questionnaire,
	responses,
	patient,
	otherTestResponses = {}
}) {
	const testCode = questionnaire?.test_code;
	if (!testCode) return { text: null, evaluated: null };

	const normalized = normalizeRuleEngineResponses(responses, testCode);
	const patientInfo = patientInfoForRender(patient);
	const context = {
		_responses: normalized,
		_otherTestResponses: otherTestResponses,
		patientInfo
	};

	let evaluated;
	const special = SPECIAL_PROCESSORS[testCode];
	if (special) {
		evaluated = special(context);
	} else {
		const logic = await getReportLogic(questionnaire._id);
		if (!logic) return { text: null, evaluated: null };
		evaluated = evaluateTestExpressions(logic, context);
	}

	const outcomes = evaluated?.outcomes ?? {};
	const parts = [];
	for (const outcome of Object.values(outcomes)) {
		// An outcome whose condition did not fire contributes nothing; its
		// sections describe a branch that does not apply to this patient.
		if (!outcome?.report_sections) continue;
		if (outcome.value === 0 || outcome.value === false || outcome.value == null) continue;

		const text = renderReportSectionsText(outcome.report_sections, {
			patientInfo: evaluated?.patientInfo ?? patientInfo,
			variables: evaluated?.variables ?? {},
			summaryOnly: false,
			includeHeadings: true,
			// Therapist Matching is entirely a table; without this its whole
			// report renders as a bare heading.
			includeTables: true
		});
		if (text) parts.push(text);
	}

	const out = parts.join('\n\n').trim();
	return { text: out.length > 0 ? out : null, evaluated: evaluated ?? null };
}
