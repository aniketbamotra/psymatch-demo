// What a fired rule-engine outcome means.
//
// Before the catalog, this was decided by `/negative/i.test(outcomeLabel)`, with
// everything else scored 'supported'. Six live outcome labels mean "no exposure"
// and contain neither word, so a patient who had never touched opioids, PCP,
// stimulants, sedatives or hallucinogens was handed to the agent as five
// SUPPORTED substance use disorders. Alcohol was already live with that bug.

import { describe, it, expect } from 'vitest';
import { resolveFiredOutcome, patientInfoForRender, firedOutcomeOf } from './standardReport.js';
import { OUTCOME_CATALOG } from './outcomeCatalog.js';

const resolve = (testCode, type, { summarySections = [], anyCriterionFired = false } = {}) =>
	resolveFiredOutcome({
		testCode,
		fired: { type, report_sections: summarySections },
		anyCriterionFired,
		patientInfo: { firstName: 'Tal', gender: 'She' },
		variables: {}
	});

// One summary block carrying a rendered code line, as the evaluator produces it.
const codeLine = (en) => [{ summary: true, text: { en } }];

describe('the six "never used" outcomes are rule-outs, not diagnoses', () => {
	const NEVER_USED = [
		['alcohol_use_disorder_test', 'Alcohol never used'],
		['hallucinogen_use_disorder', 'Hallucinogen never used'],
		['opioid_use_disorder', 'Opioids Never Used'],
		['pcp_use_disorder', 'PCP Use Disorder - No Use Reported'],
		['sedative_hypnotic_anxiolytic_use_disorder', 'Never Used Sedatives, hypnotics or anxiolytics'],
		['stimulant_use_disorder', 'Stimulant Use Disorder - No Use Reported']
	];

	it.each(NEVER_USED)('%s / %s → not_supported', (testCode, type) => {
		// Even with a criterion firing: never having used the substance is a
		// rule-out, never a subthreshold use disorder.
		const r = resolve(testCode, type, { anyCriterionFired: true });
		expect(r.diagnostic_status).toBe('not_supported');
	});

	it('and none of them is a supported diagnosis under the old label heuristic', () => {
		for (const [testCode, type] of NEVER_USED) {
			expect(/negative/i.test(type), `${type} would have been scored supported`).toBe(false);
			expect(OUTCOME_CATALOG[testCode][type].polarity).toBe('negative');
		}
	});
});

describe('diagnosis identity comes from the fired branch, not the test', () => {
	it('manic_test names the branch that fired, not a single per-test label', () => {
		expect(resolve('manic_test', 'Bipolar II Positive').diagnosis_name).toBe('Bipolar II Disorder');
		expect(resolve('manic_test', 'Hypomanic Episode').diagnosis_name).toBe('Hypomanic Episode');
		expect(
			resolve('manic_test', 'Bipolar I (Manic Episode) without Major Depressive Disorder')
				.diagnosis_name
		).toBe('Bipolar I Disorder (Manic Episode)');
	});

	it('the combined bulimia interview can report Binge Eating Disorder', () => {
		// The old per-test table reported "Bulimia Nervosa" whichever branch fired.
		expect(resolve('bulimia_interview', 'Binge_Eating_Disorder_positive').diagnosis_name).toBe(
			'Binge Eating Disorder'
		);
		expect(resolve('bulimia_interview', 'Bulimia_positive_diagnosis').diagnosis_name).toBe(
			'Bulimia Nervosa'
		);
	});

	it('paranoid_test survives labels that carry no polarity word', () => {
		expect(resolve('paranoid_test', 'Positive Outcome').diagnostic_status).toBe('supported');
		expect(resolve('paranoid_test', 'Negative Outcome').diagnostic_status).toBe('not_supported');
	});
});

describe('codes track the algorithmic report', () => {
	it('reads the run-time-graded code out of the rendered line', () => {
		// Depression picks its DSM/ICD codes from the patient's own severity and
		// recurrence; a fixed table printed 296.32/6A71 for every depressed patient.
		const r = resolve('depression_test', 'Major Depressive Disorder', {
			summarySections: codeLine(
				'Tal meets DSM-5 criteria for Major Depressive Disorder 296.22(F32.1) ICD11: (6A70)'
			)
		});
		expect(r.dsm_code).toBe('296.22');
		expect(r.icd_11_code).toBe('6A70');
	});

	it('reads the ICD-11 severity grade the personality modules resolve at run time', () => {
		const r = resolve(
			'borderline_personality_test',
			'Borderline Personality Disorder Full Positive',
			{
				summarySections: codeLine(
					'Tal meets DSM-5 criteria for Borderline Personality Disorder (301.83) (F60.31) ICD11: (6D10.1).'
				)
			}
		);
		expect(r.icd_11_code).toBe('6D10.1');
		expect(r.dsm_code).toBe('301.83');
	});

	it('does NOT parse Bipolar II — its summary quotes the depressive episode codes', () => {
		// "…Bipolar II Disorder ICD11: (6A61) (at least one Hypomanic Episode F31.81
		// and at least one Depressive Episode 296.32(F33.1) ICD11: (6A71))" — parsing
		// would print a depression code against a bipolar diagnosis.
		const r = resolve('manic_test', 'Bipolar II Positive', {
			summarySections: codeLine(
				'Tal meets DSM-5 criteria for Bipolar II Disorder ICD11: (6A61) (at least one Hypomanic Episode F31.81 and at least one Depressive Episode 296.32(F33.1) ICD11: (6A71))'
			)
		});
		expect(r.icd_11_code).toBe('6A61');
		expect(r.dsm_code).not.toBe('296.32');
	});
});

describe('instruments that make no diagnostic claim', () => {
	it('the SBI and the suicide module return polarity "none"', () => {
		expect(resolve('stressful_beliefs_index', 'Stressful_Beliefs_Report').polarity).toBe('none');
		// Its single outcome, "Suicide Ideation and Planning", contains no polarity
		// word, so it used to score as a SUPPORTED diagnosis named after the key.
		expect(resolve('suicide_interview', 'Suicide Ideation and Planning').polarity).toBe('none');
	});

	it('no branch firing at all is inconclusive, not ruled out', () => {
		const r = resolveFiredOutcome({
			testCode: 'adjustment_test',
			fired: null,
			anyCriterionFired: true,
			patientInfo: {},
			variables: {}
		});
		expect(r.polarity).toBe('inconclusive');
		expect(r.diagnostic_status).toBeNull();
		expect(r.diagnosis_name).toBeNull();
	});
});

describe('rendering the standard report statement', () => {
	it('substitutes the name and pronouns the report was written against', () => {
		const r = resolve('social_anxiety_test', 'Social Anxiety Negative A', {
			summarySections: codeLine(
				'{first_name} failed to meet DSM-5 diagnostic criteria for Social Anxiety Disorder because {pronouns.subject} did not report the required fear.'
			)
		});
		expect(r.summary).toBe(
			'Tal failed to meet DSM-5 diagnostic criteria for Social Anxiety Disorder because she did not report the required fear.'
		);
	});

	it('maps the patient block onto the report generator’s gender token', () => {
		expect(patientInfoForRender({ gender: 'Female', name: 'Daad Khouri' }).gender).toBe('She');
		expect(patientInfoForRender({ gender: 'Male' }).gender).toBe('He');
		// Unknown or absent gender falls back to they/their, as the report does.
		expect(patientInfoForRender({}).gender).toBe('They');
		expect(patientInfoForRender({ first_name: 'Tal' }).firstName).toBe('Tal');
		expect(patientInfoForRender({ name: 'Daad Khouri' }).firstName).toBe('Daad');
	});
});

describe('firedOutcomeOf', () => {
	it('returns the one branch whose value is 1', () => {
		expect(
			firedOutcomeOf({ outcomes: { A: { value: 0 }, B: { value: 1 }, C: { value: 0 } } })?.type
		).toBe('B');
		expect(firedOutcomeOf({ outcomes: { A: { value: 0 } } })).toBeNull();
		expect(firedOutcomeOf(null)).toBeNull();
	});
});

describe('catalog integrity', () => {
	it('classifies every one of the 132 live outcomes', () => {
		let n = 0;
		for (const outcomes of Object.values(OUTCOME_CATALOG)) {
			for (const [type, entry] of Object.entries(outcomes)) {
				n++;
				expect(['positive', 'negative', 'none'], type).toContain(entry.polarity);
				// A positive branch must name the disorder it asserts; a §7 card
				// named after an interview key is worse than no card.
				if (entry.polarity === 'positive') expect(entry.diagnosis, type).toBeTruthy();
			}
		}
		expect(n).toBe(132);
	});
});
