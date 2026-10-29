import en from '$lib/i18n/en.json';
import fr from '$lib/i18n/fr.json';

const translations = { en, fr };

/**
 * Get a translated string by dot-path key for a given locale.
 * Supports {{variable}} interpolation.
 * Falls back to English if key is missing in target locale.
 */
export function t(locale, key, vars = {}) {
	const lang = translations[locale] || translations['en'];
	const value =
		key.split('.').reduce((obj, k) => obj?.[k], lang) ||
		key.split('.').reduce((obj, k) => obj?.[k], translations['en']) ||
		key;

	return typeof value === 'string'
		? value.replace(/\{\{(\w+)\}\}/g, (_, name) => vars[name] ?? '')
		: key;
}
