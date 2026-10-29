// src/lib/utils/anonymization/algorithmicProcessor.js
import { generatePseudonym } from './nameGenerator.js';
import { generatePhone } from './phoneGenerator.js';
import { anonymizeAddress } from './provinceLookup.js';
import { generateDoctorName } from './doctorGenerator.js';

/**
 * Process all algorithmic replacements for a patient
 * @param {string} patientId
 * @param {Array} responses - Adult Bio responses array
 * @returns {Object} Algorithmic transformation mappings
 */
export function processAlgorithmicFields(patientId, responses) {
	const salt = '_' + Date.now();
	const usedDoctorNames = new Set();

	function uniqueDoctorName(seed) {
		let name = generateDoctorName(seed, salt);
		let attempt = 0;
		while (usedDoctorNames.has(name)) {
			name = generateDoctorName(seed, salt + '_r' + (++attempt));
		}
		usedDoctorNames.add(name);
		return name;
	}

	const result = {
		patientName: {},
		phones: [],
		emails: [],
		address: {},
		dob: {},
		insurance: {},
		familyDoctor: {},
		prescribedBy: [],
		relatedPersons: []
	};
	let phoneIndex = 0;

	// Extract gender first (needed for name generation)
	const genderResponse = responses.find(r => r.questionId === 'q6');
	const gender = genderResponse?.value || 'Female';

	// q1: Name
	const nameResponse = responses.find(r => r.questionId === 'q1');
	if (nameResponse?.value) {
		const pseudonym = generatePseudonym(patientId, gender, salt);
		result.patientName = {
			original: {
				firstName: nameResponse.value.firstName,
				lastName: nameResponse.value.lastName
			},
			transformed: pseudonym
		};
	}

	// q2: Phones
	const phoneResponse = responses.find(r => r.questionId === 'q2');
	if (phoneResponse?.value) {
		if (phoneResponse.value.primaryPhone) {
			result.phones.push({
				original: phoneResponse.value.primaryPhone,
				transformed: generatePhone(phoneIndex++),
				context: 'primary'
			});
		}
		if (phoneResponse.value.otherPhone) {
			result.phones.push({
				original: phoneResponse.value.otherPhone,
				transformed: generatePhone(phoneIndex++),
				context: 'other'
			});
		}
	}

	// q3: Emails
	const emailResponse = responses.find(r => r.questionId === 'q3');
	if (emailResponse?.value) {
		const hash = patientId.toString().slice(-6); // Simple predictable hash
		if (emailResponse.value.primaryEmail) {
			result.emails.push({
				original: emailResponse.value.primaryEmail,
				transformed: `patient_${hash}@example.com`
			});
		}
		if (emailResponse.value.otherEmail1) {
			result.emails.push({
				original: emailResponse.value.otherEmail1,
				transformed: `patient_alt1_${hash}@example.com`
			});
		}
		if (emailResponse.value.otherEmail2) {
			result.emails.push({
				original: emailResponse.value.otherEmail2,
				transformed: `patient_alt2_${hash}@example.com`
			});
		}
	}

	// q4: Address
	const addressResponse = responses.find(r => r.questionId === 'q4');
	if (addressResponse?.value) {
		result.address = {
			original: addressResponse.value,
			transformed: anonymizeAddress(addressResponse.value)
		};
	}

	// q5: DOB
	const dobResponse = responses.find(r => r.questionId === 'q5');
	if (dobResponse?.value) {
		const birthDate = new Date(dobResponse.value);
		const age = Math.floor((Date.now() - birthDate) / (365.25 * 24 * 60 * 60 * 1000));
		result.dob = {
			original: dobResponse.value,
			transformed: `Age: ${age}`
		};
	}

	// q8: Insurance
	const insuranceResponse = responses.find(r => r.questionId === 'q8');
	if (insuranceResponse?.value) {
		result.insurance = {
			original: insuranceResponse.value,
			transformed: "Insurance Plan"
		};
	}

	// q17: Family Doctor
	const doctorResponse = responses.find(r => r.questionId === 'q17');
	if (doctorResponse?.value) {
		result.familyDoctor = {
			original: doctorResponse.value,
			transformed: uniqueDoctorName(patientId + '_doctor')
		};
	}

	// q18: Medications (prescribedBy)
	const medsResponse = responses.find(r => r.questionId === 'q18');
	if (medsResponse?.value && Array.isArray(medsResponse.value)) {
		medsResponse.value.forEach((med, i) => {
			if (med.doctor) {
				// Check if same as family doctor
				if (med.doctor === result.familyDoctor.original) {
					result.prescribedBy.push({
						original: med.doctor,
						transformed: result.familyDoctor.transformed
					});
				} else {
					result.prescribedBy.push({
						original: med.doctor,
						transformed: uniqueDoctorName(patientId + '_prescriber_' + i)
					});
				}
			}
		});
	}

	// q10: Emergency contact phone (not name - that goes to AI)
	const emergencyResponse = responses.find(r => r.questionId === 'q10');
	if (emergencyResponse?.value?.phone) {
		result.phones.push({
			original: emergencyResponse.value.phone,
			transformed: generatePhone(phoneIndex++),
			context: 'emergency_contact'
		});
	}

	// q10: Emergency contact email (algorithmic replacement)
	if (emergencyResponse?.value?.email) {
		const hash = patientId.toString().slice(-6);
		result.emails.push({
			original: emergencyResponse.value.email,
			transformed: `contact_${hash}@example.com`,
			context: 'emergency_contact'
		});
	}

	// q10: Emergency contact name (seed for AI / surname propagation)
	if (emergencyResponse?.value?.name) {
		result.relatedPersons.push({
			original: emergencyResponse.value.name,
			relationship: 'emergency_contact'
		});
	}

	// q16: Children — generate pseudonym names algorithmically
	// If child shares patient's original lastName → generate only a new firstName, keep patient's redacted lastName
	// Otherwise → generate a full new pseudonym (first + last)
	const childrenResponse = responses.find(r => r.questionId === 'q16');
	if (childrenResponse?.value && Array.isArray(childrenResponse.value)) {
		const pOrigLast = result.patientName?.original?.lastName || '';
		const pNewLast  = result.patientName?.transformed?.lastName || '';
		childrenResponse.value.forEach((child, i) => {
			if (!child.name) return;
			const nameParts = child.name.trim().split(/\s+/);
			const childLast = nameParts.slice(1).join(' ');
			const sharesLastName = pOrigLast && childLast.includes(pOrigLast);
			let pseudonymName;
			if (sharesLastName) {
				const childFirst = generatePseudonym(patientId + '_child_' + i, child.gender || 'Female', salt).firstName;
				pseudonymName = `${childFirst} ${pNewLast}`;
			} else {
				const full = generatePseudonym(patientId + '_child_' + i, child.gender || 'Female', salt);
				pseudonymName = `${full.firstName} ${full.lastName}`;
			}
			result.relatedPersons.push({
				original: child.name,
				transformed: pseudonymName,
				relationship: 'child'
			});
		});
	}

	return result;
}
