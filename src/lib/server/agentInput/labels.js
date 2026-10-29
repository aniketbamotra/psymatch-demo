import en from '../../i18n/en.json';

// Some questionnaire options are persisted as i18n KEYS rather than as text.
// The adult-bio checkbox groups are the notable case: a selected concern is
// stored as 'Questionnaire.Config.AdultBio.reasons_for_cct.options.4', not as
// "Obsessive Compulsive". Those keys reached the agent verbatim, so
// `presenting_concerns` arrived as a list of dotted paths — unusable, which is
// why the model quietly ignored it and filled §1's Primary Concerns from the
// free-text narrative instead (caught 2026-07-28). `family_background.religion`
// has the same shape.
//
// Reports are authored in English and translated afterwards, so the English
// dictionary is the correct source here.

// Cheap pre-filter; a value only resolves if the dictionary actually holds a
// string at that path, so ordinary prose ("Dr. Grof", "3.5") can never match.
const KEY_SHAPE = /^[A-Za-z][\w-]*(\.[\w-]+)+$/;

function lookup(key) {
	let node = en;
	for (const part of key.split('.')) {
		if (node == null || typeof node !== 'object') return null;
		node = node[part];
	}
	return typeof node === 'string' ? node : null;
}

/**
 * Resolve an i18n key to its English label.
 * @returns {string|null} null when the value isn't a resolvable key.
 */
export function labelFor(value) {
	if (typeof value !== 'string') return null;
	const key = value.trim();
	if (!KEY_SHAPE.test(key)) return null;
	return lookup(key);
}

/**
 * Deep-resolve every i18n key inside a response value, leaving everything else
 * exactly as it was (including numbers, booleans, nulls and free text).
 */
export function resolveLabels(value) {
	if (Array.isArray(value)) return value.map(resolveLabels);
	if (value && typeof value === 'object') {
		const out = {};
		for (const [k, v] of Object.entries(value)) out[k] = resolveLabels(v);
		return out;
	}
	return labelFor(value) ?? value;
}
