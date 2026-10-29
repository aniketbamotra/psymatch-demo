// Turn a fired rule-engine outcome into the same statement the algorithmic
// ("standard") report prints, plus the structured facts the AI report needs.
//
// Why this exists: the AI report used to describe a test's result from a
// hand-maintained table keyed by test_code. That table could only ever hold ONE
// diagnosis per test, so `manic_test` reported "Manic Episode" whether the
// engine fired Bipolar I, Bipolar II or a Hypomanic Episode, and
// `bulimia_interview` reported "Bulimia Nervosa" even when the branch that fired
// was Binge Eating Disorder. It also carried a single fixed code per disorder,
// while the algorithmic report resolves the code from the patient's own severity
// (depression 296.21…296.33, alcohol 303.00 vs 303.90, the personality modules'
// 6D10.x grade). The two reports therefore disagreed on the same patient.
//
// Everything here is derived from the interview's OWN report logic, so the AI
// report and the algorithmic report state the same disorder with the same codes.

import { OUTCOME_CATALOG, CORPUS_CODES } from './outcomeCatalog.js';
import { DIAGNOSIS_CODES } from './diagnosisCodes.js';
import { renderReportSectionsText } from '../../utils/reportText.js';

// The standard report keys its pronoun table off a capitalised gender token.
const GENDER_TOKEN = { male: 'He', female: 'She', 'non-binary': 'They', other: 'They' };

/** Map a patient block onto the `patientInfo` the report-text helpers expect. */
export function patientInfoForRender(patient) {
	const gender = String(patient?.gender ?? '').toLowerCase();
	return {
		firstName:
			patient?.first_name ||
			String(patient?.name ?? '')
				.trim()
				.split(/\s+/)[0] ||
			'',
		gender: GENDER_TOKEN[gender] ?? 'They'
	};
}

// ── Code parsing over the RENDERED statement ─────────────────────────────────
// Only consulted for branches the catalog marks `graded` — i.e. branches whose
// codes are chosen at run time. For every other branch the catalog's fixed
// prose is authoritative and parsing could only introduce noise.
const DSM_RE = /\b(\d{3}(?:\.\d{1,2})?)\s*[(x]/;
const DSM_LOOSE_RE = /\b(\d{3}\.\d{1,2})\b/;
const ICD10_RE = /\(([FGZ]\d{2}(?:\.\d+)?)\)/;
const ICD11_RE = /ICD[-\s]?11\s*:?\s*\(?([0-9][A-Z][A-Z0-9]*(?:\.\d+)?)\)?/i;

function parseCodes(text) {
	if (!text) return { dsm: null, icd10: null, icd11: null };
	return {
		dsm: (DSM_RE.exec(text) ?? DSM_LOOSE_RE.exec(text))?.[1] ?? null,
		icd10: ICD10_RE.exec(text)?.[1] ?? null,
		icd11: ICD11_RE.exec(text)?.[1] ?? null
	};
}

/**
 * Which outcome fired? The evaluator returns as soon as one does, so at most
 * one entry in `outcomes` has value === 1.
 */
export function firedOutcomeOf(evalResult) {
	for (const [type, result] of Object.entries(evalResult?.outcomes ?? {})) {
		if (result && result.value === 1) return { type, ...result };
	}
	return null;
}

/**
 * Resolve what a fired outcome asserts.
 *
 * @param {object} args
 * @param {string} args.testCode
 * @param {{type: string, report_sections?: Array<object>}|null} args.fired
 * @param {boolean} args.anyCriterionFired   at least one criterion evaluated to 1
 * @param {object} args.patientInfo          {firstName, gender} for placeholders
 * @param {object} args.variables            evaluated variables + raw responses
 * @param {number} [args.maxSummaryChars=700]
 * @returns {{
 *   diagnosis_name: string|null,
 *   diagnostic_status: 'supported'|'subthreshold'|'not_supported',
 *   outcome_label: string|null,
 *   dsm_code: string|null,
 *   icd_10_code: string|null,
 *   icd_11_code: string|null,
 *   summary: string,
 *   catalogued: boolean
 * }}
 */
export function resolveFiredOutcome({
	testCode,
	fired,
	anyCriterionFired,
	patientInfo,
	variables,
	maxSummaryChars = 700
}) {
	const label = fired?.type ?? null;
	const entry = label ? (OUTCOME_CATALOG[testCode]?.[label] ?? null) : null;

	const summary = fired?.report_sections
		? renderReportSectionsText(fired.report_sections, {
				patientInfo,
				variables,
				summaryOnly: true,
				maxChars: maxSummaryChars
			})
		: '';

	// No branch fired at all: the patient's answers fell through every outcome in
	// the report logic, so the algorithmic report prints nothing for this
	// interview and neither may we. 'inconclusive' is NOT 'ruled out' — calling it
	// not_supported would put a disorder into Section 7's ruled-out narrative that
	// the instrument never actually ruled out.
	if (!label) {
		return {
			diagnosis_name: null,
			polarity: 'inconclusive',
			diagnostic_status: null,
			outcome_label: null,
			dsm_code: null,
			icd_10_code: null,
			icd_11_code: null,
			summary: '',
			catalogued: false
		};
	}

	// Polarity. The catalog is authoritative; it was derived from this branch's
	// own prose. Only a branch the catalog has never seen falls back to reading
	// the label, which is exactly how "Alcohol never used" and
	// "PCP Use Disorder - No Use Reported" used to score as supported diagnoses.
	const polarity = entry?.polarity ?? polarityFromLabel(label, summary);

	// "…reports that she has never consumed hallucinogens" is a ruled-OUT
	// substance, never a subthreshold one, however the criteria happened to score.
	const neverUsed = NEVER_USED.test(summary) || NEVER_USED.test(label ?? '');

	let diagnostic_status;
	if (polarity === 'positive') diagnostic_status = 'supported';
	else if (neverUsed) diagnostic_status = 'not_supported';
	else diagnostic_status = anyCriterionFired ? 'subthreshold' : 'not_supported';

	const diagnosis_name = entry ? entry.diagnosis : null;

	const parsed = entry?.graded ? parseCodes(summary) : { dsm: null, icd10: null, icd11: null };
	const hand = diagnosis_name ? (DIAGNOSIS_CODES[diagnosis_name] ?? {}) : {};
	const corpus = diagnosis_name ? (CORPUS_CODES[diagnosis_name] ?? {}) : {};

	return {
		diagnosis_name,
		// 'none' marks an instrument that returns no diagnostic verdict at all —
		// the Stressful Beliefs Index and the suicide module. Callers omit
		// diagnostic_output entirely for those rather than publishing a
		// not_supported verdict against a disorder that was never assessed.
		polarity,
		diagnostic_status,
		outcome_label: label,
		dsm_code: parsed.dsm ?? entry?.dsm ?? hand.dsm_code ?? corpus.dsm ?? null,
		icd_10_code: parsed.icd10 ?? entry?.icd10 ?? corpus.icd10 ?? null,
		icd_11_code: parsed.icd11 ?? entry?.icd11 ?? hand.icd_11_code ?? corpus.icd11 ?? null,
		summary,
		catalogued: !!entry
	};
}

const NEVER_USED = /\bnever (?:consumed|used)\b|\bno use reported\b/i;

// Last-resort classification for an outcome the catalog does not know — a branch
// added to a report logic after the catalog was last generated. Reads the
// rendered statement first (it says "meets"/"fails to meet" in plain words) and
// only then the label.
function polarityFromLabel(label, summary) {
	const NEG =
		/\b(fail(?:s|ed)? to meet|does not meet|do not meet|did not meet|never (?:consumed|used))\b/i;
	const POS = /\bmeets?\b\s+(?:the\s+)?(?:DSM|diagnostic|criteria)/i;
	if (summary) {
		if (NEG.test(summary)) return 'negative';
		if (POS.test(summary)) return 'positive';
	}
	if (!label) return 'negative';
	if (/negative|never used|no use reported/i.test(label)) return 'negative';
	if (/positive/i.test(label)) return 'positive';
	// Unknown shape: refuse to assert a diagnosis on a guess.
	return 'negative';
}
