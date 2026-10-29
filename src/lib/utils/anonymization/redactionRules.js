// Turns the algorithmic + AI anonymization results into the stored redaction
// profile rules. Shared by the generation endpoint and the demo seed.

// Map a related-person relationship to a redCode descriptor. The generator knows
// the role here (relatedPersons[].relationship); searchReplace would otherwise
// throw it away, leaving the agent flow with a generic "Identifying Detail".
function relationshipToDesc(rel) {
	const r = String(rel || '').trim().toLowerCase();
	const map = {
		child: 'Name of Child', son: 'Name of Child', daughter: 'Name of Child',
		spouse: 'Name of Spouse', husband: 'Name of Spouse', wife: 'Name of Spouse',
		partner: 'Name of Partner',
		mother: 'Name of Parent', father: 'Name of Parent', parent: 'Name of Parent',
		sibling: 'Name of Sibling', brother: 'Name of Sibling', sister: 'Name of Sibling',
		emergency_contact: 'Name of Emergency Contact',
		friend: 'Name of Friend'
	};
	if (map[r]) return map[r];
	if (!r) return 'Name of Related Person';
	const human = r.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
	return `Name of ${human}`;
}

// Map a phone context (algResults.phones[].context) to a redCode descriptor.
function phoneContextToDesc(ctx) {
	switch (String(ctx || '').toLowerCase()) {
		case 'primary': return 'Phone of Patient';
		case 'other': return 'Other Phone of Patient';
		case 'emergency_contact': return 'Phone of Emergency Contact';
		default: return 'Phone Number';
	}
}

// What processWithAI returns when there is nothing for the AI to rewrite. The
// demo (no AWS access) uses it in place of the Bedrock phase, so only the
// algorithmic replacements (names, contacts, dates, doctors) apply.
export const NO_AI_RESULT = {
	success: true,
	data: { rewritten: [], discoveries: [] },
	usage: { total: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } },
	discoveries: [],
	additionalSearchReplace: []
};

/**
 * @param {object} algResults  processAlgorithmicFields() output
 * @param {object} aiResults   processWithAI() output (rewritten / discoveries / audit catches)
 * @param {Array}  responses   Adult Bio responses [{ questionId, value }]
 * @returns {{ fieldRewrites: object, searchReplace: Array }}
 */
export function buildRedactionRules(algResults, aiResults, responses) {
	const fieldRewrites = {};

	const pOrig = algResults.patientName?.original;
	const pTrans = algResults.patientName?.transformed;

	// patientInfo + adultBio name fields
	if (pTrans) {
		fieldRewrites['patientInfo.firstName']  = pTrans.firstName;
		fieldRewrites['patientInfo.lastName']   = pTrans.lastName;
		fieldRewrites['ADULT_BIO.q1.firstName']  = pTrans.firstName;
		fieldRewrites['ADULT_BIO.q1.lastName']   = pTrans.lastName;
	}

	// Phone fields
	const priPhone = algResults.phones?.find(p => p.context === 'primary');
	if (priPhone) {
		fieldRewrites['patientInfo.phone']           = priPhone.transformed;
		fieldRewrites['ADULT_BIO.q2.primaryPhone']    = priPhone.transformed;
	}
	const othPhone = algResults.phones?.find(p => p.context === 'other');
	if (othPhone) fieldRewrites['ADULT_BIO.q2.otherPhone'] = othPhone.transformed;
	const emgPhone = algResults.phones?.find(p => p.context === 'emergency_contact');
	if (emgPhone) fieldRewrites['ADULT_BIO.q10.phone'] = emgPhone.transformed;

	// Email fields
	const q3Emails = algResults.emails?.filter(e => !e.context) || [];
	if (q3Emails[0]) {
		fieldRewrites['patientInfo.email']           = q3Emails[0].transformed;
		fieldRewrites['ADULT_BIO.q3.primaryEmail']    = q3Emails[0].transformed;
	}
	if (q3Emails[1]) fieldRewrites['ADULT_BIO.q3.otherEmail1'] = q3Emails[1].transformed;
	if (q3Emails[2]) fieldRewrites['ADULT_BIO.q3.otherEmail2'] = q3Emails[2].transformed;

	const emgEmail = algResults.emails?.find(e => e.context === 'emergency_contact');
	if (emgEmail) fieldRewrites['ADULT_BIO.q10.email'] = emgEmail.transformed;

	// Other structured fields
	if (algResults.address?.transformed)   fieldRewrites['ADULT_BIO.q4']  = algResults.address.transformed;
	if (algResults.dob?.transformed)       fieldRewrites['ADULT_BIO.q5']  = algResults.dob.transformed;
	if (algResults.insurance?.transformed) fieldRewrites['ADULT_BIO.q8']  = algResults.insurance.transformed;
	if (algResults.familyDoctor?.transformed) fieldRewrites['ADULT_BIO.q17'] = algResults.familyDoctor.transformed;
	algResults.prescribedBy?.forEach((doc, i) => {
		if (doc.transformed) fieldRewrites[`ADULT_BIO.q18.${i}.doctor`] = doc.transformed;
	});

	// q16 fieldRewrites for children — bypasses searchReplace ordering issue where patient
	// surname rule runs before children full-name rules, leaving original first names intact
	algResults.relatedPersons
		?.filter(p => p.relationship === 'child' && p.transformed)
		.forEach((child) => {
			const q16Resp = responses.find(r => r.questionId === 'q16');
			if (q16Resp?.value && Array.isArray(q16Resp.value)) {
				const childIdx = q16Resp.value.findIndex(c => c.name === child.original);
				if (childIdx >= 0) {
					fieldRewrites[`ADULT_BIO.q16.${childIdx}.name`] = child.transformed;
				}
			}
		});

	// Merge AI rewrites into fieldRewrites
	const AI_ID_TO_PATH = {
		q10_name:               'ADULT_BIO.q10.name',
		q10_notes:              'ADULT_BIO.q10.notes',
		q12_occupation:         'ADULT_BIO.q12.currentOccupation',
		q12_trained:            'ADULT_BIO.q12.trainedOccupation',
		q15_partner_occupation: 'ADULT_BIO.q15',
		q17_doctor:             'ADULT_BIO.q17',
		q19_details:            'ADULT_BIO.q19.details.details',
		q20_details:            'ADULT_BIO.q20.details.reason',
		q20_length:             'ADULT_BIO.q20.details.length',
		q21_reason:             'ADULT_BIO.q21.details.reason',
		q21_length:             'ADULT_BIO.q21.details.length',
		q21_location:           'ADULT_BIO.q21.details.location',
		q22_location:           'ADULT_BIO.q22.details.location',
		q24_alcohol:            'ADULT_BIO.q24.details.amount',
		q24_frequency:          'ADULT_BIO.q24.details.frequency',
		q25_cannabis:           'ADULT_BIO.q25.details.amount',
		q25_frequency:          'ADULT_BIO.q25.details.frequency',
		q26_amount:             'ADULT_BIO.q26.details.amount',
		q26_frequency:          'ADULT_BIO.q26.details.frequency',
		q27_amount:             'ADULT_BIO.q27.details.amount',
		q27_frequency:          'ADULT_BIO.q27.details.frequency',
		q36_describe:           'ADULT_BIO.q36.describe',
		q36_meetup:             'ADULT_BIO.q36.meetupFrequency',
		q44_details:            'ADULT_BIO.q44.details.age',
		q45_primary_caregiver:  'ADULT_BIO.q45.primaryCaregiverRelationship',
		q45_secondary_caregiver:'ADULT_BIO.q45.secondaryCaregiverRelationship',
		q45_primary_occ:        'ADULT_BIO.q45.primaryCaregiverOccupation',
		q45_secondary_occ:      'ADULT_BIO.q45.secondaryCaregiverOccupation',
		q50_religion:           'ADULT_BIO.q50.religionName',
	};

	const rewrittenData = aiResults.data?.rewritten || [];
	rewrittenData.forEach(({ id, text }) => {
		const path = AI_ID_TO_PATH[id];
		if (path) {
			fieldRewrites[path] = text;
		} else if (/^q\d+$/.test(id)) {
			fieldRewrites[`ADULT_BIO.${id}`] = text;
		} else {
			const q18DoctorMatch = id.match(/^q18_(\d+)_doctor$/);
			if (q18DoctorMatch) fieldRewrites[`ADULT_BIO.q18.${q18DoctorMatch[1]}.doctor`] = text;
			const q18PrescribedMatch = id.match(/^q18_(\d+)_prescribed$/);
			if (q18PrescribedMatch) fieldRewrites[`ADULT_BIO.q18.${q18PrescribedMatch[1]}.prescripedFor`] = text;
			// q16 children details: q16_0_details, q16_1_details, etc.
			const q16DetailsMatch = id.match(/^q16_(\d+)_details$/);
			if (q16DetailsMatch) fieldRewrites[`ADULT_BIO.q16.${q16DetailsMatch[1]}.details`] = text;
		}
	});

	// Build searchReplace — AI discoveries, audit catches, patient name, phones, family names
	const searchReplace = [];
	// desc/category are optional: set them where the generator knows the role
	// (patient / family / phones) so the agent's redCode tokens get a precise
	// label. Omitted ⇒ descriptor is inferred at dispatch time.
	const addMap = (find, replace, desc, category) => {
		if (find && replace && find !== replace && !searchReplace.some(s => s.find === find)) {
			const rule = { find, replace, caseSensitive: true };
			if (desc) rule.desc = desc;
			if (category) rule.category = category;
			searchReplace.push(rule);
		}
	};

	// AI-discovered name mappings (from Haiku rewrite)
	const aiDiscoveries = aiResults.data?.discoveries || [];
	aiDiscoveries.forEach(d => addMap(d.original, d.pseudonym));

	// Audit pass residual catches
	const auditCatches = aiResults.additionalSearchReplace || [];
	auditCatches.forEach(r => addMap(r.find, r.replace));

	// Family member full names FIRST — children full names (e.g. "Diego Vasquez-Reyes"→"Henry Jones")
	// must be registered before the patient surname rule ("Vasquez-Reyes"→"Jones") to avoid
	// the intermediate "Diego Jones" that can't be matched by the children rule later.
	algResults.relatedPersons?.forEach(person => {
		if (!person.original) return;
		const desc = relationshipToDesc(person.relationship);
		if (person.transformed) {
			// Children — direct name substitution from algo
			addMap(person.original, person.transformed, desc, 'name');
		} else {
			// Others (emergency contact, etc.) — surname propagation only
			const propagated = person.original.replace(
				new RegExp(pOrig?.lastName || '$^', 'g'), pTrans?.lastName || ''
			).trim();
			addMap(person.original, propagated, desc, 'name');
		}
	});

	// Patient name + phones AFTER relatedPersons so children full-name rules take precedence
	if (pOrig?.firstName) addMap(pOrig.firstName, pTrans.firstName, 'Name of Patient', 'name');
	if (pOrig?.lastName)  addMap(pOrig.lastName,  pTrans.lastName, 'Name of Patient', 'name');

	// Phones (cross-questionnaire) — descriptor from each phone's context.
	algResults.phones?.forEach(p => addMap(p.original, p.transformed, phoneContextToDesc(p.context), 'phone'));

	return { fieldRewrites, searchReplace };
}
