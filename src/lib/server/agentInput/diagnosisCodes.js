// Central lookup: outcome.type (the diagnosis label the rule-engine emits)
// → DSM-5-TR + ICD-11 codes. Used by ruleEngine.js so the agent never has
// to invent codes for Section 6 of the V2.16 report.
//
// Authored from the published DSM/ICD code references. If you add a new
// outcome to a test's report logic, add the matching codes here.

export const DIAGNOSIS_CODES = {
	// Depression
	'Major Depressive Disorder': { dsm_code: '296.32', icd_11_code: '6A71' },
	'Major Depressive Episode': { dsm_code: '296.32', icd_11_code: '6A71' },
	'Persistent Depressive Disorder': { dsm_code: '300.4', icd_11_code: '6A72' },

	// Anxiety spectrum
	'Generalized Anxiety Disorder': { dsm_code: '300.02', icd_11_code: '6B00' },
	'Social Anxiety Disorder': { dsm_code: '300.23', icd_11_code: '6B04' },
	'Panic Disorder': { dsm_code: '300.01', icd_11_code: '6B01' },
	Agoraphobia: { dsm_code: '300.22', icd_11_code: '6B02' },

	// Mood / manic
	'Manic Episode': { dsm_code: '296.40', icd_11_code: '6A60' },
	'Hypomanic Episode': { dsm_code: '296.40', icd_11_code: '6A60' },
	'Bipolar I Disorder': { dsm_code: '296.40', icd_11_code: '6A60' },
	'Bipolar II Disorder': { dsm_code: '296.89', icd_11_code: '6A61' },

	// Trauma / stressor-related
	'Posttraumatic Stress Disorder': { dsm_code: '309.81', icd_11_code: '6B40' },
	'Post-Traumatic Stress Disorder': { dsm_code: '309.81', icd_11_code: '6B40' },

	// Obsessive-compulsive
	'Obsessive-Compulsive Disorder': { dsm_code: '300.3', icd_11_code: '6B20' },

	// Substance use
	'Alcohol Use Disorder': { dsm_code: '303.90', icd_11_code: '6C40.2' },

	// Eating
	'Anorexia Nervosa': { dsm_code: '307.1', icd_11_code: '6B80' },
	'Bulimia Nervosa': { dsm_code: '307.51', icd_11_code: '6B81' },
	'Binge-Eating Disorder': { dsm_code: '307.51', icd_11_code: '6B82' },

	// Sleep
	'Insomnia Disorder': { dsm_code: '780.52', icd_11_code: '7A00' },

	// Neurodevelopmental
	'Attention-Deficit/Hyperactivity Disorder': { dsm_code: '314.01', icd_11_code: '6A05' }
};

export function codesFor(diagnosisName) {
	if (!diagnosisName) return { dsm_code: null, icd_11_code: null };
	return DIAGNOSIS_CODES[diagnosisName] ?? { dsm_code: null, icd_11_code: null };
}

// Canonical diagnosis label per test_code. Outcome labels emitted by
// the rule engine can be branch-specific (e.g. "Depression Negative A");
// this table gives us a clean disorder name to pair with DSM/ICD codes
// regardless of which branch fired.
export const TEST_CODE_TO_DIAGNOSIS = {
	depression_test: 'Major Depressive Disorder',
	persistent_depressive_test: 'Persistent Depressive Disorder',
	generalized_anxiety_test: 'Generalized Anxiety Disorder',
	panic_test: 'Panic Disorder',
	social_anxiety_test: 'Social Anxiety Disorder',
	manic_test: 'Manic Episode',
	ocd_test: 'Obsessive-Compulsive Disorder',
	agoraphobia_test: 'Agoraphobia',
	alcohol_use_disorder_test: 'Alcohol Use Disorder',
	sleep_disorder_test: 'Insomnia Disorder',
	anorexia_test: 'Anorexia Nervosa',
	bulimia_interview: 'Bulimia Nervosa',
	PTSD_test: 'Posttraumatic Stress Disorder',
	adult_adhd_test: 'Attention-Deficit/Hyperactivity Disorder'
	// suicide_interview deliberately absent: it feeds §6 Risk Assessment and
	// has no codeable disorder label — codesFor(null) correctly yields nulls.
};

export function diagnosisNameFor(testCode) {
	return TEST_CODE_TO_DIAGNOSIS[testCode] ?? null;
}
