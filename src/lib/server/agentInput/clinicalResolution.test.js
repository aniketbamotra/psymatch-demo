// Each interview's report logic evaluates alone and cannot see the other
// forty-five. With all of them wired, real patients produced diagnosis lists no
// clinician would sign: three personality screens sharing one ICD-11 code, two
// instruments asserting the same eating disorder, and a persistent depressive
// disorder standing beside a supported manic episode.
//
// §7's count validator makes this more than cosmetic — it requires exactly one
// card per supported candidate, so two interviews asserting one disorder is an
// unsatisfiable constraint, not a duplicated line.
//
// Rules agreed with the product owner on 2026-08-04.

import { describe, it, expect } from 'vitest';
import { applyClinicalResolution } from './clinicalResolution.js';
import { buildRiskSummary, RISK_ITEMS_BY_TEST_CODE } from './riskItems.js';

const supported = (name, { dsm = null, icd11 = null } = {}) => ({
	administered: true,
	diagnostic_output: {
		diagnostic_status: 'supported',
		diagnosis_name: name,
		dsm_code: dsm,
		icd_11_code: icd11,
		symptoms: ['a symptom']
	}
});

const statusOf = (i, k) => i[k]?.diagnostic_output?.diagnostic_status;

describe('one card per distinct disorder', () => {
	it('keeps the more specific instrument and records the other as corroborating', () => {
		// Seen on patient 6877f17a: bulimia_interview and binge_eating_test both
		// fired Binge Eating Disorder, both at DSM 307.51.
		const interviews = {
			bulimia_binge_eating: supported('Binge Eating Disorder', { dsm: '307.51', icd11: '6B82' }),
			binge_eating: supported('Binge Eating Disorder', { dsm: '307.51', icd11: '6B82' })
		};
		applyClinicalResolution(interviews);

		expect(statusOf(interviews, 'bulimia_binge_eating')).toBe('supported');
		expect(statusOf(interviews, 'binge_eating')).toBe('not_supported');
		expect(interviews.bulimia_binge_eating.diagnostic_output.corroborated_by).toEqual([
			'binge_eating'
		]);
		expect(interviews.binge_eating.resolution.demoted_by).toBe('duplicate_diagnosis');
	});

	it('leaves genuinely different disorders alone even when they share a DSM code', () => {
		// 307.51 is BOTH Bulimia Nervosa and Binge-Eating Disorder. Sharing an
		// ICD-9-derived code is correct clinical data, not a duplicate.
		const interviews = {
			bulimia_nervosa: supported('Bulimia Nervosa', { dsm: '307.51', icd11: '6B81' }),
			binge_eating: supported('Binge Eating Disorder', { dsm: '307.51', icd11: '6B82' })
		};
		applyClinicalResolution(interviews);
		expect(statusOf(interviews, 'bulimia_nervosa')).toBe('supported');
		expect(statusOf(interviews, 'binge_eating')).toBe('supported');
	});
});

describe('concurrent personality screens collapse to one finding', () => {
	it('reports one entry graded at the most severe grade returned', () => {
		// Patient 6888e3eb: avoidant + borderline + paranoid all positive, all 6D10.x.
		const interviews = {
			avoidant_personality: supported('Avoidant Personality Disorder', {
				dsm: '301.82',
				icd11: '6D10.2'
			}),
			borderline_personality: supported('Borderline Personality Disorder', {
				dsm: '301.83',
				icd11: '6D10.1'
			}),
			paranoid_personality: supported('Paranoid Personality Disorder', {
				dsm: '301.0',
				icd11: '6D10.0'
			})
		};
		applyClinicalResolution(interviews);

		const carriers = Object.entries(interviews).filter(
			([, e]) => statusOf({ e }, 'e') === 'supported'
		);
		expect(carriers).toHaveLength(1);
		const [, carrier] = carriers[0];
		expect(carrier.diagnostic_output.diagnosis_name).toBe('Personality Disorder');
		expect(carrier.diagnostic_output.icd_11_code).toBe('6D10.2'); // most severe
		expect(carrier.diagnostic_output.modifiers).toEqual([
			'prominent avoidant features',
			'prominent borderline features',
			'prominent paranoid features'
		]);
		// DSM-5-TR has no code for a mixed personality presentation, and inventing
		// one would contradict the algorithmic report.
		expect(carrier.diagnostic_output.dsm_code).toBeNull();
		expect(carrier.diagnostic_output.instrument_class).toBe('screening');
	});

	it('leaves a single positive screen named, with its own DSM code', () => {
		const interviews = {
			borderline_personality: supported('Borderline Personality Disorder', {
				dsm: '301.83',
				icd11: '6D10.1'
			})
		};
		applyClinicalResolution(interviews);
		expect(interviews.borderline_personality.diagnostic_output.diagnosis_name).toBe(
			'Borderline Personality Disorder'
		);
		expect(interviews.borderline_personality.diagnostic_output.dsm_code).toBe('301.83');
	});
});

describe('a supported manic episode excludes the depressive diagnoses', () => {
	it('demotes persistent depressive disorder and states why', () => {
		// Seen on patients 6877f17a and 685ab4d5 — a pair DSM-5 forbids.
		const interviews = {
			manic_episode: supported('Bipolar I Disorder (Manic Episode)', { icd11: '6A60' }),
			persistent_depressive: supported('Persistent Depressive Disorder', {
				dsm: '300.4',
				icd11: '6A72'
			}),
			depression: supported('Major Depressive Episode', { dsm: '296.32', icd11: '6A71' })
		};
		applyClinicalResolution(interviews);

		expect(statusOf(interviews, 'manic_episode')).toBe('supported');
		expect(statusOf(interviews, 'persistent_depressive')).toBe('not_supported');
		expect(statusOf(interviews, 'depression')).toBe('not_supported');
		expect(interviews.persistent_depressive.resolution.reason).toMatch(/bipolar spectrum/i);
	});

	it('does nothing when no manic episode is supported', () => {
		const interviews = { depression: supported('Major Depressive Disorder', { dsm: '296.32' }) };
		applyClinicalResolution(interviews);
		expect(statusOf(interviews, 'depression')).toBe('supported');
	});
});

describe('the audit trail', () => {
	it('records every demotion and merge so §7 can state the reason', () => {
		const interviews = {
			manic_episode: supported('Bipolar I Disorder (Manic Episode)'),
			depression: supported('Major Depressive Episode')
		};
		const { applied } = applyClinicalResolution(interviews);
		expect(applied).toHaveLength(1);
		expect(applied[0]).toMatchObject({ interview_key: 'depression', kind: 'demoted' });
		expect(applied[0].reason).toBeTruthy();
	});
});

describe('the §6 no-endorsement claim', () => {
	it('reports the modules that endorsed a risk item', () => {
		// §6 prints "failure to endorse past attempts or self-harm when the
		// opportunity for disclosure was provided" whenever the suicide module was
		// not administered. Until now only depression contributed risk items, so a
		// patient endorsing borderline's attempt and self-harm items still got a
		// report asserting they had endorsed neither.
		const interviews = {
			depression: {
				risk_relevant_items: {
					items: [{ kind: 'suicidal_ideation', kind_label: 'suicidal ideation', endorsed: false }]
				}
			},
			borderline_personality: {
				risk_relevant_items: {
					items: [
						{ kind: 'suicide_attempt', kind_label: 'past suicide attempt', endorsed: true },
						{ kind: 'self_harm', kind_label: 'non-suicidal self-injury', endorsed: true }
					]
				}
			}
		};
		const summary = buildRiskSummary(interviews);
		expect(summary.any_endorsed).toBe(true);
		expect(summary.endorsing_modules).toEqual(['borderline_personality']);
		expect(summary.endorsed_items).toHaveLength(2);
	});

	it('says nothing was endorsed only when nothing was', () => {
		const summary = buildRiskSummary({
			depression: {
				risk_relevant_items: { items: [{ kind: 'suicidal_ideation', endorsed: false }] }
			}
		});
		expect(summary.any_endorsed).toBe(false);
		expect(summary.current_endorsed).toBe(false);
		expect(summary.endorsing_modules).toEqual([]);
	});
});

describe('current vs lifetime risk', () => {
	// Patient 6a5103bf, report 8d65d909 (2026-08-04). The suicide module recorded
	// "Right now, are you having strong urges to self-harm?" = 1, and §6 printed
	// "she did not endorse current strong urges to self-harm", which §3 summarised
	// as "risk is assessed as low". The module's items were not in
	// RISK_ITEMS_BY_TEST_CODE at all — that table existed only for the case where
	// the module was ABSENT — so they reached the model as a raw rule-engine dump
	// and it read them one item at a time.
	it('separates a current endorsement from a lifetime one', () => {
		const summary = buildRiskSummary({
			comprehensive_suicide_self_harm: {
				risk_relevant_items: {
					items: [
						{
							kind: 'suicide_attempt',
							timeframe: 'lifetime',
							endorsed: false,
							question_text: 'Have you ever made a suicide attempt in your lifetime?'
						},
						{
							kind: 'self_harm',
							timeframe: 'current',
							endorsed: true,
							question_text: 'Right now, are you having strong urges to self-harm?'
						}
					]
				}
			}
		});
		expect(summary.any_endorsed).toBe(true);
		expect(summary.current_endorsed).toBe(true);
		expect(summary.current_endorsed_items).toHaveLength(1);
		expect(summary.current_endorsed_items[0].question_text).toMatch(/Right now/);
	});

	it('does not call risk current when only lifetime items were endorsed', () => {
		// A report may truthfully say current risk is low while a lifetime attempt
		// is on record; the gate is specifically about present-tense items.
		const summary = buildRiskSummary({
			comprehensive_suicide_self_harm: {
				risk_relevant_items: {
					items: [{ kind: 'suicide_attempt', timeframe: 'lifetime', endorsed: true }]
				}
			}
		});
		expect(summary.any_endorsed).toBe(true);
		expect(summary.current_endorsed).toBe(false);
	});

	it('covers the suicide module, not just the modules that stand in for it', () => {
		// The regression that let the inversion through: an empty spec list here
		// means the items never reach the agent as scored flags.
		expect(RISK_ITEMS_BY_TEST_CODE.suicide_interview?.length).toBeGreaterThan(0);
		const q29 = RISK_ITEMS_BY_TEST_CODE.suicide_interview.find((s) => s.question_id === 'q29');
		expect(q29, 'q29 "right now… strong urges to self-harm" must be collected').toBeTruthy();
		expect(q29.timeframe).toBe('current');
		// The emergency-services instruction is shown to the patient, not answered
		// by them; scoring it would suppress the §6 limitation line for no reason.
		expect(RISK_ITEMS_BY_TEST_CODE.suicide_interview.some((s) => s.question_id === 'q16')).toBe(
			false
		);
	});
});
