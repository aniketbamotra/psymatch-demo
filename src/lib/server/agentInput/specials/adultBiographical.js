import { loadResponsesForAssignment } from '../responses.js';

// Map a raw `{answer: "true"|"false", details: {...}}` object (the shape
// the boolean-with-details widget stores) to the spec's boolean+details
// pair. Many ADULT_BIO questions use this widget.
function flagAndDetails(raw) {
	if (raw == null) return { reported: false, details: null };
	if (typeof raw !== 'object') return { reported: Boolean(raw), details: null };
	const reported = raw.answer === true || raw.answer === 'true';
	// The widget persists its sub-fields even for a "No" answer — e.g.
	// {reason:'', length:'', location:''} — which made `details` look truthy to
	// the agent and invited it to fill the apparent gap from unrelated free text
	// (this is how "Prior Psychotherapy" picked up the presenting-concerns
	// narrative, 2026-07-28). An all-empty details object is no details.
	const details = isEmptyDetails(raw.details) ? null : raw.details;
	return { reported, details };
}

function isEmptyDetails(d) {
	if (d == null) return true;
	if (typeof d !== 'object') return String(d).trim() === '';
	return Object.values(d).every((v) => v == null || String(v).trim() === '');
}

/**
 * ADULT_BIO adapter.
 *
 * Reshapes the patient's raw qN-keyed answers into the V2.16-spec's
 * semantic `structured_result` groupings (education, occupation,
 * medical_history, psychological_history, lifestyle, presenting_concerns,
 * narrative_concerns, therapy_goals, social_functioning, family_background,
 * life_events, etc.). The mapping is derived from the questionnaire's
 * authored `question.id`s — see `peek-responses.js ADULT_BIO` for the
 * full id list.
 *
 * The adapter also exposes the flat by-question-id map (as `_responses`)
 * so the orchestrator can hoist age / marital_status / children onto the
 * top-level patient block.
 */
export async function buildAdultBiographicalEntry({ assignment, questionnaire }) {
	const { bySemanticId } = await loadResponsesForAssignment(assignment, questionnaire);
	const r = bySemanticId;

	const career = r.career ?? {};
	const social = r.social_interactions ?? {};

	const major = flagAndDetails(r.major_illness_history);
	const psychHosp = flagAndDetails(r.psych_hospitalization);
	const priorTherapy = flagAndDetails(r.past_therapy);
	const currentTherapy = flagAndDetails(r.current_therapy);

	const structured_result = {
		education: {
			highest_education: r.education_level ?? null,
			career_training: career.trainedOccupation ?? null
		},
		occupation: {
			status: r.work_hours ?? null,
			current_occupation: career.currentOccupation ?? null,
			job_satisfaction: career.workSatisfaction ?? null
		},
		medical_history: {
			primary_physician: r.family_doctor ?? null,
			current_medications: r.medications ?? [],
			major_medical_procedures_reported: major.reported,
			major_medical_procedures_details: major.details
		},
		psychological_history: {
			past_hospitalizations_reported: psychHosp.reported,
			past_hospitalizations_details: psychHosp.details,
			prior_therapy_reported: priorTherapy.reported,
			prior_therapy_details: priorTherapy.details,
			current_treatment_elsewhere_reported: currentTherapy.reported,
			current_treatment_elsewhere_details: currentTherapy.details
		},
		substance_use: {
			alcohol: r.alcohol_use ?? null,
			marijuana: r.marijuana_use ?? null,
			stimulants: r.stimulants_use ?? null,
			other_drugs: r.non_stimulants_use ?? null
		},
		lifestyle: {
			sleep: r.sleep_pattern ?? null,
			exercise: {
				days_per_week: r.exercise_days ?? null,
				duration: r.exercise_duration ?? null,
				intensity: r.exercise_intensity ?? null
			},
			diet: r.nutrition_pattern ?? null,
			interests: r.interests_hobbies ?? null
		},
		presenting_concerns: r.reasons_for_cct ?? [],
		narrative_concerns: r.additional_details ?? null,
		therapy_goals: r.main_goals ?? null,
		duration_of_concerns: r.concerns_duration ?? null,
		motivation_for_cognitive_therapy: r.motivation_level ?? null,
		worsening_factors: r.problems_worse ?? null,
		improving_factors: r.problems_better ?? null,
		social_functioning: {
			close_friends: social.closeFriends ?? null,
			friendly_acquaintances: social.friendlyAcquaintances ?? null,
			social_frequency: social.meetupFrequency ?? null,
			description: social.describe ?? null,
			social_difficulties: r.social_difficulties ?? null
		},
		family_background: {
			adopted: r.adopted ?? null,
			primary_caregiver_occupation: r.primary_caregiver_occupation_growing_up ?? null,
			siblings_count: r.siblings_count ?? null,
			siblings_relationship: r.siblings_relationship ?? null,
			siblings_occupations: r.siblings_occupation ?? null,
			family_mental_health_history: r.family_emotional_problems ?? null,
			religion: r.religion ?? null
		},
		life_events: r.significant_events ?? null,
		other_info: r.other_info ?? null
	};

	return {
		interview_name: 'Adult Biographical Interview',
		administered: true,
		structured_result,
		// Internal: surfaces raw qN-keyed answers so the orchestrator
		// can hoist age/marital_status/children onto patient. Stripped
		// before the payload is returned.
		_responses: r
	};
}
