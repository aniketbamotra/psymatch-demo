// The AI report and the algorithmic report used to normalise stored answers
// differently, and the rule engine is sensitive to it: 67 comparisons across the
// live report logics test a response against a STRING numerical constant
// ({"type":"numerical","value":"0"}) and the evaluator's `==` is `===`.
//
// Measured on four real patients on 2026-08-04, 13 of 117 test evaluations fired
// a DIFFERENT outcome in the two paths — a patient whose algorithmic report said
// "meets DSM-5 criteria for a Major Depressive Episode" had an AI report told the
// criteria were not met, and three patients were Agoraphobia-positive in one
// report and negative in the other.

import { describe, it, expect } from 'vitest';
import { normalizeRuleEngineResponses } from './reportResponses.js';

describe('normalizeRuleEngineResponses', () => {
	it('does NOT coerce numeric strings to numbers', () => {
		// This is the whole bug. `"0" === "0"` is what the report logic expects;
		// `0 === "0"` is false and silently flips the outcome.
		const out = normalizeRuleEngineResponses([{ questionId: 'q1', value: '0' }]);
		expect(out.q1).toBe('0');
		expect(typeof out.q1).toBe('string');
	});

	it('unwraps {value,text} answers to the stored value', () => {
		const out = normalizeRuleEngineResponses([
			{ questionId: 'q1', value: { value: '3', text: 'Quite a bit' } }
		]);
		expect(out.q1).toBe('3');
	});

	it('keeps the whole object when value is falsy — the algorithmic behaviour', () => {
		// `value.value || value`, deliberately not `??`. A stored {value: 0} keeps
		// the object, which fails `> 0` and fails `=== "0"` — how a "not at all"
		// answer is meant to score. Switching to `??` re-scores every interview.
		const out = normalizeRuleEngineResponses([{ questionId: 'q1', value: { value: 0 } }]);
		expect(out.q1).toEqual({ value: 0 });
	});

	it('flattens the anorexia composite BMI answer, and only for that test', () => {
		const q11 = { weight: 132, weightUnit: 'lbs', height: 5.58, bmi: 20.67 };
		expect(
			normalizeRuleEngineResponses([{ questionId: 'q11', value: q11 }], 'anorexia_test').q11
		).toBe(20.67);
		// Any other test keeps the object; only anorexia's logic reads q11 as a number.
		expect(
			normalizeRuleEngineResponses([{ questionId: 'q11', value: q11 }], 'panic_test').q11
		).toEqual(q11);
	});

	it('accepts either the raw response array or an already-keyed object', () => {
		expect(normalizeRuleEngineResponses([{ questionId: 'q1', value: '2' }])).toEqual({ q1: '2' });
		expect(normalizeRuleEngineResponses({ q1: '2' })).toEqual({ q1: '2' });
		expect(normalizeRuleEngineResponses(null)).toEqual({});
	});

	it('leaves nulls and plain scalars alone', () => {
		const out = normalizeRuleEngineResponses([
			{ questionId: 'q1', value: null },
			{ questionId: 'q2', value: 4 },
			{ questionId: 'q3', value: 'free text' }
		]);
		expect(out).toEqual({ q1: null, q2: 4, q3: 'free text' });
	});
});
