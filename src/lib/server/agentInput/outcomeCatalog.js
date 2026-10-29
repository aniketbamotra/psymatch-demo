// GENERATED FILE — do not edit by hand.
// Regenerate with:  npx vite-node scripts/generate-outcome-catalog.mjs
//
// What a fired rule-engine outcome MEANS, derived from the clinician-authored
// prose each questionnaire's report logic already carries. Keyed
// test_code -> outcome.type.
//
//   diagnosis  canonical disorder name for that branch
//   polarity   'positive'  the branch asserts the diagnosis
//              'negative'  the branch rules it out (or the substance was never used)
//              'none'      not a diagnostic verdict (SBI, suicide module)
//   dsm/icd10/icd11
//              codes stated in that branch's fixed prose. Read ONLY from the
//              summary text blocks, never from a single_word list — a single_word
//              list is a run-time CHOICE between codes (alcohol 303.00 vs 303.90,
//              depression 296.21…296.33, bipolar I 296.41…296.53, the personality
//              modules' 6D10.x severity grade, PTSD vs Complex PTSD, anorexia's
//              subtype), so baking one in would contradict the algorithmic report.
//   graded     true when this branch resolves at least one code at run time.
//              resolveFiredOutcome() then prefers the codes it parses out of the
//              RENDERED summary line, which is the same string the algorithmic
//              report prints. null + graded means "wait for the render"; null
//              without graded means the instrument genuinely states no code.
//
// Coverage at generation time: 132 outcomes across 44 questionnaires.

export const OUTCOME_CATALOG = {
	// Adjustment Interview
	"adjustment_test": {
		"Adjustment_Disorder_Positive": { diagnosis: "Adjustment Disorder", polarity: "positive", dsm: null, icd10: null, icd11: "6B43", graded: true },
		"Adjustment_Disorder_Negative_A1_No_Stressor": { diagnosis: "Adjustment Disorder", polarity: "negative", dsm: null, icd10: null, icd11: "6B43", graded: true },
		"Adjustment_Disorder_Negative_A2_Timing": { diagnosis: "Adjustment Disorder", polarity: "negative", dsm: null, icd10: null, icd11: "6B43", graded: true },
		"Adjustment_Disorder_Negative_B": { diagnosis: "Adjustment Disorder", polarity: "negative", dsm: null, icd10: null, icd11: "6B43", graded: true },
		"Adjustment_Disorder_Negative_C": { diagnosis: "Adjustment Disorder", polarity: "negative", dsm: null, icd10: null, icd11: "6B43", graded: true },
		"Adjustment_Disorder_Negative_D": { diagnosis: "Adjustment Disorder", polarity: "negative", dsm: null, icd10: null, icd11: "6B43", graded: true },
		"Adjustment_Disorder_Negative_E": { diagnosis: "Adjustment Disorder", polarity: "negative", dsm: null, icd10: null, icd11: "6B43", graded: true }
	},
	// Adult ADHD Interview
	"adult_adhd_test": {
		"AdultADHDcombined": { diagnosis: "Adult ADHD Combined Type", polarity: "positive", dsm: null, icd10: "F90.2", icd11: null },
		"AdultInattentive or AdultHyperactive": { diagnosis: "Adult ADHD", polarity: "positive", dsm: null, icd10: null, icd11: null, graded: true },
		"ADHD_Combined": { diagnosis: "ADHD, Combined Type", polarity: "positive", dsm: null, icd10: "F90.2", icd11: null },
		"ADHD_Hyperactive_or_inattentive": { diagnosis: "ADHD", polarity: "positive", dsm: null, icd10: null, icd11: null, graded: true },
		"ADHD_Negative_adult": { diagnosis: "Adult ADHD", polarity: "negative", dsm: null, icd10: null, icd11: null },
		"ADHD_Negative_child": { diagnosis: "ADHD", polarity: "negative", dsm: null, icd10: null, icd11: null }
	},
	// Agoraphobia Interview
	"agoraphobia_test": {
		"Agoraphobia Positive": { diagnosis: "Agoraphobia Disorder", polarity: "positive", dsm: "300.22", icd10: "F40.00", icd11: "6B02" },
		"Agoraphobia Negative A": { diagnosis: "Agoraphobia Disorder", polarity: "negative", dsm: "300.22", icd10: "F40.00", icd11: "6B02" },
		"Agoraphobia Negative B": { diagnosis: "Agoraphobia Disorder", polarity: "negative", dsm: "300.22", icd10: "F40.00", icd11: "6B02" }
	},
	// Alcohol Use Interview
	"alcohol_use_disorder_test": {
		"Alcohol never used": { diagnosis: "Alcohol Use Disorder", polarity: "negative", dsm: null, icd10: null, icd11: null },
		"Alcohol Use Disorder Positive": { diagnosis: "Alcohol Use Disorder", polarity: "positive", dsm: null, icd10: null, icd11: null, graded: true },
		"Alcohol Use Disorder Negative": { diagnosis: "Alcohol Use Disorder", polarity: "negative", dsm: "305.00", icd10: "F10.10", icd11: null }
	},
	// Anorexia Nervosa Interview
	"anorexia_test": {
		"Anorexia_positive_diagnosis": { diagnosis: "Anorexia Nervosa", polarity: "positive", dsm: null, icd10: null, icd11: null, graded: true },
		"Anorexia_negative_diagnosis": { diagnosis: "Anorexia Nervosa", polarity: "negative", dsm: "307.1", icd10: "F50.01", icd11: "6B80" }
	},
	// Module B (301.7)
	"antisocial_personality_test": {
		"Antisocial Personality Disorder Positive": { diagnosis: "Antisocial Personality Disorder", polarity: "positive", dsm: "301.7", icd10: "F60.2", icd11: null, graded: true },
		"Antisocial Personality Disorder Negative A": { diagnosis: "Antisocial Personality Disorder", polarity: "negative", dsm: "301.7", icd10: "F60.2", icd11: null, graded: true }
	},
	// Module C (301.82)
	"avoidant_personality_test": {
		"Avoidant Personality Disorder Positive": { diagnosis: "Avoidant Personality Disorder", polarity: "positive", dsm: "301.82", icd10: "F60.6", icd11: null, graded: true },
		"Avoidant Personality Disorder Negative": { diagnosis: "Avoidant Personality Disorder", polarity: "negative", dsm: "301.82", icd10: "F60.6", icd11: null, graded: true }
	},
	// Binge Eating Interview
	"binge_eating_test": {
		"Binge_Eating_Disorder_positive": { diagnosis: "Binge Eating Disorder", polarity: "positive", dsm: "307.51", icd10: null, icd11: "6B82" },
		"binge_eating_disorder_negative_a": { diagnosis: "Binge Eating Disorder", polarity: "negative", dsm: "307.51", icd10: null, icd11: "6B82" },
		"binge_eating_disorder_negative_b": { diagnosis: "Binge Eating Disorder", polarity: "negative", dsm: "307.51", icd10: null, icd11: "6B82" }
	},
	// Body Dysmorphic Interview
	"body_dysmorphic_diagnostic_test": {
		"body_dysmorphic_positive": { diagnosis: "Body Dysmorphic Disorder", polarity: "positive", dsm: "300.07", icd10: "F45.22", icd11: "6B21" },
		"body_dysmorphic_negative": { diagnosis: "Body Dysmorphic Disorder", polarity: "negative", dsm: "300.07", icd10: "F45.22", icd11: "6B21" }
	},
	// Module B (301.83)
	"borderline_personality_test": {
		"Borderline Personality Disorder Full Positive": { diagnosis: "Borderline Personality Disorder", polarity: "positive", dsm: "301.83", icd10: "F60.31", icd11: null, graded: true },
		"borderline Personality Disorder Negative": { diagnosis: "Borderline Personality Disorder", polarity: "negative", dsm: "301.83", icd10: "F60.31", icd11: null, graded: true }
	},
	// Bulimia Nervosa Binge Eating Interview
	"bulimia_interview": {
		"Bulimia_positive_diagnosis": { diagnosis: "Bulimia Nervosa", polarity: "positive", dsm: "307.51", icd10: "F50.2", icd11: "6B81" },
		"Binge_Eating_Disorder_positive": { diagnosis: "Binge Eating Disorder", polarity: "positive", dsm: "307.51", icd10: null, icd11: "6B82" },
		"Bulimia_negative_diagnosis": { diagnosis: "Bulimia Nervosa", polarity: "negative", dsm: "307.51", icd10: "F50.2", icd11: "6B81" },
		"binge_eating_disorder_negative_a": { diagnosis: "Binge Eating Disorder", polarity: "negative", dsm: "307.51", icd10: null, icd11: "6B82" },
		"binge_eating_disorder_negative_b": { diagnosis: "Binge Eating Disorder", polarity: "negative", dsm: "307.51", icd10: null, icd11: "6B82" }
	},
	// Bulimia Nervosa Interview
	"bulimia_test": {
		"Bulimia_positive_diagnosis": { diagnosis: "Bulimia Nervosa", polarity: "positive", dsm: "307.51", icd10: "F50.2", icd11: "6B81" },
		"Bulimia_negative_diagnosis": { diagnosis: "Bulimia Nervosa", polarity: "negative", dsm: "307.51", icd10: "F50.2", icd11: "6B81" }
	},
	// Cannabis Use Interview
	"cannabis_test": {
		"cannabis_use_disorder_negative": { diagnosis: "Cannabis Use Disorder", polarity: "negative", dsm: "304.30", icd10: "F12.10", icd11: null },
		"cannabis_use_disorder_positive": { diagnosis: "Cannabis Use Disorder", polarity: "positive", dsm: null, icd10: null, icd11: null, graded: true },
		"Cannabis_Use_Disorder_Negative": { diagnosis: "Cannabis Use Disorder", polarity: "negative", dsm: "304.30", icd10: "F12.10", icd11: null }
	},
	// Delusional Disorder Interview
	"delusional_disorder": {
		"Delusional Disorder Negative A": { diagnosis: "Delusional Disorder", polarity: "negative", dsm: "297.1", icd10: "F22.0", icd11: null },
		"Delusional Disorder Positive": { diagnosis: "Delusional Disorder", polarity: "positive", dsm: "297.1", icd10: "F22.0", icd11: null },
		"Delusional Disorder Negative B": { diagnosis: "Delusional Disorder", polarity: "negative", dsm: "297.1", icd10: "F22.0", icd11: null }
	},
	// Module C (301.6)
	"dependent_personality_disorder": {
		"Dependent Personality Disorder Positive": { diagnosis: "Dependent Personality Disorder", polarity: "positive", dsm: "301.6", icd10: "F60.7", icd11: null, graded: true },
		"Dependent Personality Disorder Negative": { diagnosis: "Dependent Personality Disorder", polarity: "negative", dsm: "301.6", icd10: "F60.7", icd11: null, graded: true }
	},
	// Depersonalization-Derealization Interview
	"depersonalization_test": {
		"depersonalization_disorder_positive_report": { diagnosis: "Depersonalization/Derealization Disorder", polarity: "positive", dsm: "300.6", icd10: "F48.1", icd11: "6B66" },
		"depersonalization_disorder_negative_report": { diagnosis: "Depersonalization/Derealization Disorder", polarity: "negative", dsm: "300.6", icd10: "F48.1", icd11: "6B66" }
	},
	// Depression Interview
	"depression_test": {
		"Major Depressive Disorder": { diagnosis: "Major Depressive Disorder", polarity: "positive", dsm: null, icd10: null, icd11: null, graded: true },
		"Major Depressive Episode": { diagnosis: "Major Depressive Episode", polarity: "positive", dsm: null, icd10: null, icd11: null, graded: true },
		"Depression Negative A": { diagnosis: "Major Depressive Episode", polarity: "negative", dsm: null, icd10: null, icd11: null },
		"Depression Negative B": { diagnosis: "Major Depressive Episode", polarity: "negative", dsm: null, icd10: null, icd11: null },
		"Depression Negative C": { diagnosis: "Major Depressive Episode", polarity: "negative", dsm: null, icd10: null, icd11: null },
		"Depression Negative D": { diagnosis: "Major Depressive Disorder", polarity: "negative", dsm: null, icd10: null, icd11: null }
	},
	// Dissociative Amnesia Interview
	"dissociative_amnesia_test": {
		"Dissociative Amnesia Positive": { diagnosis: "Dissociative Amnesia", polarity: "positive", dsm: "300.12", icd10: "F44.0", icd11: "6B61" },
		"Dissociative Amnesia Negative": { diagnosis: "Dissociative Amnesia", polarity: "negative", dsm: "300.12", icd10: "F44.0", icd11: "6B61" }
	},
	// Dissociative Identity Interview
	"dissociative_identity": {
		"dissociative_identity_disorder_positive": { diagnosis: "Dissociative Identity Disorder", polarity: "positive", dsm: "300.14", icd10: "F44.81", icd11: "6B64" },
		"dissociative_identity_disorder_negative": { diagnosis: "Dissociative Identity Disorder", polarity: "negative", dsm: "300.14", icd10: "F44.81", icd11: "6B64" }
	},
	// Generalized Anxiety Interview
	"generalized_anxiety_test": {
		"Generalized anxiety positive": { diagnosis: "Generalized Anxiety Disorder", polarity: "positive", dsm: "300.02", icd10: "F41.1", icd11: "6B00" },
		"Generalized Anxiety Negative A": { diagnosis: "Generalized Anxiety Disorder", polarity: "negative", dsm: "300.02", icd10: "F41.1", icd11: "6B00" },
		"Generalized Anxiety Negative B": { diagnosis: "Generalized Anxiety Disorder", polarity: "negative", dsm: "300.02", icd10: "F41.1", icd11: "6B00" }
	},
	// Hallucinogen Use Interview
	"hallucinogen_use_disorder": {
		"Hallucinogen never used": { diagnosis: "Hallucinogen Use Disorder", polarity: "negative", dsm: null, icd10: null, icd11: null },
		"Hallucinogen Use Disorder Positive": { diagnosis: "Hallucinogen Use Disorder", polarity: "positive", dsm: null, icd10: null, icd11: null, graded: true },
		"Hallucinogen Use Disorder Negative": { diagnosis: "Hallucinogen Use Disorder", polarity: "negative", dsm: null, icd10: null, icd11: null }
	},
	// Module B (301.5)
	"histrionic_personality_test": {
		"Histrionic_personality_disorder_positive": { diagnosis: "Histrionic Personality Disorder", polarity: "positive", dsm: "301.50", icd10: "F60.4", icd11: null },
		"Histrionic_personality_disorder_negative": { diagnosis: "Histrionic Personality Disorder", polarity: "negative", dsm: "301.50", icd10: "F60.4", icd11: null }
	},
	// Illness Anxiety Interview
	"illness_anxiety_test": {
		"illness_anxiety_disorder_positive": { diagnosis: "Illness Anxiety Disorder", polarity: "positive", dsm: null, icd10: null, icd11: null, graded: true },
		"illness_anxiety_disorder_negative": { diagnosis: "Illness Anxiety Disorder", polarity: "negative", dsm: "300.7", icd10: "F45.21", icd11: null }
	},
	// Manic Episode Interview
	"manic_test": {
		"Bipolar I (Manic Episode) with Major Depressive Disorder": { diagnosis: "Bipolar I Disorder (Manic Episode)", polarity: "positive", dsm: null, icd10: null, icd11: "6A60", graded: true },
		"Bipolar I (Manic Episode) without Major Depressive Disorder": { diagnosis: "Bipolar I Disorder (Manic Episode)", polarity: "positive", dsm: null, icd10: null, icd11: "6A60", graded: true },
		"Bipolar II Positive": { diagnosis: "Bipolar II Disorder", polarity: "positive", dsm: null, icd10: "F31.81", icd11: "6A61" },
		"Bipolar I Negative A": { diagnosis: "Bipolar I Disorder (Manic Episode)", polarity: "negative", dsm: null, icd10: null, icd11: "6A60", graded: true },
		"Bipolar I Negative B": { diagnosis: "Bipolar I Disorder (Manic Episode)", polarity: "negative", dsm: null, icd10: null, icd11: "6A60", graded: true },
		"Hypomanic Episode": { diagnosis: "Hypomanic Episode", polarity: "positive", dsm: null, icd10: "F31.81", icd11: null },
		"Hypomanic Negative": { diagnosis: "Hypomanic Episode", polarity: "negative", dsm: null, icd10: "F31.81", icd11: null },
		"Bipolar I Negative C": { diagnosis: "Bipolar I Disorder (Manic Episode)", polarity: "negative", dsm: null, icd10: null, icd11: "6A60", graded: true }
	},
	// Module B (301.81)
	"narcissistic_personality_test": {
		"Narcissistic Personality Disorder Positive": { diagnosis: "Narcissistic Personality Disorder", polarity: "positive", dsm: "301.81", icd10: "F60.81", icd11: null, graded: true },
		"Narcissistic Personality Disorder Negative A": { diagnosis: "Narcissistic Personality Disorder", polarity: "negative", dsm: "301.81", icd10: "F60.81", icd11: null, graded: true }
	},
	// Module C (301.4)
	"obsessive_compulsive_personality_test": {
		"Obsessive Compulsive Personality Disorder Positive": { diagnosis: "Obsessive Compulsive Personality Disorder", polarity: "positive", dsm: "301.4", icd10: "F60.5", icd11: null, graded: true },
		"Obsessive Compulsive Personality Disorder Negative A": { diagnosis: "Obsessive Compulsive Personality Disorder", polarity: "negative", dsm: "301.4", icd10: "F60.5", icd11: null }
	},
	// Obsessive Compulsive Interview
	"ocd_test": {
		"OCD_positive": { diagnosis: "Obsessive-Compulsive Disorder", polarity: "positive", dsm: "300.3", icd10: "F42", icd11: "6B20" },
		"OCD_negative": { diagnosis: "Obsessive-Compulsive Disorder", polarity: "negative", dsm: "300.3", icd10: "F42", icd11: "6B20" }
	},
	// Opioid Use Interview
	"opioid_use_disorder": {
		"Opioids Never Used": { diagnosis: "Opioid Use Disorder", polarity: "negative", dsm: null, icd10: null, icd11: null },
		"Opioid Use Disorder Positive": { diagnosis: "Opioid Use Disorder", polarity: "positive", dsm: null, icd10: null, icd11: null, graded: true },
		"Opioid Use Disorder Negative": { diagnosis: "Opioid Use Disorder", polarity: "negative", dsm: null, icd10: null, icd11: null }
	},
	// Panic Interview
	"panic_test": {
		"Panic Positive": { diagnosis: "Panic Disorder", polarity: "positive", dsm: "300.01", icd10: "F41.0", icd11: "6B01" },
		"Panic Negative A": { diagnosis: "Panic Disorder", polarity: "negative", dsm: null, icd10: null, icd11: null },
		"Panic Negative B": { diagnosis: "Panic Disorder", polarity: "negative", dsm: "300.01", icd10: "F41.0", icd11: "6B01" }
	},
	// Module A (301.0)
	"paranoid_test": {
		"Positive Outcome": { diagnosis: "Paranoid Personality Disorder", polarity: "positive", dsm: "301.0", icd10: "F60.0", icd11: null, graded: true },
		"Negative Outcome": { diagnosis: "Paranoid Personality Disorder", polarity: "negative", dsm: "301.0", icd10: "F60.0", icd11: null, graded: true }
	},
	// PCP Use Interview
	"pcp_use_disorder": {
		"PCP Use Disorder - No Use Reported": { diagnosis: "PCP Use Disorder", polarity: "negative", dsm: null, icd10: null, icd11: null },
		"PCP Use Disorder Positive": { diagnosis: "PCP Use Disorder", polarity: "positive", dsm: null, icd10: null, icd11: null, graded: true },
		"PCP Use Disorder Negative": { diagnosis: "PCP Use Disorder", polarity: "negative", dsm: null, icd10: null, icd11: null }
	},
	// Persistent Depressive Interview
	"persistent_depressive_test": {
		"Persistent Depressive Disorder Positive": { diagnosis: "Persistent Depressive Disorder", polarity: "positive", dsm: "300.4", icd10: "F34.1", icd11: "6A72" },
		"Persistent Depressive Disorder Negative": { diagnosis: "Persistent Depressive Disorder", polarity: "negative", dsm: "300.4", icd10: "F34.1", icd11: "6A72" }
	},
	// Prolonged Grief Interview
	"prolonged_grief_disorder": {
		"Prolonged Grief Disorder Positive": { diagnosis: "Prolonged Grief Disorder", polarity: "positive", dsm: null, icd10: "F43.8", icd11: "6B42" },
		"Prolonged Grief Disorder Negative A": { diagnosis: "Prolonged Grief Disorder", polarity: "negative", dsm: null, icd10: "F43.8", icd11: "6B42" },
		"Prolonged Grief Disorder Negative B": { diagnosis: "Prolonged Grief Disorder", polarity: "negative", dsm: null, icd10: "F43.8", icd11: "6B42" }
	},
	// Post Traumatic Stress Interview
	"PTSD_test": {
		"PTSD positive": { diagnosis: "Post Traumatic Stress Disorder", polarity: "positive", dsm: "309.81", icd10: "F43.10", icd11: "6B40", graded: true },
		"PTSD Diagnosis Negative A": { diagnosis: "Post Traumatic Stress Disorder", polarity: "negative", dsm: "309.81", icd10: "F43.10", icd11: "6B40" },
		"PTSD Diagnosis Negative B": { diagnosis: "Post Traumatic Stress Disorder", polarity: "negative", dsm: "309.81", icd10: "F43.10", icd11: "6B40" },
		"PTSD Negative C": { diagnosis: "Post Traumatic Stress Disorder", polarity: "negative", dsm: "309.81", icd10: "F43.10", icd11: "6B40" },
		"PTSD Negative E": { diagnosis: "Post Traumatic Stress Disorder", polarity: "negative", dsm: "309.81", icd10: "F43.10", icd11: "6B40" },
		"PTSD Negative F": { diagnosis: "Post Traumatic Stress Disorder", polarity: "negative", dsm: "309.81", icd10: "F43.10", icd11: "6B40" }
	},
	// Module A (301.20)
	"schizoid_personality_test": {
		"Schizoid Personality Disorder Positive": { diagnosis: "Schizoid Personality Disorder", polarity: "positive", dsm: "301.20", icd10: "F60.1", icd11: null, graded: true },
		"Schizoid Personality Disorder Negative A": { diagnosis: "Schizoid Personality Disorder", polarity: "negative", dsm: "301.20", icd10: "F60.1", icd11: null, graded: true },
		"Schizoid Personality Disorder Negative B": { diagnosis: "Schizoid Personality Disorder", polarity: "negative", dsm: "301.20", icd10: "F60.1", icd11: null, graded: true }
	},
	// Module A (301.22)
	"schizotypal_personality_disorder_test": {
		"Schizotypal Personality Disorder Positive": { diagnosis: "Schizotypal Personality Disorder", polarity: "positive", dsm: "301.22", icd10: "F60.3", icd11: null, graded: true },
		"Schizotypal Personality Disorder Negative A": { diagnosis: "Schizotypal Personality Disorder", polarity: "negative", dsm: "301.22", icd10: "F60.3", icd11: null, graded: true },
		"Schizotypal Personality Disorder Negative B": { diagnosis: "Schizotypal Personality Disorder", polarity: "negative", dsm: "301.22", icd10: "F60.3", icd11: null, graded: true },
		"Schizotypal Personality Disorder Negative C": { diagnosis: "Schizotypal Personality Disorder", polarity: "negative", dsm: "301.22", icd10: "F60.3", icd11: null, graded: true },
		"Schizotypal Personality Disorder Negative D": { diagnosis: "Schizotypal Personality Disorder", polarity: "negative", dsm: "301.22", icd10: "F60.3", icd11: null, graded: true }
	},
	// Sedative, Hypnotic or Anxiolytic Use Interview
	"sedative_hypnotic_anxiolytic_use_disorder": {
		"Never Used Sedatives, hypnotics or anxiolytics": { diagnosis: "Sedative, Hypnotic or Anxiolytic Use Disorder", polarity: "negative", dsm: null, icd10: null, icd11: null },
		"Sedatives, hypnotics or anxiolytics Use Disorder Positive": { diagnosis: "Sedative, Hypnotic or Anxiolytic Use Disorder", polarity: "positive", dsm: null, icd10: null, icd11: null, graded: true },
		"Sedatives, hypnotics or anxiolytics Use Disorder Negative": { diagnosis: "Sedative, Hypnotic or Anxiolytic Use Disorder", polarity: "negative", dsm: null, icd10: null, icd11: null }
	},
	// Insomnia Interview
	"sleep_disorder_test": {
		"Insomnia Positive Report": { diagnosis: "Insomnia Disorder", polarity: "positive", dsm: "780.52", icd10: "G47.00", icd11: null },
		"Insomnia Negative A": { diagnosis: "Insomnia Disorder", polarity: "negative", dsm: null, icd10: "G47.00", icd11: null },
		"Insomnia Negative B": { diagnosis: "Insomnia Disorder", polarity: "negative", dsm: "780.52", icd10: "G47.00", icd11: null }
	},
	// Social Anxiety Interview
	"social_anxiety_test": {
		"Social Anxiety Positive": { diagnosis: "Social Anxiety Disorder", polarity: "positive", dsm: "300.23", icd10: "F40.10", icd11: "6B04" },
		"Social Anxiety Negative A": { diagnosis: "Social Anxiety Disorder", polarity: "negative", dsm: "300.23", icd10: "F40.10", icd11: "6B04" },
		"Social Anxiety Negative B": { diagnosis: "Social Anxiety Disorder", polarity: "negative", dsm: "300.23", icd10: "F40.10", icd11: "6B04" }
	},
	// Somatic Symptom Interview
	"somatic_symptom_test": {
		"somatic_symptom_disorder": { diagnosis: "Somatic Symptom Disorder", polarity: "positive", dsm: "300.82", icd10: "F45.1", icd11: null },
		"somatic_symptom_disorder_negative": { diagnosis: "Somatic Symptom Disorder", polarity: "negative", dsm: "300.82", icd10: "F45.1", icd11: null }
	},
	// Specific Phobia Interview
	"specific_phobia_test": {
		"specific_phobia_positive": { diagnosis: "Specific Phobia", polarity: "positive", dsm: "300.29", icd10: "F40.2", icd11: "6B03" },
		"Specific Phobia Negative A": { diagnosis: "Specific Phobia", polarity: "negative", dsm: "300.29", icd10: "F40.2", icd11: "6B03" },
		"Specific Phobia Negative B": { diagnosis: "Specific Phobia", polarity: "negative", dsm: "300.29", icd10: "F40.2", icd11: "6B03" }
	},
	// Stimulant Use Interview
	"stimulant_use_disorder": {
		"Stimulant Use Disorder - No Use Reported": { diagnosis: "Stimulant Use Disorder", polarity: "negative", dsm: null, icd10: null, icd11: null },
		"Stimulant Use Disorder Positive": { diagnosis: "Stimulant Use Disorder", polarity: "positive", dsm: null, icd10: null, icd11: null },
		"Stimulant Use Disorder Negative": { diagnosis: "Stimulant Use Disorder", polarity: "negative", dsm: null, icd10: null, icd11: null }
	},
	// Stressful Beliefs Index
	"stressful_beliefs_index": {
		"Stressful_Beliefs_Report": { diagnosis: null, polarity: "none", dsm: null, icd10: null, icd11: null }
	},
	// Suicide Interview Assessment
	"suicide_interview": {
		"Suicide Ideation and Planning": { diagnosis: null, polarity: "none", dsm: null, icd10: null, icd11: null }
	}
};

// Per-disorder fallback codes: the value any branch in the corpus states for
// this disorder. Consulted only after the rendered line and the fired branch
// have both come up empty, so a run-time-graded positive still carries the
// code its own instrument prints elsewhere.
export const CORPUS_CODES = {
	"ADHD, Combined Type": { dsm: null, icd10: "F90.2", icd11: null },
	"Adjustment Disorder": { dsm: null, icd10: null, icd11: "6B43" },
	"Adult ADHD Combined Type": { dsm: null, icd10: "F90.2", icd11: null },
	"Agoraphobia Disorder": { dsm: "300.22", icd10: "F40.00", icd11: "6B02" },
	"Alcohol Use Disorder": { dsm: "305.00", icd10: "F10.10", icd11: null },
	"Anorexia Nervosa": { dsm: "307.1", icd10: "F50.01", icd11: "6B80" },
	"Antisocial Personality Disorder": { dsm: "301.7", icd10: "F60.2", icd11: null },
	"Avoidant Personality Disorder": { dsm: "301.82", icd10: "F60.6", icd11: null },
	"Binge Eating Disorder": { dsm: "307.51", icd10: null, icd11: "6B82" },
	"Bipolar I Disorder (Manic Episode)": { dsm: null, icd10: null, icd11: "6A60" },
	"Bipolar II Disorder": { dsm: null, icd10: "F31.81", icd11: "6A61" },
	"Body Dysmorphic Disorder": { dsm: "300.07", icd10: "F45.22", icd11: "6B21" },
	"Borderline Personality Disorder": { dsm: "301.83", icd10: "F60.31", icd11: null },
	"Bulimia Nervosa": { dsm: "307.51", icd10: "F50.2", icd11: "6B81" },
	"Cannabis Use Disorder": { dsm: "304.30", icd10: "F12.10", icd11: null },
	"Delusional Disorder": { dsm: "297.1", icd10: "F22.0", icd11: null },
	"Dependent Personality Disorder": { dsm: "301.6", icd10: "F60.7", icd11: null },
	"Depersonalization/Derealization Disorder": { dsm: "300.6", icd10: "F48.1", icd11: "6B66" },
	"Dissociative Amnesia": { dsm: "300.12", icd10: "F44.0", icd11: "6B61" },
	"Dissociative Identity Disorder": { dsm: "300.14", icd10: "F44.81", icd11: "6B64" },
	"Generalized Anxiety Disorder": { dsm: "300.02", icd10: "F41.1", icd11: "6B00" },
	"Histrionic Personality Disorder": { dsm: "301.50", icd10: "F60.4", icd11: null },
	"Hypomanic Episode": { dsm: null, icd10: "F31.81", icd11: null },
	"Illness Anxiety Disorder": { dsm: "300.7", icd10: "F45.21", icd11: null },
	"Insomnia Disorder": { dsm: "780.52", icd10: "G47.00", icd11: null },
	"Narcissistic Personality Disorder": { dsm: "301.81", icd10: "F60.81", icd11: null },
	"Obsessive Compulsive Personality Disorder": { dsm: "301.4", icd10: "F60.5", icd11: null },
	"Obsessive-Compulsive Disorder": { dsm: "300.3", icd10: "F42", icd11: "6B20" },
	"Panic Disorder": { dsm: "300.01", icd10: "F41.0", icd11: "6B01" },
	"Paranoid Personality Disorder": { dsm: "301.0", icd10: "F60.0", icd11: null },
	"Persistent Depressive Disorder": { dsm: "300.4", icd10: "F34.1", icd11: "6A72" },
	"Post Traumatic Stress Disorder": { dsm: "309.81", icd10: "F43.10", icd11: "6B40" },
	"Prolonged Grief Disorder": { dsm: null, icd10: "F43.8", icd11: "6B42" },
	"Schizoid Personality Disorder": { dsm: "301.20", icd10: "F60.1", icd11: null },
	"Schizotypal Personality Disorder": { dsm: "301.22", icd10: "F60.3", icd11: null },
	"Social Anxiety Disorder": { dsm: "300.23", icd10: "F40.10", icd11: "6B04" },
	"Somatic Symptom Disorder": { dsm: "300.82", icd10: "F45.1", icd11: null },
	"Specific Phobia": { dsm: "300.29", icd10: "F40.2", icd11: "6B03" }
};
