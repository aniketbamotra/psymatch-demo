// The interview keys the agent-side workflow expects under `interviews.*`.
//
// Grouped by clinical family. The order inside each group is the order the
// rendered "Interviews completed" list and the Section 7 diagnostic summary walk
// them in, so it is deliberately clinical rather than alphabetical.
//
// KEEP IN SYNC with psymatch-agent/src/prompts/sectionRouting.ts — the agent's
// DIAGNOSTIC_INTERVIEW_KEYS drives which entries the `all_diagnostic_interviews`
// and `all_supported_diagnostic_interviews` routing tokens expand to. A key
// missing there is a key no section ever reads.

export const INTERVIEW_GROUPS = {
	mood: ['depression', 'persistent_depressive', 'manic_episode'],
	anxiety: [
		'generalized_anxiety',
		'social_anxiety',
		'panic',
		'agoraphobia',
		'specific_phobia',
		'illness_anxiety'
	],
	trauma_stress: ['post_traumatic_stress', 'adjustment', 'prolonged_grief'],
	obsessive_compulsive: ['obsessive_compulsive', 'body_dysmorphic'],
	substance_use: [
		'alcohol_use',
		'cannabis_use',
		'opioid_use',
		'stimulant_use',
		'sedative_hypnotic_anxiolytic_use',
		'hallucinogen_use',
		'pcp_use'
	],
	eating: ['anorexia_nervosa', 'bulimia_binge_eating', 'bulimia_nervosa', 'binge_eating'],
	neurodevelopmental: ['adult_adhd'],
	sleep: ['insomnia'],
	somatic: ['somatic_symptom'],
	dissociative: [
		'depersonalization_derealization',
		'dissociative_amnesia',
		'dissociative_identity'
	],
	psychotic: ['delusional_disorder'],
	personality: [
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
	risk: ['comprehensive_suicide_self_harm']
};

export const KNOWN_DIAGNOSTIC_INTERVIEWS = Object.values(INTERVIEW_GROUPS).flat();

export const KNOWN_SPECIAL_INTERVIEWS = [
	'adult_biographical',
	'therapist_matching',
	'stressful_beliefs_index'
];

export const ALL_KNOWN_INTERVIEW_KEYS = [
	...KNOWN_SPECIAL_INTERVIEWS,
	...KNOWN_DIAGNOSTIC_INTERVIEWS
];

/** Clinical family a diagnostic interview belongs to, or null. */
export function groupOf(interviewKey) {
	for (const [group, keys] of Object.entries(INTERVIEW_GROUPS)) {
		if (keys.includes(interviewKey)) return group;
	}
	return null;
}

// Reader-facing name for every interview key — the ONE table. The rendered
// report and the Download-Report popup both read it; they used to keep separate
// copies with different fallbacks, so a key could be labelled in one place and
// print as a raw snake_case key in the other.
export const INTERVIEW_DISPLAY = {
	adult_biographical: 'Adult Biographical',
	therapist_matching: 'Therapist Matching',
	stressful_beliefs_index: 'Stressful Beliefs Index',

	depression: 'Depression',
	persistent_depressive: 'Persistent Depressive',
	manic_episode: 'Manic Episode',

	generalized_anxiety: 'Generalized Anxiety',
	social_anxiety: 'Social Anxiety',
	panic: 'Panic',
	agoraphobia: 'Agoraphobia',
	specific_phobia: 'Specific Phobia',
	illness_anxiety: 'Illness Anxiety',

	post_traumatic_stress: 'Post-Traumatic Stress',
	adjustment: 'Adjustment',
	prolonged_grief: 'Prolonged Grief',

	obsessive_compulsive: 'Obsessive-Compulsive',
	body_dysmorphic: 'Body Dysmorphic',

	alcohol_use: 'Alcohol Use',
	cannabis_use: 'Cannabis Use',
	opioid_use: 'Opioid Use',
	stimulant_use: 'Stimulant Use',
	sedative_hypnotic_anxiolytic_use: 'Sedative, Hypnotic or Anxiolytic Use',
	hallucinogen_use: 'Hallucinogen Use',
	pcp_use: 'PCP Use',

	anorexia_nervosa: 'Anorexia Nervosa',
	bulimia_binge_eating: 'Bulimia / Binge Eating',
	bulimia_nervosa: 'Bulimia Nervosa',
	binge_eating: 'Binge Eating',

	adult_adhd: 'Adult ADHD',
	insomnia: 'Insomnia',
	somatic_symptom: 'Somatic Symptom',

	depersonalization_derealization: 'Depersonalization / Derealization',
	dissociative_amnesia: 'Dissociative Amnesia',
	dissociative_identity: 'Dissociative Identity',

	delusional_disorder: 'Delusional Disorder',

	paranoid_personality: 'Paranoid Personality',
	schizoid_personality: 'Schizoid Personality',
	schizotypal_personality: 'Schizotypal Personality',
	antisocial_personality: 'Antisocial Personality',
	borderline_personality: 'Borderline Personality',
	histrionic_personality: 'Histrionic Personality',
	narcissistic_personality: 'Narcissistic Personality',
	avoidant_personality: 'Avoidant Personality',
	dependent_personality: 'Dependent Personality',
	obsessive_compulsive_personality: 'Obsessive-Compulsive Personality',

	comprehensive_suicide_self_harm: 'Suicide & Self-Harm'
};

/** Display name for an interview key; title-cases an unknown key rather than printing it raw. */
export function interviewLabel(key) {
	return (
		INTERVIEW_DISPLAY[key] ??
		String(key || '')
			.replace(/_/g, ' ')
			.replace(/\b\w/g, (c) => c.toUpperCase())
	);
}

/** Rank used to order the rendered interview list (clinical, not alphabetical). */
const ORDER = new Map(ALL_KNOWN_INTERVIEW_KEYS.map((k, i) => [k, i]));

/**
 * Sort interview keys into clinical order. `module_coverage.administered` is
 * alphabetical for snapshot stability, which reads as a jumble once a patient
 * has completed thirty-plus interviews.
 */
export function sortInterviewKeys(keys) {
	return [...(keys ?? [])].sort(
		(a, b) =>
			(ORDER.get(a) ?? Number.MAX_SAFE_INTEGER) - (ORDER.get(b) ?? Number.MAX_SAFE_INTEGER) ||
			String(a).localeCompare(String(b))
	);
}
