// src/lib/utils/anonymization/phoneGenerator.js

/**
 * Generate a sequential fake phone number.
 * index 0 → "111-111-1111", 1 → "222-222-2222", 2 → "333-333-3333", etc.
 * @param {number} index - 0-based sequential index
 * @returns {string}
 */
export function generatePhone(index) {
	const d = String((index % 9) + 1);
	return `${d}${d}${d}-${d}${d}${d}-${d}${d}${d}${d}`;
}
