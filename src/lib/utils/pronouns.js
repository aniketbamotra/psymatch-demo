/**
 * Maps gender to appropriate pronouns
 * @param {string} gender - 'He', 'She', 'They', or 'Ze'
 * @returns {Object} Object containing different pronoun forms
 */
export function getPronounsByGender(gender) {
	const pronounMap = {
		He: {
			subject: 'he',
			object: 'him',
			possessive: 'his',
			possessiveAdjective: 'his'
		},
		She: {
			subject: 'she',
			object: 'her',
			possessive: 'hers',
			possessiveAdjective: 'her'
		},
		They: {
			subject: 'they',
			object: 'them',
			possessive: 'theirs',
			possessiveAdjective: 'their'
		},
		Ze: {
			subject: 'ze',
			object: 'zir',
			possessive: 'zirs',
			possessiveAdjective: 'zir'
		}
	};

	return pronounMap[gender] || pronounMap['They']; // Default to 'They' if gender not found
}

/**
 * Replaces pronoun placeholders in text with appropriate pronouns
 * @param {string} text - Text containing placeholders
 * @param {string} gender - 'He', 'She', 'They', or 'Ze'
 * @param {string} firstName - Patient's first name
 * @returns {string} Text with replaced pronouns
 */
export function replacePronounPlaceholders(text, gender, firstName) {
	const pronouns = getPronounsByGender(gender);

	return text
		.replace(/{appropriate_subject_pronoun}/g, pronouns.subject)
		.replace(/{appropriate_pronoun}/g, pronouns.object)
		.replace(/{adjective_possessive}/g, pronouns.possessiveAdjective)
		.replace(/{first_name}/g, firstName);
}

/**
 * Example usage:
 * const text = "{first_name} reported that {appropriate_subject_pronoun} felt tired and {adjective_possessive} mood was low";
 * const result = replacePronounPlaceholders(text, 'She', 'Jane');
 * // Result: "Jane reported that she felt tired and her mood was low"
 */
