import { describe, it, expect } from 'vitest';
import { stripDiagnosticCodes } from './diagnosticCodes.js';

// Every "corpus" string below is a real `report_sections[].text.en` block from
// the questionnaire corpus in the cct database, with {first_name} left in place
// (the substitution happens after this runs).
describe('stripDiagnosticCodes — corpus verdict sentences', () => {
	it('strips a DSM numeric, an ICD-10 alpha and a parenthesised ICD-11 code', () => {
		expect(
			stripDiagnosticCodes(
				'{first_name} meets DSM-5 diagnosis for Body Dysmorphic Disorder 300.07 (F45.22) ICD11: (6B21).'
			)
		).toBe('{first_name} meets DSM-5 diagnosis for Body Dysmorphic Disorder.');
	});

	it('handles the negative form the subthreshold narrative quotes', () => {
		expect(
			stripDiagnosticCodes(
				'{first_name} fails to meet DSM-5 criteria for Anorexia Nervosa 307.1 (F50.01) ICD11: (6B80)'
			)
		).toBe('{first_name} fails to meet DSM-5 criteria for Anorexia Nervosa');
	});

	it('drops an ICD11 label left with nothing after it', () => {
		expect(
			stripDiagnosticCodes(
				'{first_name} meets DSM-5 criteria for Borderline Personality Disorder (301.83) (F60.31) ICD11: '
			)
		).toBe('{first_name} meets DSM-5 criteria for Borderline Personality Disorder');
	});

	it('handles a lone parenthesised ICD-10 code', () => {
		expect(
			stripDiagnosticCodes('{first_name} meets DSM-5 criteria for Adult ADHD Combined Type (F90.2).')
		).toBe('{first_name} meets DSM-5 criteria for Adult ADHD Combined Type.');
	});

	// Both of these came out wrong on the first pass over patient 5968's real
	// payload: the first left "ICD11:" stranded mid-sentence because the code
	// after it was removed on its own, the second left a doubled full stop.
	it('removes a label together with its code, mid-sentence', () => {
		expect(
			stripDiagnosticCodes(
				'Gray meets DSM-5 criteria for Depersonalization/Derealization Disorder 300.6 (F48.1) ICD11: (6B66) Average symptom severity was Moderate.'
			)
		).toBe(
			'Gray meets DSM-5 criteria for Depersonalization/Derealization Disorder Average symptom severity was Moderate.'
		);
	});

	it('does not leave a doubled full stop when the sentence already ended', () => {
		expect(
			stripDiagnosticCodes(
				'Gray does not meet DSM-5 criteria for Adjustment Disorder. 309.28(F43.23) ICD11: (6B43). The average reported severity of distress was Moderate.'
			)
		).toBe(
			'Gray does not meet DSM-5 criteria for Adjustment Disorder. The average reported severity of distress was Moderate.'
		);
	});

	it('keeps a trailing qualifier that follows the code', () => {
		expect(
			stripDiagnosticCodes('Gray meets DSM-5 criteria for Delusional Disorder 297.1 (F22.0) Mixed Type.')
		).toBe('Gray meets DSM-5 criteria for Delusional Disorder Mixed Type.');
	});

	it('strips the French corpus form too', () => {
		expect(
			stripDiagnosticCodes(
				'{first_name} répond aux critères diagnostiques du DSM-5 pour le trouble dysmorphique corporel 300.07 (F45.22) CIM-11 : (6B21).'
			)
		).toBe(
			'{first_name} répond aux critères diagnostiques du DSM-5 pour le trouble dysmorphique corporel.'
		);
	});
});

describe('stripDiagnosticCodes — what must survive', () => {
	it('keeps the manual name: "DSM-5 criteria" is ordinary clinical prose', () => {
		const t = 'Full DSM-5 criteria for ADHD, Combined Type were met.';
		expect(stripDiagnosticCodes(t)).toBe(t);
	});

	it('returns code-free prose byte-for-byte unchanged', () => {
		const t =
			'Sarah reports excessive, difficult-to-control worry occurring more days than not for at least six months.';
		expect(stripDiagnosticCodes(t)).toBe(t);
	});

	// The anorexia and bulimia summaries carry real quantities that match the
	// DSM numeric shape exactly. Losing a body weight would be a clinical error,
	// not a formatting one.
	it('keeps a three-digit weight with its unit', () => {
		const t = 'Reported weight is 105.5 lbs against a minimum expected 112.0 lbs.';
		expect(stripDiagnosticCodes(t)).toBe(t);
	});

	it('keeps a BMI and a severity mean', () => {
		const t = 'BMI 16.5 with an average symptom severity of 2.29.';
		expect(stripDiagnosticCodes(t)).toBe(t);
	});

	it('keeps a medication dose', () => {
		const t = 'Quetiapine 100mg every evening; Desvenlafaxine 50mg every morning.';
		expect(stripDiagnosticCodes(t)).toBe(t);
	});

	it('leaves non-strings alone', () => {
		expect(stripDiagnosticCodes(null)).toBe('');
		expect(stripDiagnosticCodes(undefined)).toBe('');
		expect(stripDiagnosticCodes('')).toBe('');
	});
});
