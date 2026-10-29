// Pins how the patient is named and described in a report.
//
// Two defects found in clinical review on 2026-07-28, both on the same patient:
//   1. Gender/pronouns came from `User.gender` — a registration-time pronoun
//      stem that DEFAULTS to 'They' — so a female patient was reported as
//      "Non-binary (they/them)" in every section of the report.
//   2. Prose repeated the full legal name because no first name was ever sent.
//
// The adult biographical interview asks both questions directly; those answers
// are the source of truth and must win.

import { describe, it, expect } from 'vitest';
import { resolveIdentity } from './patient.js';

const user = { fullName: 'Daad Khouri', gender: 'They' };

describe('resolveIdentity — gender and pronouns', () => {
	it('prefers the adult-bio answers over the registration enum', () => {
		const id = resolveIdentity(user, { gender: 'Female', pronouns: 'she/her' });
		expect(id.gender).toBe('Female');
		expect(id.pronouns).toBe('she/her');
	});

	it('falls back to the registration enum when no bio interview exists', () => {
		const id = resolveIdentity({ fullName: 'A B', gender: 'He' }, null);
		expect(id.gender).toBe('Male');
		expect(id.pronouns).toBe('he/him');
	});

	it('normalizes the bio label to the spacing used elsewhere in reports', () => {
		expect(resolveIdentity(user, { gender: 'Non Binary' }).gender).toBe('Non-binary');
	});

	it('passes a bio gender through even when the enum disagrees', () => {
		// The enum can only express four values; the interview has its own set.
		expect(resolveIdentity({ ...user, gender: 'She' }, { gender: 'Trans' }).gender).toBe('Trans');
	});

	it('keeps the fallback pronouns when the patient picked "other"', () => {
		// "other" is the select's escape hatch — never printable as a pronoun set.
		const id = resolveIdentity({ fullName: 'A B', gender: 'She' }, { pronouns: 'other' });
		expect(id.pronouns).toBe('she/her');
	});

	it('does not let a bio answer for one field clobber the other', () => {
		const id = resolveIdentity(user, { pronouns: 'she/her' });
		expect(id.pronouns).toBe('she/her');
		expect(id.gender).toBe('Non-binary'); // untouched: bio supplied no gender
	});
});

describe('resolveIdentity — name', () => {
	it('sends the full legal name and a separate first name', () => {
		const id = resolveIdentity(user, null);
		expect(id.name).toBe('Daad Khouri');
		expect(id.first_name).toBe('Daad');
	});

	it('prefers the structured bio first name over splitting the full name', () => {
		const id = resolveIdentity(
			{ fullName: 'Mary-Jane Watson Parker', gender: 'She' },
			{
				name: { firstName: 'MJ' }
			}
		);
		expect(id.first_name).toBe('MJ');
		expect(id.name).toBe('Mary-Jane Watson Parker');
	});

	it('ignores a blank bio first name', () => {
		expect(resolveIdentity(user, { name: { firstName: '   ' } }).first_name).toBe('Daad');
	});

	it('survives a single-word or missing name', () => {
		expect(resolveIdentity({ fullName: 'Cher', gender: 'She' }).first_name).toBe('Cher');
		expect(resolveIdentity({ gender: 'She' }).first_name).toBeNull();
		expect(resolveIdentity({ gender: 'She' }).name).toBeNull();
	});
});
