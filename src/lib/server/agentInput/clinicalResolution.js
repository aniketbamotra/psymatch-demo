// Reconcile the per-interview verdicts into a diagnosis list a clinician can
// read, before the payload is handed to the agent.
//
// Each interview's report logic evaluates in isolation — it cannot see what the
// other forty-five said. That was survivable while fourteen interviews reached
// the AI report; with all of them wired, a real patient produced nine supported
// diagnoses including three personality-disorder screens that all resolve to the
// same ICD-11 code, two instruments asserting the same eating disorder, and a
// persistent depressive disorder standing beside a supported manic episode —
// a pair DSM-5 forbids.
//
// Section 7's count validator makes this more than cosmetic: it requires exactly
// one card per supported candidate, so two interviews asserting one disorder is
// an unsatisfiable constraint, not a duplicated line.
//
// The rules below were agreed with the product owner on 2026-08-04. Every
// demotion is recorded on the interview it demotes (`resolution`), never
// silently dropped, so the reason can be printed in Section 7's ruled-out
// narrative and audited afterwards.

import { INTERVIEW_GROUPS } from './knownInterviewKeys.js';

const PERSONALITY_KEYS = new Set(INTERVIEW_GROUPS.personality);

// ICD-11 personality severity grades, least to most severe.
const PD_SEVERITY_ORDER = ['6D10.0', '6D10.1', '6D10.2'];

// Instrument precedence when two interviews assert the SAME disorder. The
// combined bulimia+binge-eating interview is the more specific instrument (it
// asks the differentiating questions), so it wins over the two single-disorder
// screens.
const INSTRUMENT_PRECEDENCE = [
	'bulimia_binge_eating',
	'bulimia_nervosa',
	'binge_eating',
	'depression',
	'persistent_depressive'
];

function precedenceOf(interviewKey) {
	const i = INSTRUMENT_PRECEDENCE.indexOf(interviewKey);
	return i === -1 ? INSTRUMENT_PRECEDENCE.length : i;
}

function statusOf(entry) {
	return entry?.diagnostic_output?.diagnostic_status ?? null;
}

function isSupported(entry) {
	return statusOf(entry) === 'supported';
}

/** Demote a supported entry to ruled-out, recording why. */
function demote(entry, rule, reason) {
	if (!entry?.diagnostic_output) return;
	entry.diagnostic_output.diagnostic_status = 'not_supported';
	entry.diagnostic_output.symptoms = [];
	entry.resolution = { demoted_by: rule, reason };
}

/**
 * One card per distinct disorder.
 *
 * When two interviews assert the same diagnosis the more specific instrument
 * keeps the card and the others are recorded on it as corroborating, so Section
 * 7 can say "confirmed across two instruments" without printing the disorder
 * twice under the same DSM code.
 */
function dedupeByDiagnosis(interviews) {
	/** @type {Map<string, string[]>} */
	const byName = new Map();
	for (const [key, entry] of Object.entries(interviews)) {
		if (!isSupported(entry)) continue;
		const name = entry.diagnostic_output.diagnosis_name;
		if (!name) continue;
		if (!byName.has(name)) byName.set(name, []);
		byName.get(name).push(key);
	}

	for (const [name, keys] of byName) {
		if (keys.length < 2) continue;
		const ordered = [...keys].sort((a, b) => precedenceOf(a) - precedenceOf(b));
		const [winner, ...rest] = ordered;
		interviews[winner].diagnostic_output.corroborated_by = rest;
		for (const loser of rest) {
			demote(
				interviews[loser],
				'duplicate_diagnosis',
				`${name} is reported from the ${winner.replace(/_/g, ' ')} interview, the more specific instrument for this disorder; this module corroborates the same finding rather than adding a second diagnosis.`
			);
		}
	}
}

/**
 * Collapse concurrent personality-disorder screens into one entry.
 *
 * The ten personality modules are 9-17 item self-report screens with no DSM
 * exclusion criteria, and ICD-11 codes personality as a single disorder graded
 * 6D10.0/.1/.2 with trait qualifiers — which is why five positive screens
 * produce five cards carrying the same code. One entry, graded at the most
 * severe grade returned, with the individual modules carried as trait features.
 *
 * A single positive screen keeps its own name and its own DSM code; there is
 * nothing to reconcile.
 */
function collapsePersonalityDisorders(interviews) {
	const positive = Object.entries(interviews).filter(
		([key, entry]) => PERSONALITY_KEYS.has(key) && isSupported(entry)
	);
	if (positive.length < 2) return;

	const gradeIndex = (entry) =>
		PD_SEVERITY_ORDER.indexOf(entry.diagnostic_output.icd_11_code ?? '');
	const ordered = [...positive].sort((a, b) => gradeIndex(b[1]) - gradeIndex(a[1]));
	const [carrierKey, carrier] = ordered[0];

	const featureOf = (entry) =>
		`prominent ${String(entry.diagnostic_output.diagnosis_name ?? '')
			.replace(/\s*Personality Disorder\s*$/i, '')
			.trim()
			.toLowerCase()} features`;

	const modifiers = ordered.map(([, entry]) => featureOf(entry)).filter(Boolean);
	const gradedCode = ordered.map(([, e]) => e.diagnostic_output.icd_11_code).find(Boolean) ?? null;

	carrier.diagnostic_output.diagnosis_name = 'Personality Disorder';
	carrier.diagnostic_output.icd_11_code = gradedCode;
	// DSM-5-TR has no code for a mixed personality presentation, and inventing
	// one would contradict the algorithmic report. The renderer prints the
	// "not supplied in case materials" sentinel here by design.
	carrier.diagnostic_output.dsm_code = null;
	carrier.diagnostic_output.icd_10_code = null;
	carrier.diagnostic_output.modifiers = modifiers;
	carrier.diagnostic_output.instrument_class = 'screening';
	carrier.resolution = {
		merged_by: 'personality_collapse',
		merged_from: ordered.map(([k]) => k),
		reason:
			'Multiple personality modules screened positive. ICD-11 codes personality as one disorder graded by severity with trait qualifiers, so they are reported as a single screening-level finding rather than several co-occurring disorders.'
	};

	for (const [key, entry] of ordered.slice(1)) {
		demote(
			entry,
			'personality_collapse',
			`Reported within the combined personality finding on the ${carrierKey.replace(/_/g, ' ')} module as ${featureOf(entry)}.`
		);
	}
}

/**
 * DSM-5 excludes a persistent depressive disorder — and a major depressive
 * disorder — whose depressive episodes occur in someone with a manic or
 * hypomanic history; the presentation is bipolar. Each interview evaluates
 * alone and cannot see the manic module, so both can be supported at once.
 *
 * Applied to the AI report only. The algorithmic report is generated from the
 * unmodified report logic and is deliberately left alone.
 */
const DEPRESSIVE_EXCLUDED_BY_MANIA = ['persistent_depressive', 'depression'];

function applyBipolarExclusion(interviews) {
	if (!isSupported(interviews.manic_episode)) return;
	const manicName = interviews.manic_episode.diagnostic_output.diagnosis_name ?? 'a manic episode';

	for (const key of DEPRESSIVE_EXCLUDED_BY_MANIA) {
		if (!isSupported(interviews[key])) continue;
		const name = interviews[key].diagnostic_output.diagnosis_name ?? key;
		demote(
			interviews[key],
			'excluded_by_manic_history',
			`${name} is excluded because ${manicName} is supported: DSM-5 places depressive episodes occurring in a patient with a manic or hypomanic history within the bipolar spectrum.`
		);
	}
}

/**
 * Apply the whole reconciliation, in order. Mutates and returns `interviews`.
 *
 * Order matters: exclusions run before de-duplication so a demoted diagnosis
 * cannot win a duplicate contest, and the personality collapse runs last
 * because it rewrites the surviving entry's identity.
 *
 * @returns {{ applied: Array<{interview_key: string, kind: 'demoted'|'merged', rule: string, reason: string}> }}
 *          audit trail, mirrored into the payload as `clinical_resolution` so
 *          Section 7 can state the reason a finding is not listed as its own
 *          diagnosis rather than leaving it unexplained
 */
export function applyClinicalResolution(interviews) {
	applyBipolarExclusion(interviews);
	dedupeByDiagnosis(interviews);
	collapsePersonalityDisorders(interviews);

	const applied = [];
	for (const [key, entry] of Object.entries(interviews)) {
		const r = entry?.resolution;
		if (!r) continue;
		applied.push({
			interview_key: key,
			kind: r.demoted_by ? 'demoted' : 'merged',
			rule: r.demoted_by ?? r.merged_by,
			reason: r.reason
		});
	}
	return { applied };
}
