// Principal diagnosis, chosen in code from the interviews' own verdicts so the
// comprehensive report, the concise report and the referral letter cannot
// disagree (they used to each run the Core §9.7 steps through the model, and
// the same case could come back ADHD in one and depression in another).
//
// The agent copies this choice; it does not re-run the selection. To go back to
// the model choosing (the pre-2026-10-27 behaviour), set PRINCIPAL_RULE=ai on
// the agent — this payload field is then ignored.
//
// Agreed rules, in order:
//   1. Acute safety (suicide and self-harm interview) → a confirmed depressive or
//      bipolar episode. The "attempt in the past 3 months" criterion is not used:
//      the interview records only whether an attempt ever happened.
//   2. Presenting concerns ticked in the adult biographical interview.
//   3. Severity: the interview's 0–3 score; ADHD uses the higher of its two.
//   4. Fixed order (below).
// Not handled yet, by decision: insomnia-only and residual-category rules,
// split severities other than ADHD, a missing severity (ranks lowest).

import { labelFor } from './labels.js';

/** Adult-bio `reasons_for_cct` option (English) → interviews it points at. */
export const CONCERN_INTERVIEWS = {
	Anxiety: ['generalized_anxiety', 'panic', 'social_anxiety', 'agoraphobia', 'specific_phobia'],
	'Mood/Depression': ['depression', 'persistent_depressive'],
	'Bipolar/Psychosis': ['manic_episode', 'delusional_disorder'],
	Trauma: ['post_traumatic_stress'],
	PTSD: ['post_traumatic_stress'],
	'Obsessive Compulsive': ['obsessive_compulsive'],
	'Sleep / Wake': ['insomnia'],
	'ADHD Management': ['adult_adhd'],
	'Alcohol-Related': ['alcohol_use'],
	'Drug use Related': [
		'cannabis_use',
		'opioid_use',
		'stimulant_use',
		'sedative_hypnotic_anxiolytic_use',
		'hallucinogen_use',
		'pcp_use'
	],
	'Eating/Food Intake': ['anorexia_nervosa', 'bulimia_binge_eating', 'bulimia_nervosa', 'binge_eating'],
	'Body Image': ['body_dysmorphic'],
	'Health Anxiety Related': ['illness_anxiety'],
	'Chronic Pain': ['somatic_symptom'],
	'Grief-Related': ['prolonged_grief'],
	Dissociative: ['depersonalization_derealization', 'dissociative_amnesia', 'dissociative_identity'],
	'Personality Concerns': [
		'paranoid_personality',
		'schizoid_personality',
		'schizotypal_personality',
		'antisocial_personality',
		'borderline_personality',
		'histrionic_personality',
		'narcissistic_personality',
		'avoidant_personality',
		'dependent_personality',
		'obsessive_compulsive_personality'
	],
	'General Adjustment': ['adjustment']
};

// Core §9.7 Step 4 order, extended to every interview: each added one sits next
// to its closest relative; personality last. Only makes the result repeatable —
// not a clinical ranking.
export const TIE_ORDER = [
	'manic_episode',
	'depression',
	'persistent_depressive',
	'post_traumatic_stress',
	'obsessive_compulsive',
	'body_dysmorphic',
	'panic',
	'agoraphobia',
	'generalized_anxiety',
	'social_anxiety',
	'specific_phobia',
	'illness_anxiety',
	'alcohol_use',
	'opioid_use',
	'stimulant_use',
	'cannabis_use',
	'sedative_hypnotic_anxiolytic_use',
	'hallucinogen_use',
	'pcp_use',
	'adult_adhd',
	'anorexia_nervosa',
	'bulimia_nervosa',
	'bulimia_binge_eating',
	'binge_eating',
	'prolonged_grief',
	'somatic_symptom',
	'depersonalization_derealization',
	'dissociative_amnesia',
	'dissociative_identity',
	'delusional_disorder',
	'insomnia',
	'adjustment',
	'borderline_personality',
	'antisocial_personality',
	'narcissistic_personality',
	'histrionic_personality',
	'avoidant_personality',
	'dependent_personality',
	'obsessive_compulsive_personality',
	'paranoid_personality',
	'schizotypal_personality',
	'schizoid_personality'
];

const MOOD_EPISODES = ['depression', 'persistent_depressive', 'manic_episode'];

/**
 * Core §9.7 Step 1 from the suicide interview's answers. Every scale is 1-based
 * (1 = "Not at all"/"No"/"Not really"), so "no answer" and "lowest answer" both
 * stay below each threshold.
 *   q7  intent to die ≥ 2 ("A little" — the standard's "somewhat")
 *   q3  ideation ≤ 4 (past month) AND q5 plan ≥ 3 ("Quite a bit") AND q8 means ≥ 2 ("Maybe")
 *   q25 self-harm in past 2 weeks = 2 ("Yes") AND q28 unable to stop ≥ 3 ("Frequently")
 */
export function safetyFires(r) {
	if (!r) return false;
	const n = (k) => Number(r[k]);
	return (
		n('q7') >= 2 ||
		(n('q3') >= 1 && n('q3') <= 4 && n('q5') >= 3 && n('q8') >= 2) ||
		(n('q25') === 2 && n('q28') >= 3)
	);
}

/**
 * The numeric severity on the shared 0–3 scale; split scores (ADHD) take the higher.
 * Rounded to 2 decimals: the logic's averages carry float noise (2.9999997 for a
 * true 3), which would otherwise decide ties that belong to the fixed order.
 */
export function severityScoreOf(variables) {
	const round = (n) => Math.round(n * 100) / 100;
	if (typeof variables?.Severity === 'number') return round(variables.Severity);
	const split = Object.entries(variables ?? {})
		.filter(([k, v]) => /^severity/i.test(k) && typeof v === 'number')
		.map(([, v]) => v);
	return split.length ? round(Math.max(...split)) : null;
}

const rank = (key) => {
	const i = TIE_ORDER.indexOf(key);
	return i === -1 ? TIE_ORDER.length : i;
};

/** Highest severity first; equal (or missing) severity falls to the fixed order. */
function bySeverityThenOrder(list) {
	return [...list].sort(
		(a, b) => (b.severityScore ?? -1) - (a.severityScore ?? -1) || rank(a.interviewKey) - rank(b.interviewKey)
	);
}

/**
 * @param {{
 *   candidates: Array<{ interviewKey: string, diagnosis: string, severityScore: number|null }>,
 *   concerns?: string[],          raw `reasons_for_cct` values (text or i18n keys)
 *   suicideResponses?: object|null
 * }} args  candidates = interviews whose verdict is a confirmed diagnosis
 * @returns {null | { diagnosis: string, interview_key: string, step: 1|2|3|4, statement: string }}
 */
export function selectPrincipal({ candidates, concerns = [], suicideResponses = null }) {
	if (!candidates?.length) return null;
	const done = (c, step, why) => ({
		diagnosis: c.diagnosis,
		interview_key: c.interviewKey,
		step,
		statement: `Principal diagnosis selected at Step ${step} (${STEP_NAMES[step]}): ${why}`
	});

	const mood = candidates.filter((c) => MOOD_EPISODES.includes(c.interviewKey));
	if (mood.length && safetyFires(suicideResponses)) {
		return done(
			bySeverityThenOrder(mood)[0],
			1,
			'the suicide and self-harm interview records current risk, which this mood episode owns.'
		);
	}

	const ticked = (concerns ?? []).map((v) => (labelFor(v) ?? String(v ?? '')).trim()).filter(Boolean);
	const pointed = new Set(ticked.flatMap((t) => CONCERN_INTERVIEWS[t] ?? []));
	const matched = candidates.filter((c) => pointed.has(c.interviewKey));
	const pool = matched.length ? matched : candidates;
	const ordered = bySeverityThenOrder(pool);
	const top = ordered[0];

	if (matched.length === 1) {
		const concern = ticked.find((t) => CONCERN_INTERVIEWS[t]?.includes(top.interviewKey));
		return done(top, 2, `it is the only confirmed diagnosis matching a presenting concern the patient selected ("${concern}").`);
	}
	const next = ordered[1];
	if (!next) return done(top, 3, 'it is the only confirmed diagnosis.');
	if ((top.severityScore ?? -1) > (next.severityScore ?? -1)) {
		return done(top, 3, 'it has the highest severity rating among the remaining confirmed diagnoses.');
	}
	return done(top, 4, 'severity was tied, so the fixed tie-break order was applied.');
}

const STEP_NAMES = { 1: 'Acute safety', 2: 'Presenting concerns', 3: 'Severity', 4: 'Tie-break' };
