import { get } from 'svelte/store';
import en from '$lib/i18n/en.json';

const t = {
	subscribe: (fn) => {
		fn((key) => {
			return key.split('.').reduce((o, k) => (o || {})[k], en) || key;
		});
		return () => {};
	}
};

/**
 * Adult Bio Report Processor
 * Processes adult biographical questionnaire responses and generates a structured report
 */

/**
 * Format date string into a more readable format and calculate age
 * @param {string} dateString - Date string in format YYYY-MM-DD
 * @returns {string} Formatted date with age
 */
function formatDateWithAge(dateString) {
	if (!dateString) return 'Not provided';

	try {
		const date = new Date(dateString);
		if (isNaN(date.getTime())) return dateString;

		const monthNames = [
			'January',
			'February',
			'March',
			'April',
			'May',
			'June',
			'July',
			'August',
			'September',
			'October',
			'November',
			'December'
		];

		// Calculate age
		const today = new Date();
		let age = today.getFullYear() - date.getFullYear();
		const monthDiff = today.getMonth() - date.getMonth();

		if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) {
			age--;
		}

		return `${monthNames[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()} (${get(t)('Reports.AdultBio.age_label')}: ${age})`;
	} catch (error) {
		console.error('Error formatting date:', error);
		return dateString;
	}
}

/**
 * Get the full word for the pronoun
 * @param {string} pronoun - Pronoun value like "he/him"
 * @returns {Object} Object with subject and possessive forms
 */
function getFullPronoun(pronoun) {
	const pronounMap = {
		'he/him': { subject: 'He', object: 'Him', possessive: 'His' },
		'she/her': { subject: 'She', object: 'Her', possessive: 'Her' },
		'they/them': { subject: 'They', object: 'Them', possessive: 'Their' },
		other: { subject: 'They', object: 'Them', possessive: 'Their' } // Default
	};

	if (!pronoun || typeof pronoun !== 'string' || !pronoun) {
		// Changed to string check
		return pronounMap['they/them']; // Default to they/them
	}

	return pronounMap[pronoun.toLowerCase()] || pronounMap['they/them'];
}

/**
 * Format an address into a readable string
 * @param {Object} address - Address object
 * @returns {string} Formatted address
 */
function formatAddress(address) {
	if (!address) return 'Not provided';

	let parts = [];

	if (address.line1 && address.line1.trim()) parts.push(address.line1);
	if (address.line2 && address.line2.trim()) parts.push(address.line2);
	if (address.city && address.city.trim()) parts.push(address.city);
	if (address.province && address.province.trim()) parts.push(address.province);
	if (address.postalCode && address.postalCode.trim()) parts.push(address.postalCode);
	if (address.country && address.country.trim()) parts.push(address.country);

	return parts.join(', ') || get(t)('Reports.AdultBio.not_provided');
}

/**
 * Format phone number into a readable format
 * @param {string} phone - Phone number
 * @returns {string} Formatted phone number
 */
function formatPhone(phone) {
	if (!phone) return 'Not provided';

	// Remove all non-digit characters
	const digits = phone.replace(/\D/g, '');

	// Format based on length
	if (digits.length === 10) {
		return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
	} else if (digits.length === 11 && digits[0] === '1') {
		return `1-${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
	}

	return phone; // Return as is if can't format
}

/**
 * Format email addresses from the response
 * @param {Object} emailData - Email data object
 * @returns {string} Formatted email text
 */
function formatEmails(emailData) {
	if (!emailData) return 'Not provided';

	let emails = [];

	if (emailData.primaryEmail) {
		emails.push(emailData.primaryEmail);
	}

	if (emailData.otherEmail1 && emailData.otherEmail1.trim()) {
		emails.push(emailData.otherEmail1);
	}

	if (emailData.otherEmail2 && emailData.otherEmail2.trim()) {
		emails.push(emailData.otherEmail2);
	}

	return emails.join(', ') || 'Not provided';
}

/**
 * Format phone numbers from the response
 * @param {Object} phoneData - Phone data object
 * @returns {string} Formatted phone text
 */
function formatPhones(phoneData) {
	if (!phoneData) return 'Not provided';

	let phones = [];

	if (phoneData.primaryPhone) {
		phones.push(formatPhone(phoneData.primaryPhone));
	}

	if (phoneData.otherPhone && phoneData.otherPhone.trim()) {
		phones.push(formatPhone(phoneData.otherPhone));
	}

	return phones.join(', ') || 'Not provided';
}

/**
 * Format emergency contact info
 * @param {Object} contact - Contact data
 * @returns {string} Formatted contact info
 */
function formatEmergencyContact(contact) {
	if (!contact || !contact.name) return 'Not provided';

	let parts = [contact.name];

	if (contact.relationship && contact.relationship.trim()) {
		parts[0] += ` (${contact.relationship})`;
	}

	if (contact.phone && contact.phone.trim()) {
		parts.push(`${get(t)('Reports.AdultBio.phone_label')}: ${formatPhone(contact.phone)}`);
	}

	if (contact.email && contact.email.trim()) {
		parts.push(`${get(t)('Reports.AdultBio.email_label')}: ${contact.email}`);
	}

	if (contact.notes && contact.notes.trim()) {
		parts.push(`${get(t)('Reports.AdultBio.notes_label')}: ${contact.notes}`);
	}

	return parts.join(' | ');
}

/**
 * Format social interactions data
 * @param {Object} social - Social interactions data
 * @returns {string} Formatted social text
 */
function formatSocialInteractions(social) {
	if (!social) return 'Not provided';

	let parts = [];

	if (social.describe && social.describe.trim()) {
		parts.push(social.describe);
	}

	let connections = [];
	if (social.closeFriends) {
		connections.push(`${social.closeFriends} ${'close friends'}`);
	}

	if (social.friendlyAcquaintances) {
		connections.push(`${social.friendlyAcquaintances} ${'friendly acquaintances'}`);
	}

	if (connections.length > 0) {
		parts.push(`${'Has'} ${connections.join(` ${'and'} `)}.`);
	}

	if (social.meetupFrequency && social.meetupFrequency.trim()) {
		parts.push(`${get(t)('Reports.AdultBio.socializes_approx')} ${social.meetupFrequency}.`);
	}

	return parts.join(' ') || 'Not provided';
}

/**
 * Format children information into bullet points
 * @param {Array} children - Children data array
 * @returns {Array} Array of formatted strings for each child
 */
function formatChildren(children) {
	if (!children || !Array.isArray(children) || children.length === 0) return ['None'];

	return children.map((child) => {
		let parts = [];

		if (child.name) parts.push(child.name);
		if (child.gender) parts.push(child.gender);
		if (child.age) parts.push(`${child.age} ${'years old'}`);

		return parts.join(', ');
	});
}

/**
 * Format medication information into bullet points
 * @param {Array} medications - Medications data array
 * @returns {Array} Array of formatted strings for each medication
 */
function formatMedications(medications) {
	if (!medications || !Array.isArray(medications) || medications.length === 0) return ['None'];

	return medications.map((med) => {
		let parts = [];

		if (med.name) parts.push(med.name);

		let details = [];
		if (med.dosage) details.push(`${med.dosage}`);
		if (med.frequency) details.push(`${med.frequency}`);

		if (details.length > 0) {
			parts.push(`(${details.join(', ')})`);
		}

		if (med.doctor && med.doctor.trim()) {
			const prescribedStr = med.doctor.startsWith('Dr. ')
				? `– Prescribed by ${med.doctor}`
				: `– ${get(t)('Reports.AdultBio.prescribed_by')} ${med.doctor}`;
			parts.push(prescribedStr);
		}

		if (med.prescripedFor && med.prescripedFor.trim()) {
			parts.push(`${'for'} ${med.prescripedFor}`);
		}

		return parts.join(' ');
	});
}

/**
 * Format boolean with details responses
 * @param {Object} response - Boolean with details response
 * @param {string} yesText - Text to show if the answer is yes
 * @param {string} noText - Text to show if the answer is no
 * @returns {string} Formatted response text
 */
function formatBooleanWithDetails(response, yesText, noText) {
	if (!response) return noText;

	if (response.answer === 'false') {
		return noText;
	}

	if (!response.details) {
		return yesText;
	}

	// Different detail structures based on the question
	let detailsText = '';

	if (response.details.details) {
		detailsText = `: ${response.details.details}`;
	} else if (response.details.reason || response.details.length || response.details.location) {
		let parts = [];

		if (response.details.reason) parts.push(`${'Reason'}: ${response.details.reason}`);
		if (response.details.length) parts.push(`${'Duration'}: ${response.details.length}`);
		if (response.details.location) parts.push(`${'Location'}: ${response.details.location}`);

		detailsText = `: ${parts.join(' | ')}`;
	} else if (response.details.amount || response.details.frequency) {
		let parts = [];

		// Check if amount is a number and format accordingly
		if (response.details.amount) {
			const amount = response.details.amount;
			// If it's a numeric string
			if (!isNaN(amount) && amount.trim() !== '') {
				parts.push(`${amount} ${'times per occasion'}`);
			} else {
				parts.push(`${amount} ${'times per occasion'}`);
			}
		}

		// Check if frequency is a number and format accordingly
		if (response.details.frequency) {
			const frequency = response.details.frequency;
			// If it's a numeric string
			if (!isNaN(frequency) && frequency.trim() !== '') {
				parts.push(`${frequency} ${'times per week'}`);
			} else {
				parts.push(`${frequency} ${'times per week'}`);
			}
		}

		detailsText = `: ${parts.join(', ')}`;
	} else if (response.details.age) {
		detailsText = ` ${'at age'} ${response.details.age}`;
	}

	return yesText + detailsText;
}

/**
 * Format religion information
 * @param {Object} religion - Religion data
 * @returns {string} Formatted religion text
 */
function formatReligion(religion) {
	if (!religion || !religion.religiosity) return 'Not provided';

	let text = religion.religiosity;

	if (religion.religionName && religion.religionName.trim() !== '') {
		text += ` (${religion.religionName})`;
	}

	return text;
}

/**
 * Process substance use sections
 * @param {Object} responses - The response data object
 * @returns {Array} Array of bullet points for substance use
 */
function processSubstanceUse(responses) {
	const bulletPoints = [];
	console.log('Processing substance use responses:', responses.q24);
	// Alcohol use
	if (responses.q24) {
		const alcoholText = formatBooleanWithDetails(
			responses.q24,
			get(t)('Reports.AdultBio.alcohol_consumption'),
			get(t)('Reports.AdultBio.no_alcohol')
		);
		bulletPoints.push(alcoholText);
	}

	// Marijuana use
	if (responses.q25) {
		const marijuanaText = formatBooleanWithDetails(
			responses.q25,
			get(t)('Reports.AdultBio.marijuana_use'),
			get(t)('Reports.AdultBio.no_marijuana')
		);
		bulletPoints.push(marijuanaText);
	}

	// Stimulants use
	if (responses.q26) {
		const stimulantsText = formatBooleanWithDetails(
			responses.q26,
			get(t)('Reports.AdultBio.stimulants_use'),
			get(t)('Reports.AdultBio.no_stimulants')
		);
		bulletPoints.push(stimulantsText);
	}

	// Non-stimulants use
	if (responses.q27) {
		const nonStimulantsText = formatBooleanWithDetails(
			responses.q27,
			get(t)('Reports.AdultBio.other_substance_use'),
			get(t)('Reports.AdultBio.no_other_substance')
		);
		bulletPoints.push(nonStimulantsText);
	}

	// Other substance info - decide where to use q28 , family member coming to OCCT
	// if (responses.q28) {
	//     bulletPoints.push(`Additional substance information: ${responses.q28}`);
	// }

	return bulletPoints;
}

/**
 * Process exercise and lifestyle sections
 * @param {Object} responses - The response data object
 * @returns {Array} Array of bullet points for exercise and lifestyle
 */
function processExerciseLifestyle(responses) {
	const bulletPoints = [];

	// Exercise routine
	if (responses.q39 || responses.q40 || responses.q41) {
		let exerciseText = `${'Exercise Routine'}:`;
		let exerciseDetails = [];

		if (responses.q39) {
			exerciseDetails.push(`${'Frequency'}: ${responses.q39} ${'days per week'}`);
		}

		if (responses.q40) {
			exerciseDetails.push(`${'Duration'}: ${responses.q40}`);
		}

		if (responses.q41) {
			exerciseDetails.push(`${'Intensity'}: ${responses.q41}`);
		}

		if (exerciseDetails.length > 0) {
			exerciseText += ` ${exerciseDetails.join(', ')}`;
			bulletPoints.push(exerciseText);
		}
	}

	// Sleep pattern
	if (responses.q42) {
		bulletPoints.push(`${'Sleep Pattern'}: ${responses.q42}`);
	}

	// Nutrition/dietary habits
	if (responses.q43) {
		bulletPoints.push(`${'Dietary Habits'}: ${responses.q43}`);
	}

	return bulletPoints;
}

/**
 * Generate the personal information section
 * @param {Object} responses - The response data object
 * @returns {Object} Section object for personal information
 */
function generatePersonalInfoSection(responses) {
	const bulletPoints = [];

	// Date of Birth
	const dobDisplay = responses.q5?.startsWith?.('Age:')
		? responses.q5
		: formatDateWithAge(responses.q5);
	bulletPoints.push(
		`${get(t)('Reports.AdultBio.dob')}: ${responses.q5 ? dobDisplay : get(t)('Reports.AdultBio.not_provided')}`
	);

	// Gender and Pronouns
	let genderText;
	if (responses.q6 && responses.q6) {
		genderText = `${'Gender'}: ${responses.q6}`;

		if (responses.q7 && responses.q7) {
			genderText += ` (${responses.q7})`;
		}
	} else {
		genderText = `${get(t)('Reports.AdultBio.gender')}: ${get(t)('Reports.AdultBio.not_specified')}`;
	}
	bulletPoints.push(genderText);

	// Marital Status
	bulletPoints.push(
		`${get(t)('Reports.AdultBio.marital_status')}: ${responses.q14 && responses.q14 ? responses.q14 : get(t)('Reports.AdultBio.not_specified')}`
	);

	// Spouse's Occupation
	if (responses.q15 && responses.q14 && responses.q14 === 'Married') {
		bulletPoints.push(`${get(t)('Reports.AdultBio.spouse_occupation')}: ${responses.q15}`);
	} else if (responses.q14 && responses.q14 === 'Married') {
		bulletPoints.push(
			`${get(t)('Reports.AdultBio.spouse_occupation')}: ${get(t)('Reports.AdultBio.not_provided')}`
		);
	}

	// Children
	const childrenText = responses.q16
		? formatChildren(responses.q16)
		: [get(t)('Reports.AdultBio.none_reported')];
	bulletPoints.push(`${get(t)('Reports.AdultBio.children')}: ${childrenText.join('; ')}`);

	// Insurance Provider
	bulletPoints.push(
		`${get(t)('Reports.AdultBio.insurance_provider')}: ${responses.q8 || get(t)('Reports.AdultBio.not_provided')}`
	);

	// Emergency Contact
	bulletPoints.push(
		`${get(t)('Reports.AdultBio.emergency_contact')}: ${responses.q10 ? formatEmergencyContact(responses.q10) : get(t)('Reports.AdultBio.not_provided')}`
	);

	// Address
	const addressLabel = get(t)('Reports.AdultBio.address');
	bulletPoints.push(
		`${addressLabel}: ${responses.q4 ? formatAddress(responses.q4) : get(t)('Reports.AdultBio.not_provided')}`
	);

	return {
		title: get(t)('Reports.AdultBio.personal_info'),
		bulletPoints
	};
}

/**
 * Generate the professional and educational background section
 * @param {Object} responses - The response data object
 * @returns {Object} Section object for professional information
 */
function generateProfessionalSection(responses) {
	const bulletPoints = [];

	// Highest Education
	bulletPoints.push(
		`${get(t)('Reports.AdultBio.highest_education')}: ${responses.q11 && responses.q11 ? responses.q11 : get(t)('Reports.AdultBio.not_specified')}`
	);

	// Career Training
	console.log(`Career Training:`, responses.q12);
	bulletPoints.push(
		`${get(t)('Reports.AdultBio.career_training')}: ${responses.q12 ? responses.q12.trainedOccupation : get(t)('Reports.AdultBio.not_provided')}`
	);

	// Current Occupation/Work Hours
	if (responses.q13 && responses.q13) {
		let workText = `${get(t)('Reports.AdultBio.current_occupation')}: ${responses.q13}`;

		if (responses.q12 && responses.q12.currentOccupation) {
			workText += ` - ${responses.q12.currentOccupation}`;
		}

		bulletPoints.push(workText);
	} else {
		bulletPoints.push(
			`${get(t)('Reports.AdultBio.current_occupation')}: ${get(t)('Reports.AdultBio.not_specified')}`
		);
	}

	// Job Satisfaction
	if (responses.q12 && responses.q12.workSatisfaction) {
		let satisfaction;
		const satisfactionValue = parseInt(responses.q12.workSatisfaction);

		if (satisfactionValue <= 2) satisfaction = get(t)('Reports.AdultBio.low');
		else if (satisfactionValue <= 4) satisfaction = get(t)('Reports.AdultBio.moderate');
		else satisfaction = get(t)('Reports.AdultBio.high');

		bulletPoints.push(`${get(t)('Reports.AdultBio.job_satisfaction')}: ${satisfaction}`);
	} else {
		bulletPoints.push(
			`${get(t)('Reports.AdultBio.job_satisfaction')}: ${get(t)('Reports.AdultBio.not_specified')}`
		);
	}

	return {
		title: get(t)('Reports.AdultBio.prof_edu_background'),
		bulletPoints
	};
}

/**
 * Generate the medical history section
 * @param {Object} responses - The response data object
 * @returns {Object} Section object for medical history
 */
function generateMedicalSection(responses) {
	const bulletPoints = [];

	// Primary Physician
	bulletPoints.push(
		`${get(t)('Reports.AdultBio.primary_physician')}: ${responses.q17 ? (responses.q17.startsWith('Dr. ') ? responses.q17 : `${get(t)('Reports.AdultBio.dr')} ${responses.q17}`) : get(t)('Reports.AdultBio.not_specified')}`
	);

	// Current Medications
	if (responses.q18 && Array.isArray(responses.q18) && responses.q18.length > 0) {
		const medicationText = formatMedications(responses.q18);
		bulletPoints.push(`${get(t)('Reports.AdultBio.current_medications')}:`);

		medicationText.forEach((med) => {
			bulletPoints.push(`    • ${med}`);
		});
	} else {
		bulletPoints.push(
			`${get(t)('Reports.AdultBio.current_medications')}: ${get(t)('Reports.AdultBio.none_reported')}`
		);
	}

	// Past Medical Procedures
	bulletPoints.push(
		formatBooleanWithDetails(
			responses.q19,
			get(t)('Reports.AdultBio.past_medical_procedures'),
			get(t)('Reports.AdultBio.no_major_procedures')
		)
	);

	return {
		title: get(t)('Reports.AdultBio.medical_history'),
		bulletPoints
	};
}
function generatePsychHistorySection(responses) {
	const bulletPoints = [];
	// Psychological History
	const psychHistory = [];

	// Past hospitalizations
	psychHistory.push(
		formatBooleanWithDetails(
			responses.q20,
			get(t)('Reports.AdultBio.hospitalized_psych'),
			get(t)('Reports.AdultBio.no_hospitalized_psych')
		)
	);

	// Past therapy
	psychHistory.push(
		formatBooleanWithDetails(
			responses.q21,
			get(t)('Reports.AdultBio.prior_therapy'),
			get(t)('Reports.AdultBio.no_prior_therapy')
		)
	);

	// Current therapy
	psychHistory.push(
		formatBooleanWithDetails(
			responses.q22,
			get(t)('Reports.AdultBio.current_treatment'),
			get(t)('Reports.AdultBio.no_current_treatment')
		)
	);

	psychHistory.forEach((item) => {
		bulletPoints.push(`    • ${item}`);
	});
	return {
		title: get(t)('Reports.AdultBio.psychological_history'),
		bulletPoints
	};
}
/**
 * Generate the lifestyle and wellness section
 * @param {Object} responses - The response data object
 * @returns {Object} Section object for lifestyle information
 */
function generateLifestyleSection(responses) {
	const bulletPoints = [];

	// Substance Use
	const substanceUse = processSubstanceUse(responses);
	if (substanceUse.length > 0) {
		bulletPoints.push(`${get(t)('Reports.AdultBio.substance_use')}:`);
		substanceUse.forEach((item) => {
			bulletPoints.push(`    • ${item}`);
		});
	} else {
		bulletPoints.push('Substance Use: None reported');
	}

	// Exercise & Lifestyle
	const exerciseLifestyle = processExerciseLifestyle(responses);
	if (exerciseLifestyle.length > 0) {
		exerciseLifestyle.forEach((item) => {
			bulletPoints.push(item);
		});
	} else {
		bulletPoints.push('Exercise Routine: Not specified');
		bulletPoints.push('Sleep Pattern: Not specified');
	}

	// If no dietary habits provided
	if (!responses.q40) {
		bulletPoints.push('Dietary Habits: Not specified');
	}

	return {
		title: 'Lifestyle & Wellness',
		bulletPoints
	};
}

/**
 * Generate the mental health and personal growth section
 * @param {Object} responses - The response data object
 * @returns {Object} Section object for mental health information
 */
function generateMentalHealthSection(responses) {
	const bulletPoints = [];

	// Primary Concerns
	if (responses.q29 && Array.isArray(responses.q29) && responses.q29.length > 0) {
		bulletPoints.push(`Primary Concerns: ${responses.q29.map((k) => get(t)(k)).join(', ')}`);
	} else {
		bulletPoints.push('Primary Concerns: Not specified');
	}

	// Additional Details
	bulletPoints.push(`Additional Details: ${responses.q30 || 'Not specified'}`);

	// Goals for Therapy
	bulletPoints.push(`Goals for Therapy: ${responses.q31 || 'Not specified'}`);

	// Duration of Concerns
	bulletPoints.push(`Duration of Concerns: ${responses.q32 || 'Not specified'}`);

	// Motivation Level
	if (responses.q33) {
		let motivationLevel;
		const motivation = parseInt(responses.q33);

		if (motivation <= 2) motivationLevel = 'Low';
		else if (motivation <= 4) motivationLevel = 'Moderate';
		else motivationLevel = 'High';

		bulletPoints.push(`Motivation for Cognitive Therapy: ${motivationLevel}`);
	} else {
		bulletPoints.push('Motivation for Cognitive Therapy: Not specified');
	}

	// Factors That Worsen Symptoms
	bulletPoints.push(`Factors That Worsen Symptoms: ${responses.q34 || 'Not specified'}`);

	// Factors That Improve Well-being
	bulletPoints.push(`Factors That Improve Well-being: ${responses.q35 || 'Not specified'}`);

	return {
		title: 'Mental Health & Personal Growth',
		bulletPoints
	};
}

/**
 * Generate the social and personal life section
 * @param {Object} responses - The response data object
 * @returns {Object} Section object for social life information
 */
function generateSocialSection(responses) {
	const bulletPoints = [];

	// Social Interactions
	bulletPoints.push(
		`Social Interactions: ${responses.q36 ? formatSocialInteractions(responses.q36) : 'Not specified'}`
	);

	// Social Difficulties
	bulletPoints.push(`Social Difficulties: ${responses.q37 || 'None reported'}`);

	// Hobbies & Interests
	bulletPoints.push(`Hobbies & Interests: ${responses.q38 || 'Not specified'}`);

	// Reason of Conflict of Interest
	let conflictText = get(t)('Reports.AdultBio.none_reported');
	if (responses.q28) {
		if (typeof responses.q28 === 'string') {
			conflictText = responses.q28;
		} else if (responses.q28.answer === 'true' && responses.q28.details) {
			const details = Object.values(responses.q28.details)
				.filter((v) => v && v.toString().trim() !== '')
				.join(', ');
			conflictText = details || get(t)('Reports.AdultBio.yes_no_details');
		} else if (responses.q28.answer === 'true') {
			conflictText = get(t)('Reports.AdultBio.yes');
		} else if (responses.q28.answer === 'false') {
			conflictText = get(t)('Reports.AdultBio.none_reported');
		} else {
			conflictText = JSON.stringify(responses.q28); // Fallback
		}
	}
	bulletPoints.push(`${get(t)('Reports.AdultBio.reason_conflict_interest')}: ${conflictText}`);

	// Social satisfaction if available

	return {
		title: 'Social & Personal Life',
		bulletPoints
	};
}

/**
 * Generate the family background section
 * @param {Object} responses - The response data object
 * @returns {Object} Section object for family background information
 */
function generateFamilySection(responses) {
	const bulletPoints = [];

	// Adopted
	bulletPoints.push(formatBooleanWithDetails(responses.q44, 'Adopted', 'Not adopted'));

	// Parents' Occupations
	if (responses.q45) {
		const caregiverInfo = responses.q45;

		if (caregiverInfo.primaryCaregiverRelationship || caregiverInfo.primaryCaregiverOccupation) {
			let primaryText = 'Primary Caregiver: ';

			if (caregiverInfo.primaryCaregiverRelationship) {
				primaryText += caregiverInfo.primaryCaregiverRelationship;
			}

			if (caregiverInfo.primaryCaregiverOccupation) {
				if (caregiverInfo.primaryCaregiverRelationship) {
					primaryText += ' - ';
				}
				primaryText += caregiverInfo.primaryCaregiverOccupation;
			}

			bulletPoints.push(primaryText);
		}

		if (
			caregiverInfo.secondaryCaregiverRelationship ||
			caregiverInfo.secondaryCaregiverOccupation
		) {
			let secondaryText = 'Secondary Caregiver: ';

			if (caregiverInfo.secondaryCaregiverRelationship) {
				secondaryText += caregiverInfo.secondaryCaregiverRelationship;
			}

			if (caregiverInfo.secondaryCaregiverOccupation) {
				if (caregiverInfo.secondaryCaregiverRelationship) {
					secondaryText += ' - ';
				}
				secondaryText += caregiverInfo.secondaryCaregiverOccupation;
			}

			bulletPoints.push(secondaryText);
		}
	} else {
		bulletPoints.push('Caregiver Information: Not provided');
	}

	// Siblings
	if (responses.q46) {
		const siblingsCount = responses.q46;
		let siblingsText = `Number of children in family: ${siblingsCount}`;

		if (responses.q47) {
			siblingsText += `| Relationship - ${responses.q47}`;
		}

		bulletPoints.push(siblingsText);
	} else {
		bulletPoints.push('Siblings: Not specified');
	}

	// Family Mental Health History
	bulletPoints.push(`Family Mental Health History: ${responses.q49 || 'Not provided'}`);

	// Religion
	bulletPoints.push(`Religion: ${responses.q50 ? formatReligion(responses.q50) : 'Not specified'}`);

	return {
		title: 'Family Background',
		bulletPoints
	};
}

/**
 * Generate the life events and personal reflections section
 * @param {Object} responses - The response data object
 * @returns {Object} Section object for life events information
 */
function generateLifeEventsSection(responses) {
	const bulletPoints = [];

	// Significant Life Events
	if (responses.q51) {
		bulletPoints.push(`Significant Life Events: ${responses.q51}`);
	} else {
		bulletPoints.push('Significant Life Events: None reported');
	}

	// Other Information
	if (responses.q52) {
		bulletPoints.push(`Additional Information: ${responses.q52}`);
	}

	// If no information provided in this section
	if (bulletPoints.length === 0) {
		bulletPoints.push('No additional life events or personal reflections provided');
	}

	return {
		title: 'Life Events & Personal Reflections',
		bulletPoints
	};
}

/**
 * Transform the response data into object format
 */
function normalizeResponses(responseData) {
	// If already in correct format, return as is
	if (!Array.isArray(responseData)) {
		return responseData;
	}

	// Convert from array to object format
	const normalized = {};
	responseData.forEach((response) => {
		normalized[response.questionId] = response.value;
	});

	return normalized;
}

/**
 * Generate name string from name components
 */
function formatName(nameData) {
	if (!nameData) return 'Unknown';

	let name = [];
	if (nameData.firstName) name.push(nameData.firstName);
	if (nameData.lastName) name.push(nameData.lastName);

	return name.join(' ') || 'Unknown';
}

/**
 * Build the final report structure compatible with the PDF generator
 */
function buildReportStructure(sections) {
	const reportSections = [];

	// Add centered title at the top
	reportSections.push({
		text: 'BIOGRAPHICAL HISTORY',
		bold: true,
		fontSize: 14,
		align: 'center'
	});

	// Add spacing after title
	reportSections.push({
		text: ''
	});

	// Add each section with its title and bullet points
	sections.forEach((section) => {
		// Add section title
		reportSections.push({
			text: section.title,
			bold: true,
			addPeriod: false
		});

		// Add section bullet points
		section.bulletPoints.forEach((bulletPoint) => {
			reportSections.push({
				text: bulletPoint,
				addPeriod: false
			});
		});

		// Add spacing after each section
		reportSections.push({
			text: '' // Empty text for spacing
		});
	});

	return reportSections;
}

/**
 * Main entry point for processing adult bio data
 */
export function processAdultBioData(context) {
	try {
		console.log('AdultBioProcessor received context:', context);

		// Get responses from context (handle both array and object formats)
		// Special processors receive data in _responses, so check both
		const responseData = context._responses || context.responses || [];
		console.log('Raw response data:', responseData);

		const responses = normalizeResponses(responseData);
		console.log('Normalized responses:', responses);

		// Generate patient info for PDF header
		const patientInfo = {
			firstName: responses.q1 ? responses.q1.firstName : 'Unknown',
			lastName: responses.q1 ? responses.q1.lastName : 'Patient',
			fullName: formatName(responses.q1),
			gender: responses.q6 ? responses.q6.value : 'Unknown',
			pronouns: getFullPronoun(responses.q7),
			email: formatEmails(responses.q3),
			phone: formatPhones(responses.q2),
			address: formatAddress(responses.q4)
		};

		// Generate each section
		const personalInfoSection = generatePersonalInfoSection(responses);
		const professionalSection = generateProfessionalSection(responses);
		const medicalSection = generateMedicalSection(responses);
		const psychHistorySection = generatePsychHistorySection(responses);
		const lifestyleSection = generateLifestyleSection(responses);
		const mentalHealthSection = generateMentalHealthSection(responses);
		const socialSection = generateSocialSection(responses);
		const familySection = generateFamilySection(responses);
		const lifeEventsSection = generateLifeEventsSection(responses);

		// Combine all sections
		const sections = [
			personalInfoSection,
			professionalSection,
			medicalSection,
			psychHistorySection,
			lifestyleSection,
			mentalHealthSection,
			socialSection,
			familySection,
			lifeEventsSection
		];

		// Build the final report structure
		const report_sections = buildReportStructure(sections);
		console.log('Generated report sections:', report_sections);

		// Return outcome with report sections and patient info
		return {
			patientInfo: patientInfo,
			outcomes: {
				adult_bio: {
					value: 1,
					report_sections: report_sections
				}
			}
		};
	} catch (error) {
		console.error('Error processing adult bio data:', error);
		// Return a minimal valid structure in case of error
		return {
			outcomes: {
				adult_bio: {
					value: 1,
					report_sections: [
						{
							text: 'Unable to process adult biographical data. Please try again.',
							addPeriod: true
						}
					]
				}
			}
		};
	}
}
