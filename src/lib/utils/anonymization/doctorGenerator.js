// src/lib/utils/anonymization/doctorGenerator.js
import { hashCode } from './nameGenerator.js';

const DOCTOR_FIRST_NAMES = [
	"Sarah", "Michael", "Jennifer", "David", "Emily", "Robert",
	"Lisa", "William", "Maria", "James"
];
const DOCTOR_LAST_NAMES = [
	"Johnson", "Williams", "Chen", "Patel", "Kim", "Singh",
	"Thompson", "Martinez", "Anderson", "Lee"
];

/**
 * Generate a doctor name
 * @param {string} seed
 * @returns {string}
 */
export function generateDoctorName(seed, salt = '') {
	const fullSeed = seed + salt;
	const first = DOCTOR_FIRST_NAMES[Math.abs(hashCode(fullSeed + '_first')) % DOCTOR_FIRST_NAMES.length];
	const last  = DOCTOR_LAST_NAMES[Math.abs(hashCode(fullSeed + '_last'))  % DOCTOR_LAST_NAMES.length];
	return `Dr. ${first} ${last}`;
}
