/** The locales the app actually supports. `patientProfile.preferredLanguage` is an enum of these. */
export const SUPPORTED_LANGUAGES = ['en', 'fr'];

/** What a patient gets when no language was chosen. */
export const DEFAULT_LANGUAGE = 'en';

/** Legacy/display spellings that have shown up in place of a code. */
const LANGUAGE_ALIASES = {
	english: 'en',
	anglais: 'en',
	french: 'fr',
	francais: 'fr',
	français: 'fr'
};

/**
 * Coerce anything language-ish to a supported locale code, defaulting to English.
 *
 * Every patient must end up with a real language: the AI report picks its variant
 * from it, the welcome/reset emails pick their template from it, and the TOS modal
 * picks its wording from it. On top of that `patientProfile.preferredLanguage` is a
 * Mongo enum — an empty string FAILS validation and takes the whole create-user
 * request down with it, and `null` slips past the schema default. So every write
 * path funnels through here and anything unrecognised ('', null, 'N/A',
 * 'Not specified') becomes 'en'.
 *
 * @param {unknown} value
 * @param {string} [fallback]
 * @returns {'en'|'fr'|string}
 */
export function normalizeLanguage(value, fallback = DEFAULT_LANGUAGE) {
	const raw = String(value ?? '')
		.trim()
		.toLowerCase();
	if (LANGUAGE_ALIASES[raw]) return LANGUAGE_ALIASES[raw];
	// Accept region-tagged locales: en-CA -> en, fr_CA -> fr.
	const base = raw.split(/[-_]/)[0];
	return SUPPORTED_LANGUAGES.includes(base) ? base : fallback;
}

/**
 * Human label for a language code, for read-only display.
 * @param {unknown} value
 * @returns {string}
 */
export function languageLabel(value) {
	return normalizeLanguage(value) === 'fr' ? 'French' : 'English';
}

/**
 * Helper to get localized text from a multilingual object or string.
 * @param {string|object} content - The text content (string or {en: '...', fr: '...'})
 * @param {string} locale - The target locale (e.g. 'fr')
 * @returns {string} - The localized string or fallback
 */
export function getLocalizedText(content, locale) {
	if (!content) return '';

	// If it's just a string, return it (legacy support)
	if (typeof content === 'string') return content;

	// If it's an object, try to get the target locale, then base language code, else fallback to 'en'
	if (typeof content === 'object') {
		const baseLocale = locale?.split('-')[0];
		return content[locale] || content[baseLocale] || content['en'] || '';
	}

	return '';
}
