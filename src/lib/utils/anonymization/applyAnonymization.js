// src/lib/utils/anonymization/applyAnonymization.js

/**
 * Perform deep string replacement on any object.
 * Exported so the agentic redCode flow can reuse the same engine for forward
 * (value→token) and reverse (token→value) substitution.
 */
export function deepReplace(obj, searchReplaceArr) {
	if (obj === null || obj === undefined) return obj;

	if (typeof obj === 'string') {
		// Safeguard: Do not replace system localization keys
		if (obj.startsWith('Questionnaire.Config.')) return obj;

		let result = obj;
		for (const { find, replace, caseSensitive } of searchReplaceArr) {
			if (!find || !replace) continue;
			// Escape regex metacharacters so `find` is matched LITERALLY.
			//
			// The character class here used to be malformed — it closed early on its
			// own `\\`, so the whole expression matched almost nothing and `find`
			// reached `new RegExp()` unescaped. Any PHI value containing a
			// metacharacter was then compiled as a pattern rather than a literal:
			// "(613) 879-5096" became the group `(613)` followed by " 879-5096", which
			// matches the number WITHOUT its parentheses and so never replaced the
			// stored value. "Smith+Jones" matched "SmithJones". Those values passed
			// through redaction untouched, and the leak guard only re-checks the
			// patient's name, phone and email — so a profile rule for an address,
			// employer or clinic containing brackets failed silently.
			const escapedFind = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

			// Only match whole words for alphanumeric boundaries to prevent corrupting
			// larger words (e.g. 'A' -> 'Miller' replacing the 'A' in 'AdultBio').
			// Tested against the RAW value: a `find` starting with "(" has no word
			// boundary before it.
			const prefix = /^\w/.test(find) ? '\\b' : '';
			const suffix = /\w$/.test(find) ? '\\b' : '';

			const regex = new RegExp(prefix + escapedFind + suffix, caseSensitive ? 'g' : 'gi');
			// `replace` is a token/fake value, never a pattern — `$` in it must not be
			// read as a replacement directive.
			result = result.replace(regex, () => replace);
		}
		return result;
	}

	if (Array.isArray(obj)) {
		return obj.map((item) => deepReplace(item, searchReplaceArr));
	}

	if (typeof obj === 'object') {
		const newObj = {};
		for (const [key, value] of Object.entries(obj)) {
			// Do not replace keys, only values
			newObj[key] = deepReplace(value, searchReplaceArr);
		}
		return newObj;
	}

	return obj;
}

/**
 * Walk a dot-path (e.g. "q18.0.doctor") and set the leaf value.
 * Handles numeric keys as array indices.
 */
function setDotPath(obj, dotPath, value) {
	const parts = dotPath.split('.');
	let cur = obj;
	for (let i = 0; i < parts.length - 1; i++) {
		const key = parts[i];
		const idx = Number(key);
		const next = isNaN(idx) ? cur[key] : cur[idx];
		if (next == null || typeof next !== 'object') return;
		cur = next;
	}
	const lastKey = parts[parts.length - 1];
	const lastIdx = Number(lastKey);
	if (!isNaN(lastIdx)) cur[lastIdx] = value;
	else if (cur[lastKey] !== undefined) cur[lastKey] = value;
}

/**
 * Apply Anonymization Profile to patient info and report data in-place.
 */
export function applyAnonymizationProfile(patientInfo, reportsData) {
	const profile = patientInfo.anonymizationProfile;

	if (!profile || profile.status !== 'completed') {
		return { patientInfo, reportsData };
	}

	// --- TIER 1: Direct Field Rewrites ---
	const adultBioReport = reportsData.find(
		(r) => r.assignment?.testCode === 'ADULT_BIO' || r.testResult?.testCode === 'ADULT_BIO'
	);
	const adultBioRes = adultBioReport?.responses;

	for (const [dotPath, value] of Object.entries(profile.fieldRewrites || {})) {
		if (dotPath.startsWith('patientInfo.')) {
			const key = dotPath.slice('patientInfo.'.length);
			if (patientInfo[key] !== undefined) patientInfo[key] = value;
		} else if (dotPath.startsWith('ADULT_BIO.') && adultBioRes) {
			setDotPath(adultBioRes, dotPath.slice('ADULT_BIO.'.length), value);
		}
	}

	// --- TIER 2: SearchReplace (cross-questionnaire catch-all) ---
	if (profile.searchReplace?.length > 0) {
		patientInfo.intakeNote = deepReplace(patientInfo.intakeNote, profile.searchReplace);
		for (let i = 0; i < reportsData.length; i++) {
			reportsData[i].responses = deepReplace(reportsData[i].responses, profile.searchReplace);
		}
	}

	return { patientInfo, reportsData };
}
