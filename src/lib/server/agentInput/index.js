import { buildPatientBlock } from './patient.js';
import { buildModuleCoverage } from './moduleCoverage.js';
import { buildAdultBiographicalEntry } from './specials/adultBiographical.js';
import { loadAllResponsesByTestCode } from './ruleEngine.js';
import { renderStandardReportText } from './standardReportText.js';
import { getTestResponsesWithMetadata } from '$lib/database/testResponses.js';
import { normalizeRuleEngineResponses } from '$lib/utils/reportResponses.js';
import { firedOutcomeOf, resolveFiredOutcome, patientInfoForRender } from './standardReport.js';
import { selectPrincipal, severityScoreOf } from './principalDiagnosis.js';

/**
 * Build the `psymatch.agent_input.v1` payload for a single patient.
 *
 * WHAT THE AGENT RECEIVES, AND WHY IT IS ONLY THIS.
 *
 * Each administered interview contributes ONE thing: the full text of its
 * standard report — the same document the clinician downloads. No raw answers,
 * no endorsement flags, no rule-engine internals, no semantic regroupings of
 * the same answers.
 *
 * Product decision 2026-08-24, prompted by a scoring defect. The payload used
 * to carry `risk_relevant_items`, whose `endorsedValue()` tested `value > 0` on
 * scales coded `1 = No`. Four self-harm DENIALS were therefore sent as
 * endorsements, and every report asserted active self-injury — with strong
 * current urges and a history requiring medical attention — for patients who
 * had denied all of it. Confirmed against production for 11294, 11501, 11508
 * and 11509; all four answered "No"/"Never"/"Not at all" to every item.
 *
 * The deeper problem was structural, not arithmetic: derived flags are a SECOND
 * source of truth that can disagree with the report a clinician reads, and when
 * they disagree the agent has no way to tell. Sending only the standard report
 * removes that class of bug by removing the second source.
 *
 * Retained because the schema requires them, and because §1 and every pronoun
 * in the report depend on them: `patient` (identification only) and
 * `module_coverage` (which interviews exist, so the agent never claims a
 * finding from an unadministered module).
 */
export async function buildAgentInput({ patientId }) {
	const { coverage, administeredAssignments } = await buildModuleCoverage(patientId);

	// Pre-load every administered test's responses once so the rule engine
	// can resolve cross-test references in a single pass per patient.
	const otherTestResponses = await loadAllResponsesByTestCode(patientId);

	const interviews = {};

	// adult_biographical still runs through its adapter FIRST, but only for its
	// `_responses` map: buildPatientBlock hoists age / marital_status / children
	// off it. Its agent-facing content is the standard report, same as the rest.
	let adultBioResponses = null;
	const bioAssignment = administeredAssignments.find((a) => a.interviewKey === 'adult_biographical');
	if (bioAssignment) {
		try {
			const entry = await buildAdultBiographicalEntry({
				assignment: bioAssignment.assignment,
				questionnaire: bioAssignment.assignment.questionnaireId
			});
			adultBioResponses = entry._responses;
		} catch (err) {
			console.error('[agentInput] adult-bio identity hoist failed:', err.message);
		}
	}

	const patient = await buildPatientBlock(patientId, adultBioResponses);

	const buildWarnings = [];
	// Inputs to the principal-diagnosis rule, collected from the same evaluation
	// that renders each standard report.
	const confirmed = [];
	let suicideResponses = null;
	let verdictFailed = false;

	for (const item of administeredAssignments) {
		const questionnaire = item.assignment.questionnaireId;
		try {
			const testResult = await getTestResponsesWithMetadata(item.assignment._id);
			const { text: standardReport, evaluated } = await renderStandardReportText({
				questionnaire,
				responses: testResult?.responses,
				patient,
				otherTestResponses
			});

			// Separate try: a verdict failure must not cost the agent this interview's report.
			try {
				if (item.interviewKey === 'comprehensive_suicide_self_harm') {
					suicideResponses = normalizeRuleEngineResponses(testResult?.responses, questionnaire?.test_code);
				}
				const verdict = resolveFiredOutcome({
					testCode: questionnaire?.test_code,
					fired: firedOutcomeOf(evaluated),
					anyCriterionFired: Object.values(evaluated?.criteria ?? {}).some((v) => v === 1),
					patientInfo: patientInfoForRender(patient),
					variables: evaluated?.variables ?? {}
				});
				if (verdict.diagnostic_status === 'supported' && verdict.diagnosis_name) {
					confirmed.push({
						interviewKey: item.interviewKey,
						diagnosis: verdict.diagnosis_name,
						severityScore: severityScoreOf(evaluated?.variables)
					});
				}
			} catch (err) {
				verdictFailed = true;
				buildWarnings.push({
					interview_key: item.interviewKey,
					error: `verdict for principal selection failed: ${err.message}`
				});
			}

			// An interview that renders nothing would be INVISIBLE to the agent
			// while still counting as administered in module_coverage — the report
			// would omit a completed interview with no trace. Surface it instead.
			if (!standardReport) {
				buildWarnings.push({
					interview_key: item.interviewKey,
					error: `standard report rendered empty for test_code=${questionnaire?.test_code}; the agent will not see this interview`
				});
			}

			interviews[item.interviewKey] = {
				interview_name: item.interviewKey,
				administered: true,
				// Object with `summary`, not a bare string: the agent reads
				// `standard_report.summary` in caseContextBrief and the workflow
				// label helpers. A string here would silently read as undefined
				// and the brief would lose every interview.
				//
				// Unlike the old value this is the COMPLETE report, not a capped
				// brief summary — no SUMMARY_CHAR_CAP truncation.
				standard_report: standardReport ? { summary: standardReport } : null
			};
		} catch (err) {
			verdictFailed = true;
			buildWarnings.push({
				interview_key: item.interviewKey,
				error: `standard report render failed for test_code=${questionnaire?.test_code}: ${err.message}`
			});
			interviews[item.interviewKey] = {
				interview_name: item.interviewKey,
				administered: true,
				standard_report: null
			};
		}
	}

	// A missing verdict could drop the true principal from the candidates, so then
	// the agent chooses as before rather than trusting an incomplete list.
	let principalSelection = null;
	if (!verdictFailed) try {
		principalSelection = selectPrincipal({
			candidates: confirmed,
			concerns: adultBioResponses?.reasons_for_cct,
			suicideResponses
		});
	} catch (err) {
		buildWarnings.push({ interview_key: null, error: `principal selection failed: ${err.message}` });
	}

	return {
		schema_version: 'psymatch.agent_input.v1',
		dataset_id: 'psymatch_live',
		source_metadata: {
			source_system: 'psymatch-vercel',
			source_format: 'live_mongo'
		},
		// Internal tracing key (never rendered). Normally the FileMaker id; falls
		// back to the internal id only so a patient without a fileMakerId still
		// gets a unique case_id.
		case_id: `case_${patient.patient_id || patientId}`,
		source_file: null,
		report_request: {
			report_standard: 'PsyMatch V2.16',
			report_type: 'comprehensive',
			language: 'en'
		},
		patient,
		module_coverage: coverage,
		interviews,
		// The principal diagnosis every document must use (see principalDiagnosis.js).
		// Absent when nothing is confirmed; the agent then falls back to the model.
		...(principalSelection && { principal_selection: principalSelection }),
		// `risk_summary` and `clinical_resolution` are deliberately absent. Both
		// were computed from raw answers — risk_summary from the endorsement
		// flags that inverted every self-harm denial, clinical_resolution from
		// per-interview diagnostic_output that no longer exists. The standard
		// reports state their own findings; nothing re-derives them here.
		...(buildWarnings.length && { build_warnings: buildWarnings })
	};
}

/**
 * The patient's primary physician as typed in the adult biographical form
 * (`family_doctor`), raw. For the standalone referral letter's addressee
 * (standard §2.1); the interview payload itself carries only the standard report.
 * @param {{ patientId: string }} args
 * @returns {Promise<string | null>}
 */
export async function loadFamilyDoctor({ patientId }) {
	const { administeredAssignments } = await buildModuleCoverage(patientId);
	const bio = administeredAssignments.find((a) => a.interviewKey === 'adult_biographical');
	if (!bio) return null;
	const entry = await buildAdultBiographicalEntry({
		assignment: bio.assignment,
		questionnaire: bio.assignment.questionnaireId
	});
	return entry._responses?.family_doctor ?? null;
}
