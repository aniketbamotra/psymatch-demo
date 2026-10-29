// src/lib/utils/anonymization/nameGenerator.js
// SHARED PSEUDONYM LISTS - Used for all name replacements
const FEMALE_FIRST_NAMES = [
	"Emma", "Olivia", "Ava", "Sophia", "Isabella", "Mia", "Charlotte",
	"Amelia", "Harper", "Evelyn", "Abigail", "Emily", "Elizabeth", "Sofia"
];
const MALE_FIRST_NAMES = [
	"Liam", "Noah", "Oliver", "James", "Elijah", "William", "Henry",
	"Lucas", "Benjamin", "Theodore", "Jack", "Levi", "Alexander", "Mason"
];
const NEUTRAL_FIRST_NAMES = [
	"Alex", "Jordan", "Riley", "Casey", "Morgan", "Quinn", "Skyler", "Rowan",
	"Taylor", "Sage", "Bailey", "Dakota", "River", "Parker"
];
const LAST_NAMES = [
	"Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller",
	"Davis", "Rodriguez", "Martinez", "Anderson", "Taylor", "Thomas", "Moore"
];

/**
 * Creates a simple hash from a string
 */
function hashCode(str) {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		hash = ((hash << 5) - hash) + str.charCodeAt(i);
		hash |= 0;
	}
	return hash;
}

/**
 * Generate a deterministic pseudonym based on patient ID + gender
 * @param {string} patientId - MongoDB ObjectId
 * @param {string} gender - "Male", "Female", "Non Binary", etc.
 * @returns {{ firstName: string, lastName: string }}
 */
export function generatePseudonym(patientId, gender, salt = '') {
	const firstNames = gender === "Male" ? MALE_FIRST_NAMES
		: gender === "Female" ? FEMALE_FIRST_NAMES
		: NEUTRAL_FIRST_NAMES;
	const firstIndex = Math.abs(hashCode(patientId + salt + '_first')) % firstNames.length;
	const lastIndex  = Math.abs(hashCode(patientId + salt + '_last'))  % LAST_NAMES.length;
	return {
		firstName: firstNames[firstIndex],
		lastName: LAST_NAMES[lastIndex]
	};
}

export { hashCode };
