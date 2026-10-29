import { User } from '../../database/schemas.js';
import { normalizeLanguage } from '../../utils/language.js';

// Maps the schema-level gender enum into a more readable label used by
// the AI prompts. The V2.16 standard expects natural English.
//
// NB: `User.gender` is a REGISTRATION-time pronoun stem, not a gender, and it
// defaults to 'They' — so a patient who never answered it was reported as
// "Non-binary (they/them)" in every section. It is now only the fallback; the
// adult-bio answers below win. (Caught on a female patient, 2026-07-28.)
const GENDER_LABELS = {
	He: 'Male',
	She: 'Female',
	They: 'Non-binary',
	Ze: 'Non-binary'
};

const PRONOUNS = {
	He: 'he/him',
	She: 'she/her',
	They: 'they/them',
	Ze: 'ze/zir'
};

// The adult-bio gender select stores 'Male' | 'Female' | 'Trans' | 'Non Binary';
// only the spacing differs from the labels used elsewhere in a report.
const BIO_GENDER_LABELS = {
	'Non Binary': 'Non-binary'
};

// Reports address the patient by first name in narrative prose while the
// identification block, cover page and footer keep the legal full name.
function firstNameOf(fullName) {
	const first = String(fullName ?? '')
		.trim()
		.split(/\s+/)[0];
	return first || null;
}

/**
 * Decide how the patient is named and described in the report.
 *
 * The registration row (`User.gender`) is a pronoun stem that defaults to 'They',
 * so it silently mis-describes anyone who skipped the intake question. The adult
 * biographical interview asks gender and pronouns directly, and those answers are
 * the clinician-facing source of truth — so they win whenever present.
 *
 * Pure and exported for testing; `buildPatientBlock` is the only caller.
 *
 * @param {{fullName?: string, gender?: string}} user
 * @param {{gender?: string, pronouns?: string, name?: {firstName?: string}}} [bio]
 * @returns {{name: string|null, first_name: string|null, gender: string|null, pronouns: string|null}}
 */
export function resolveIdentity(user, bio = null) {
	const identity = {
		name: user?.fullName ?? null,
		first_name: firstNameOf(user?.fullName),
		gender: GENDER_LABELS[user?.gender] ?? user?.gender ?? null,
		pronouns: PRONOUNS[user?.gender] ?? null
	};
	if (!bio) return identity;

	if (bio.gender) identity.gender = BIO_GENDER_LABELS[bio.gender] ?? bio.gender;

	// 'other' is the select's escape hatch, not a usable pronoun set: keep the
	// fallback rather than printing "other" as the patient's pronouns.
	if (bio.pronouns && bio.pronouns !== 'other') identity.pronouns = bio.pronouns;

	const bioFirst = String(bio.name?.firstName ?? '').trim();
	if (bioFirst) identity.first_name = bioFirst;

	return identity;
}

function ageFromDob(dob) {
	if (!dob || typeof dob !== 'string') return null;
	const d = new Date(dob);
	if (Number.isNaN(d.getTime())) return null;
	const now = new Date();
	let age = now.getFullYear() - d.getFullYear();
	const monthDiff = now.getMonth() - d.getMonth();
	if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < d.getDate())) age--;
	return age >= 0 && age < 130 ? age : null;
}

/**
 * Build the `patient` block of the agent_input.v1 payload from the
 * User document plus (when available) the ADULT_BIO responses, which
 * supply demographic fields the User row doesn't carry.
 *
 * Spec-required patient fields: patient_id, name, age, gender, pronouns,
 * marital_status, children. We emit those whenever derivable; everything
 * else is omitted rather than emitted as null.
 *
 * @param {string} patientId
 * @param {object} [adultBioResponses] - the bySemanticId map from the
 *   adult_biographical adapter (or null if ADULT_BIO not administered)
 * @returns {Promise<object>}
 */
export async function buildPatientBlock(patientId, adultBioResponses = null) {
	const user = await User.findById(patientId).lean();
	if (!user) throw new Error(`No User found for patientId=${patientId}`);
	if (user.userType !== 'patient') {
		throw new Error(`User ${patientId} has userType=${user.userType}, expected 'patient'`);
	}

	const block = {
		// The patient-facing identifier is ALWAYS the FileMaker id (stored on
		// patientProfile) — never the Mongo ObjectId, which must not surface in a
		// report. Empty when the patient has no fileMakerId; reports then show "—".
		patient_id: user.patientProfile?.fileMakerId ? String(user.patientProfile.fileMakerId) : '',
		...resolveIdentity(user, adultBioResponses)
	};

	// Hoist demographic fields from ADULT_BIO when present. These are part
	// of the spec's `patient` block, not the bio interview's structured_result.
	if (adultBioResponses) {
		const age = ageFromDob(adultBioResponses.dob);
		if (age != null) block.age = age;
		if (adultBioResponses.marital_status) block.marital_status = adultBioResponses.marital_status;
		if (adultBioResponses.children) block.children = adultBioResponses.children;
	}

	// Optional intake-side fields from User.patientProfile. Kept compact:
	// only emitted when non-empty.
	const profile = user.patientProfile ?? {};
	if (profile.phoneNumber) block.phone = profile.phoneNumber;
	// Always sent, unlike the other optional profile fields: the agent picks the
	// report language from it, so a missing value must resolve to English rather
	// than leaving the key off entirely.
	block.preferred_language = normalizeLanguage(profile.preferredLanguage);
	if (profile.preferredCommunication) {
		block.preferred_communication = profile.preferredCommunication;
	}
	if (profile.intakeNote) block.intake_note = profile.intakeNote;

	return block;
}
