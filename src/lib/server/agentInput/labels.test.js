// The adult-bio checkbox groups persist the i18n KEY of the chosen option, not
// its text, so `presenting_concerns` shipped to the agent as a list of dotted
// paths and §1's Primary Concerns rendered them verbatim (seen 2026-07-30):
//
//   Questionnaire.Config.AdultBio.reasons_for_cct.options.0;
//   Questionnaire.Config.AdultBio.reasons_for_cct.options.6; …
//
// `family_background.religion` stores keys the same way.

import { describe, it, expect } from 'vitest';
import { labelFor, resolveLabels } from './labels.js';

const K = 'Questionnaire.Config.AdultBio.reasons_for_cct.options';

describe('labelFor', () => {
	it('resolves the concern keys seen in the broken report', () => {
		expect(labelFor(`${K}.0`)).toBe('Anxiety');
		expect(labelFor(`${K}.4`)).toBe('Obsessive Compulsive');
		expect(labelFor(`${K}.6`)).toBe('Eating/Food Intake');
		expect(labelFor(`${K}.7`)).toBe('Weight Management');
		expect(labelFor(`${K}.15`)).toBe('Relationship Related');
	});

	it('leaves ordinary prose alone', () => {
		// Free text can contain dots; it must never be mistaken for a key.
		expect(labelFor('OCD, one year, also saw Dr. Paul Grof')).toBeNull();
		expect(labelFor('Dr.Grof')).toBeNull(); // key-shaped, but not in the dictionary
		expect(labelFor('3.5')).toBeNull();
		expect(labelFor('')).toBeNull();
	});

	it('returns null for non-strings and unresolvable keys', () => {
		expect(labelFor(null)).toBeNull();
		expect(labelFor(7)).toBeNull();
		expect(labelFor('Questionnaire.Nope.Missing.42')).toBeNull();
	});

	it('does not resolve a key whose target is an object, not a label', () => {
		expect(labelFor('Questionnaire.Config.AdultBio')).toBeNull();
	});
});

describe('resolveLabels', () => {
	it('resolves every key in a checkbox answer array', () => {
		expect(resolveLabels([`${K}.0`, `${K}.6`, `${K}.15`])).toEqual([
			'Anxiety',
			'Eating/Food Intake',
			'Relationship Related'
		]);
	});

	it('walks nested objects and preserves non-key values exactly', () => {
		const answer = {
			answer: 'true',
			details: { reason: 'OCD', length: 'one year', count: 3, missing: null },
			tags: [`${K}.4`, 'free text']
		};
		expect(resolveLabels(answer)).toEqual({
			answer: 'true',
			details: { reason: 'OCD', length: 'one year', count: 3, missing: null },
			tags: ['Obsessive Compulsive', 'free text']
		});
	});

	it('passes primitives straight through', () => {
		expect(resolveLabels(null)).toBeNull();
		expect(resolveLabels(42)).toBe(42);
		expect(resolveLabels(false)).toBe(false);
	});
});
