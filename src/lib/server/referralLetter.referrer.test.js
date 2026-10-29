import { describe, it, expect } from 'vitest';
import { referringClinicianFrom, salutationFor, tokenizeReferrer } from './referralLetter.js';

describe('referral letter addressee (standard §2.1)', () => {
	const name = (v) => referringClinicianFrom(v)?.referringClinician.name;

	it('uses the primary physician exactly as supplied (§3.1)', () => {
		expect(name('Jane Smith')).toBe('Jane Smith');
		expect(name('Dr. Jane Smith')).toBe('Dr. Jane Smith');
		expect(name('  Mrs Smith ')).toBe('Mrs Smith');
	});

	it('empty or "none" entries leave the placeholder', () => {
		for (const v of [null, undefined, '', '  ', 'None', 'n/a', 'Dr. n/a', 'Dr unknown', 'Dr.', 42]) {
			expect(referringClinicianFrom(v)).toBeUndefined();
		}
	});

	it('tokenizes with the redaction map; an uncovered name never leaves', () => {
		const map = [{ find: 'Smith', token: '⟦NAME_OF_DOCTOR_AB12⟧', value: 'Smith' }];
		const meta = referringClinicianFrom('Jane Smith');
		expect(tokenizeReferrer(meta, map)?.referringClinician.name).toBe('Jane ⟦NAME_OF_DOCTOR_AB12⟧');
		expect(tokenizeReferrer(meta, [])).toBeUndefined();
		expect(tokenizeReferrer(undefined, map)).toBeUndefined();
	});

	it('salutation: title and surname, full name when untitled, placeholder when absent (§3.3)', () => {
		expect(salutationFor('Dr. Raj Singh')).toBe('Dear Dr. Singh,');
		expect(salutationFor('Dr Singh')).toBe('Dear Dr Singh,');
		expect(salutationFor('Mrs Ann Lee')).toBe('Dear Mrs Lee,');
		expect(salutationFor('Raj Singh')).toBe('Dear Raj Singh,');
		expect(salutationFor('[Referring clinician name]')).toBe('Dear Dr. [Referring clinician],');
		expect(salutationFor(undefined)).toBe('Dear Dr. [Referring clinician],');
	});
});
