// `patientProfile.preferredLanguage` is a Mongo enum of ['en','fr'] with a default
// of 'en'. The default only covers `undefined`: an empty string FAILS enum
// validation (and used to 500 the entire create-patient request when an admin left
// the intake picker untouched), and `null` stores as null, bypassing the default.
//
// So every write path funnels through normalizeLanguage(). These tests pin that
// contract — in particular that nothing which reaches Mongo can be anything other
// than 'en' or 'fr'.

import { describe, it, expect } from 'vitest';
import {
	normalizeLanguage,
	languageLabel,
	SUPPORTED_LANGUAGES,
	DEFAULT_LANGUAGE
} from './language.js';

describe('normalizeLanguage', () => {
	it('passes supported codes through unchanged', () => {
		expect(normalizeLanguage('en')).toBe('en');
		expect(normalizeLanguage('fr')).toBe('fr');
	});

	it('defaults every empty-ish value to English', () => {
		for (const v of ['', '   ', null, undefined, false, 0, NaN, {}, []]) {
			expect(normalizeLanguage(v), `input: ${JSON.stringify(v)}`).toBe('en');
		}
	});

	it('defaults the placeholder strings the UI and API used to emit', () => {
		// These are the literal values that used to reach the DB / the agent.
		for (const v of ['N/A', 'n/a', 'Not specified', 'Not provided', 'null', 'undefined']) {
			expect(normalizeLanguage(v), `input: ${v}`).toBe('en');
		}
	});

	it('is case- and whitespace-insensitive', () => {
		expect(normalizeLanguage('FR')).toBe('fr');
		expect(normalizeLanguage('  Fr  ')).toBe('fr');
		expect(normalizeLanguage('EN')).toBe('en');
	});

	it('strips region tags', () => {
		expect(normalizeLanguage('fr-CA')).toBe('fr');
		expect(normalizeLanguage('fr_CA')).toBe('fr');
		expect(normalizeLanguage('en-US')).toBe('en');
	});

	it('understands the legacy full-name spellings', () => {
		expect(normalizeLanguage('French')).toBe('fr');
		expect(normalizeLanguage('français')).toBe('fr');
		expect(normalizeLanguage('francais')).toBe('fr');
		expect(normalizeLanguage('English')).toBe('en');
	});

	it('never returns a value outside the Mongo enum', () => {
		const inputs = [
			'',
			null,
			undefined,
			'N/A',
			'de',
			'es',
			'zh-Hans',
			'fr',
			'en',
			'French',
			42,
			{ en: 1 },
			['fr']
		];
		for (const v of inputs) {
			expect(SUPPORTED_LANGUAGES, `input: ${JSON.stringify(v)}`).toContain(normalizeLanguage(v));
		}
	});

	it('honours an explicit fallback', () => {
		expect(normalizeLanguage('', 'fr')).toBe('fr');
		expect(normalizeLanguage('en', 'fr')).toBe('en');
	});

	it('DEFAULT_LANGUAGE is English and is itself supported', () => {
		expect(DEFAULT_LANGUAGE).toBe('en');
		expect(SUPPORTED_LANGUAGES).toContain(DEFAULT_LANGUAGE);
	});
});

describe('languageLabel', () => {
	it('renders a human label, never a raw code or "N/A"', () => {
		expect(languageLabel('fr')).toBe('French');
		expect(languageLabel('fr-CA')).toBe('French');
		expect(languageLabel('en')).toBe('English');
		// The intake confirm step used to print "N/A" here.
		expect(languageLabel('')).toBe('English');
		expect(languageLabel(null)).toBe('English');
		expect(languageLabel(undefined)).toBe('English');
	});
});
