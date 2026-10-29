// Maps Vercel `Questionnaire.test_code` → agent interview key.
// The agent interview key is the field name under `interviews.*` in the
// `psymatch.agent_input.v1` payload that the AI workflow consumes.
//
// EVERY questionnaire in the `questionnaires` collection must appear here.
// moduleCoverage.js skips any test_code it cannot map (`if (!interviewKey)
// continue`), so an omission is invisible: the patient answers the interview, the
// algorithmic report uses it, and the AI report silently never sees it. That is
// how insomnia, adult ADHD and the suicide module were lost, and how the other
// twenty-nine instruments below stayed out of every AI report until 2026-08-04.
//
// testCodeMap.test.js pins this map against the live collection's test_codes.

export const TEST_CODE_TO_INTERVIEW_KEY = {
	// ── Special processors (non-rule-engine) ────────────────────────────────
	ADULT_BIO: 'adult_biographical',
	THERAPIST_MATCH: 'therapist_matching',
	stressful_beliefs_index: 'stressful_beliefs_index',

	// ── Mood ────────────────────────────────────────────────────────────────
	depression_test: 'depression',
	persistent_depressive_test: 'persistent_depressive',
	manic_test: 'manic_episode',

	// ── Anxiety ─────────────────────────────────────────────────────────────
	generalized_anxiety_test: 'generalized_anxiety',
	social_anxiety_test: 'social_anxiety',
	panic_test: 'panic',
	agoraphobia_test: 'agoraphobia',
	specific_phobia_test: 'specific_phobia',
	illness_anxiety_test: 'illness_anxiety',

	// ── Trauma & stressor-related ───────────────────────────────────────────
	PTSD_test: 'post_traumatic_stress',
	adjustment_test: 'adjustment',
	prolonged_grief_disorder: 'prolonged_grief',

	// ── Obsessive-compulsive & related ──────────────────────────────────────
	ocd_test: 'obsessive_compulsive',
	body_dysmorphic_diagnostic_test: 'body_dysmorphic',

	// ── Substance use ───────────────────────────────────────────────────────
	alcohol_use_disorder_test: 'alcohol_use',
	cannabis_test: 'cannabis_use',
	opioid_use_disorder: 'opioid_use',
	stimulant_use_disorder: 'stimulant_use',
	sedative_hypnotic_anxiolytic_use_disorder: 'sedative_hypnotic_anxiolytic_use',
	hallucinogen_use_disorder: 'hallucinogen_use',
	pcp_use_disorder: 'pcp_use',

	// ── Feeding & eating ────────────────────────────────────────────────────
	anorexia_test: 'anorexia_nervosa',
	// Two instruments cover bulimia. `bulimia_interview` is the combined
	// bulimia + binge-eating interview (it can fire either diagnosis);
	// `bulimia_test` is the standalone bulimia-only one. Both exist in the
	// collection and both are administered, so both are mapped — the agent
	// de-duplicates at the DIAGNOSIS level, not the interview level.
	bulimia_interview: 'bulimia_binge_eating',
	bulimia_test: 'bulimia_nervosa',
	binge_eating_test: 'binge_eating',

	// ── Neurodevelopmental ──────────────────────────────────────────────────
	adult_adhd_test: 'adult_adhd',

	// ── Sleep ───────────────────────────────────────────────────────────────
	// NB: the questionnaire's real test_code is sleep_disorder_test — an earlier
	// entry pointed at a non-existent `insomnia_disorder_test`, which silently
	// dropped insomnia from every section that routes it (§3 §4 §6 §8 §10).
	sleep_disorder_test: 'insomnia',

	// ── Somatic ─────────────────────────────────────────────────────────────
	somatic_symptom_test: 'somatic_symptom',

	// ── Dissociative ────────────────────────────────────────────────────────
	depersonalization_test: 'depersonalization_derealization',
	dissociative_amnesia_test: 'dissociative_amnesia',
	dissociative_identity: 'dissociative_identity',

	// ── Psychotic ───────────────────────────────────────────────────────────
	delusional_disorder: 'delusional_disorder',

	// ── Personality (the "Module A/B/C" titles in Mongo) ─────────────────────
	paranoid_test: 'paranoid_personality',
	schizoid_personality_test: 'schizoid_personality',
	schizotypal_personality_disorder_test: 'schizotypal_personality',
	antisocial_personality_test: 'antisocial_personality',
	borderline_personality_test: 'borderline_personality',
	histrionic_personality_test: 'histrionic_personality',
	narcissistic_personality_test: 'narcissistic_personality',
	avoidant_personality_test: 'avoidant_personality',
	dependent_personality_disorder: 'dependent_personality',
	obsessive_compulsive_personality_test: 'obsessive_compulsive_personality',

	// ── Risk ────────────────────────────────────────────────────────────────
	// The dedicated suicide/self-harm instrument. The agent routes this key
	// straight into §6 Risk Assessment.
	suicide_interview: 'comprehensive_suicide_self_harm'
};

export const INTERVIEW_KEY_TO_TEST_CODE = Object.fromEntries(
	Object.entries(TEST_CODE_TO_INTERVIEW_KEY).map(([code, key]) => [key, code])
);
