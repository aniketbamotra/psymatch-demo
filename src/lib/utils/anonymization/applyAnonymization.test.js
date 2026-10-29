// deepReplace is the single substitution engine behind BOTH redaction paths —
// the "Redact PII" standard report and the reversible ⟦TOKEN⟧ pass that runs
// before a case is dispatched to the agent.
//
// Its metacharacter escape was a no-op: the character class closed early on its
// own `\\`, so `find` reached `new RegExp()` unescaped and any PHI value holding
// a metacharacter compiled as a pattern instead of a literal. Found 2026-08-04
// when every dispatch for patient 6943010e blocked with
// "PHI leak guard: residual identifier(s) after redaction: (613) 879-5096" —
// `(613)` had been compiled as a capture group, so the regex matched the number
// only WITHOUT its parentheses and never replaced the stored value.
//
// The leak guard re-checks the patient's name, phone and email, so that case
// failed loudly. Nothing re-checks the profile's other rules, so an address,
// employer or clinic containing brackets would have passed through in silence.

import { describe, it, expect } from 'vitest';
import { deepReplace } from './applyAnonymization.js';

const pair = (find, replace) => [{ find, replace }];

describe('deepReplace escapes regex metacharacters in the search value', () => {
	it('redacts a parenthesised phone number', () => {
		expect(
			deepReplace('Reach me at (613) 879-5096 any time.', pair('(613) 879-5096', '⟦PHONE_A1⟧'))
		).toBe('Reach me at ⟦PHONE_A1⟧ any time.');
	});

	it.each([
		['(613) 879-5096', 'call (613) 879-5096 now'],
		['Smith+Jones', 'employed at Smith+Jones'],
		['St. Mary’s (East)', 'treated at St. Mary’s (East)'],
		['Dr. Paul Grof', 'referred by Dr. Paul Grof'],
		['Apt 4[b]', 'lives at Apt 4[b]'],
		['who? clinic', 'the who? clinic']
	])('redacts %s', (find, text) => {
		const out = deepReplace(text, pair(find, '⟦X⟧'));
		expect(out).toContain('⟦X⟧');
		expect(out).not.toContain(find);
	});

	it('does not match a value the pattern would only have matched as a regex', () => {
		// The old behaviour: `(613) 879-5096` matched the number WITHOUT parentheses.
		// Escaped, it must match the literal form and leave the bare form alone.
		expect(deepReplace('613 879-5096', pair('(613) 879-5096', '⟦X⟧'))).toBe('613 879-5096');
	});

	it('keeps the word-boundary guard that stops partial-word corruption', () => {
		// The reason the boundaries exist: 'A' -> 'Miller' must not rewrite 'AdultBio'.
		expect(deepReplace('AdultBio', pair('A', 'Miller'))).toBe('AdultBio');
		expect(deepReplace('A said so', pair('A', 'Miller'))).toBe('Miller said so');
	});

	it('treats $ in the replacement as text, not a substitution directive', () => {
		// `$&` in a replacement string means "the matched text"; a token or fake
		// value containing one must survive verbatim.
		expect(deepReplace('paid Gray', pair('Gray', '$& USD'))).toBe('paid $& USD');
	});

	it('leaves i18n option keys untouched', () => {
		// Answer values are stored as dotted i18n keys; rewriting one silently
		// changes what the report says the patient answered.
		const key = 'Questionnaire.Config.AdultBio.reasons_for_cct.options.4';
		expect(deepReplace(key, pair('4', '⟦X⟧'))).toBe(key);
	});

	it('walks nested objects and arrays, values only — never keys', () => {
		const out = deepReplace(
			{ Gray: 'k', notes: ['seen by Gray', { by: 'Gray' }] },
			pair('Gray', '⟦NAME_A1⟧')
		);
		expect(out).toEqual({
			Gray: 'k',
			notes: ['seen by ⟦NAME_A1⟧', { by: '⟦NAME_A1⟧' }]
		});
	});

	it('round-trips forward then reverse', () => {
		// The agent flow tokenizes on the way out and de-tokenizes the returned
		// report; both directions use this same engine.
		const phone = '(613) 879-5096';
		const forward = deepReplace(`Home ${phone}.`, pair(phone, '⟦PHONE_A1⟧'));
		expect(deepReplace(forward, pair('⟦PHONE_A1⟧', phone))).toBe(`Home ${phone}.`);
	});
});
