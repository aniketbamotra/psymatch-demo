// Diagnostic codes belong in a structured field, not in prose.
//
// The questionnaire corpus writes its verdict sentences with the codes inline —
// 98 of the 590 authored `report_sections` text blocks look like:
//
//   "{first_name} meets DSM-5 diagnosis for Body Dysmorphic Disorder 300.07
//    (F45.22) ICD11: (6B21)."
//
// That sentence is handed to the report agent as `standard_report.summary`, the
// ground truth it is told to quote when explaining why a finding landed where it
// did. So the codes travelled straight into the narrative sections, and the AI
// report came back with lines like "…placing the finding subthreshold for PTSD
// (DSM-5-TR 309.81 / ICD-11 6B40)". Clinical review on 2026-08-09 asked for the
// codes out of the narrative entirely; they stay on the Section 7 diagnosis
// cards, where the code IS the field.
//
// Stripping here — where the payload is built, after `resolveFiredOutcome` has
// already lifted the codes into `diagnostic_output.dsm_code` / `.icd_11_code` —
// removes the temptation at source rather than asking the model to resist it.
// No information is lost: the same codes reach the agent as structured fields.

// A 3-digit DSM/ICD-9-CM code (300.07, 307.1). The lookahead keeps real
// quantities out of it: an anorexia summary can legitimately carry a weight of
// "105.5 lbs", which matches the digits exactly.
const DSM_NUMERIC = /\b\d{3}\.\d{1,2}\b(?!\s*(?:kg|lbs?|lb|mg|mcg|ml|cm|mm|%|pounds?|kilograms?))/g;
// ICD-10 alpha codes: F45.22, F60.31, F90.2, and the bare chapter form F41.
// Deliberately limited to the F chapter — every mental-disorder ICD-10 code is
// an F code, and widening it to any letter would eat "B12" out of a sentence
// about a vitamin deficiency.
const ICD10_ALPHA = /\bF\d{2}(?:\.\d{1,3})?\b/g;
// ICD-11 stem codes: 6B21, 6A60, 6D10.1, 7A00.
const ICD11 = /\b\d[A-Z]\d[0-9A-Z](?:\.\d{1,2})?\b/g;

// Any of the three, optionally wrapped in brackets: "(F45.22)", "[6B21]".
const ANY_CODE = `(?:${[DSM_NUMERIC, ICD10_ALPHA, ICD11].map((r) => r.source).join('|')})`;
const BRACKETED_CODE = new RegExp(`[([{]?\\s*${ANY_CODE}\\s*[)\\]}]?`, 'g');

// A manual label together with the code it introduces: "ICD11: (6B21)",
// "CIM-11 : 6B21", "DSM-5-TR 309.81". Removed as ONE unit and BEFORE the bare
// codes, because removing the code first leaves the label stranded — a real
// corpus sentence reads "…Disorder 300.6 (F48.1) ICD11: (6B66) Average symptom
// severity was Moderate", and stripping only the codes leaves "ICD11:" sitting
// mid-sentence with nothing after it.
//
// Requiring a code after the label is what keeps "meets DSM-5 criteria for OCD"
// intact: there, the label is followed by a word, so this does not match.
const LABELLED_CODE = new RegExp(
	`\\b(?:DSM(?:-5)?(?:-TR)?|ICD-?1[01]|CIM-?1[01])\\s*[:\u{FF1A}]?\\s*[([{]?\\s*${ANY_CODE}\\s*[)\\]}]?`,
	'gu',
);

// Bracket pairs whose contents are now gone.
const EMPTY_BRACKETS = /\s*[([{]\s*[)\]}]/g;
// A label left with nothing but punctuation or end-of-string after it — the
// corpus has "…Borderline Personality Disorder (301.83) (F60.31) ICD11: " with
// the code simply missing.
const DANGLING_LABEL =
	/\s*\b(?:DSM(?:-5)?(?:-TR)?|ICD-?1[01]|CIM-?1[01])\s*[:\u{FF1A}]?\s*(?=[,.;)\]}]|$)/gu;

/**
 * Remove diagnostic codes from a sentence of clinical prose, leaving the
 * sentence readable.
 *
 * Only codes go: the manual's *name* is ordinary clinical writing and stays, so
 * "meets DSM-5 criteria for Anorexia Nervosa 307.1 (F50.01) ICD11: (6B80)"
 * becomes "meets DSM-5 criteria for Anorexia Nervosa".
 *
 * @param {unknown} text
 * @returns {string} the input unchanged when it carries no codes
 */
export function stripDiagnosticCodes(text) {
	if (typeof text !== 'string' || !text) return typeof text === 'string' ? text : '';

	// Label-plus-code first, then whatever codes stand on their own.
	let out = text.replace(LABELLED_CODE, '').replace(BRACKETED_CODE, '');
	if (out === text) return text;

	out = out.replace(EMPTY_BRACKETS, '').replace(DANGLING_LABEL, '');

	// Tidy the gaps the removals leave: runs of spaces, a space before closing
	// punctuation, a stranded separator between two removed codes, and the
	// doubled full stop from a sentence that already ended before its code
	// ("…for Adjustment Disorder. 309.28(F43.23) ICD11: (6B43).").
	return out
		.replace(/[ \t]{2,}/g, ' ')
		.replace(/\s+([,.;:!?)\]}])/g, '$1')
		.replace(/([([{])\s+/g, '$1')
		.replace(/\s+\/\s*(?=[,.;]|$)/g, '')
		.replace(/([.!?])[ \t]*[.]+/g, '$1')
		.replace(/[ \t]+$/gm, '')
		.trim();
}
