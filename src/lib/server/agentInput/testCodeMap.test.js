// Pins the Vercel→agent interview mapping against the three silent failures
// found on 2026-07-28 by diffing this map against the live `questionnaires`
// collection:
//
//   1. `insomnia_disorder_test` never existed — the real code is
//      `sleep_disorder_test`, so insomnia data was dropped from §3 §4 §6 §8 §10.
//   2. `adult_adhd_test` existed in Mongo but was missing from the map.
//   3. `suicide_interview` existed in Mongo but was missing from the map,
//      leaving §6 Risk Assessment without the dedicated suicide instrument.
//
// A broken mapping fails SILENTLY (moduleCoverage skips unknown codes), which
// is exactly why these are worth a test.

import { describe, it, expect } from 'vitest';
import {
	TEST_CODE_TO_INTERVIEW_KEY,
	INTERVIEW_KEY_TO_TEST_CODE
} from './testCodeMap.js';
import {
	ALL_KNOWN_INTERVIEW_KEYS,
	INTERVIEW_DISPLAY,
	sortInterviewKeys
} from './knownInterviewKeys.js';
import { OUTCOME_CATALOG } from './outcomeCatalog.js';
import { TEST_CODE_TO_DIAGNOSIS, DIAGNOSIS_CODES, codesFor } from './diagnosisCodes.js';

describe('testCodeMap', () => {
	it('maps insomnia via the test_code that actually exists', () => {
		expect(TEST_CODE_TO_INTERVIEW_KEY.sleep_disorder_test).toBe('insomnia');
		expect(TEST_CODE_TO_INTERVIEW_KEY.insomnia_disorder_test).toBeUndefined();
	});

	it('maps the Adult ADHD interview', () => {
		expect(TEST_CODE_TO_INTERVIEW_KEY.adult_adhd_test).toBe('adult_adhd');
	});

	it('maps the suicide interview into the risk key', () => {
		expect(TEST_CODE_TO_INTERVIEW_KEY.suicide_interview).toBe(
			'comprehensive_suicide_self_harm'
		);
	});

	it('every mapped value is an interview key the agent knows', () => {
		for (const [code, key] of Object.entries(TEST_CODE_TO_INTERVIEW_KEY)) {
			expect(ALL_KNOWN_INTERVIEW_KEYS, `${code} → ${key}`).toContain(key);
		}
	});

	it('the reverse map round-trips', () => {
		for (const [code, key] of Object.entries(TEST_CODE_TO_INTERVIEW_KEY)) {
			expect(INTERVIEW_KEY_TO_TEST_CODE[key]).toBe(code);
		}
	});

	// Twenty-nine questionnaires existed in the collection with no entry here, and
	// moduleCoverage skips what it cannot map — so patients answered them, the
	// algorithmic report used them, and no AI report ever saw them. The live
	// collection had 46 questionnaires on 2026-08-04.
	it('maps every questionnaire in the collection', () => {
		expect(Object.keys(TEST_CODE_TO_INTERVIEW_KEY)).toHaveLength(46);
	});

	it('every mapped test_code has report logic in the generated catalog', () => {
		// The two non-diagnostic special processors have no rule-engine outcomes.
		const NO_OUTCOMES = new Set(['ADULT_BIO', 'THERAPIST_MATCH']);
		for (const code of Object.keys(TEST_CODE_TO_INTERVIEW_KEY)) {
			if (NO_OUTCOMES.has(code)) continue;
			expect(OUTCOME_CATALOG[code], `${code} missing from the outcome catalog`).toBeTruthy();
		}
	});
});

describe('rendered interview names', () => {
	it('every known key has a reader-facing label', () => {
		// Without one the report prints titleCase(key); the personality modules are
		// titled "Module B (301.83)" in Mongo, so the fallback is not acceptable.
		for (const key of ALL_KNOWN_INTERVIEW_KEYS) {
			expect(INTERVIEW_DISPLAY[key], `no display name for "${key}"`).toBeTruthy();
		}
	});

	it('orders the completed list clinically, not alphabetically', () => {
		// module_coverage.administered is sorted alphabetically for snapshot
		// stability, which put "Suicide & Self-Harm" between the B's and the D's.
		expect(
			sortInterviewKeys([
				'comprehensive_suicide_self_harm',
				'borderline_personality',
				'depression',
				'adult_biographical'
			])
		).toEqual([
			'adult_biographical',
			'depression',
			'borderline_personality',
			'comprehensive_suicide_self_harm'
		]);
	});
});

describe('diagnosisCodes consistency', () => {
	// NB: TEST_CODE_TO_DIAGNOSIS may legitimately LEAD the interview map —
	// persistent_depressive_test already carries a label while still unmapped.
	// What must never happen is a label riding a test_code that doesn't exist
	// (that is how the insomnia bug survived unnoticed).
	it('no diagnosis label rides the dead insomnia_disorder_test code', () => {
		expect(TEST_CODE_TO_DIAGNOSIS.insomnia_disorder_test).toBeUndefined();
	});

	it('every diagnosis label resolves to real DSM/ICD codes', () => {
		for (const [code, label] of Object.entries(TEST_CODE_TO_DIAGNOSIS)) {
			const { dsm_code, icd_11_code } = codesFor(label);
			expect(dsm_code, `${code} → "${label}" missing from DIAGNOSIS_CODES`).toBeTruthy();
			expect(icd_11_code, `${code} → "${label}" missing from DIAGNOSIS_CODES`).toBeTruthy();
		}
	});

	it('ADHD carries its DSM-5-TR / ICD-11 codes', () => {
		expect(DIAGNOSIS_CODES['Attention-Deficit/Hyperactivity Disorder']).toEqual({
			dsm_code: '314.01',
			icd_11_code: '6A05'
		});
	});

	it('the insomnia label rides the corrected test_code', () => {
		expect(TEST_CODE_TO_DIAGNOSIS.sleep_disorder_test).toBe('Insomnia Disorder');
		expect(TEST_CODE_TO_DIAGNOSIS.insomnia_disorder_test).toBeUndefined();
	});
});

describe('rendered §2 interview list', () => {
	it('includes the suicide/self-harm module when administered', async () => {
		const { buildReportData } = await import('../buildReportData.js');
		const d = buildReportData({
			sections: {},
			format: 'comprehensive',
			language: 'en',
			patientId: '11397',
			agentInput: {
				module_coverage: {
					administered: ['adult_biographical', 'depression', 'comprehensive_suicide_self_harm']
				}
			}
		});
		// An earlier renderer filter silently dropped this entry while the
		// agent's own §2 prose listed it — the PDF contradicted the report body.
		expect(d.interviews).toContain('Suicide & Self-Harm');
		expect(d.interviews).toEqual(['Adult Biographical', 'Depression', 'Suicide & Self-Harm']);
	});
});
