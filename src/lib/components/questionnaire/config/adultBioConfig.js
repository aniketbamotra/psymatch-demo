import { INPUT_TYPES, SPECIAL_TYPES } from './questionTypes';

const questionMap = {
	name: {
		input_type: SPECIAL_TYPES.NAME,
		fields: ['firstName', 'lastName']
	},
	address: {
		input_type: SPECIAL_TYPES.ADDRESS,
		fields: ['line1', 'line2', 'city', 'province', 'postalCode']
	},
	dob: {
		input_type: SPECIAL_TYPES.DATE_WITH_AGE
	},
	age: {
		input_type: INPUT_TYPES.NUMBER,
		readonly: true
	},
	gender: {
		input_type: INPUT_TYPES.SELECT,
		options: [
			{ value: 'Male', label: 'Questionnaire.Config.AdultBio.gender.options.0' },
			{ value: 'Female', label: 'Questionnaire.Config.AdultBio.gender.options.1' },
			{ value: 'Trans', label: 'Questionnaire.Config.AdultBio.gender.options.2' },
			{ value: 'Non Binary', label: 'Questionnaire.Config.AdultBio.gender.options.3' }
		]
	},
	pronouns: {
		input_type: INPUT_TYPES.SELECT,
		options: [
			{ value: 'he/him', label: 'Questionnaire.Config.AdultBio.pronouns.options.0' },
			{ value: 'she/her', label: 'Questionnaire.Config.AdultBio.pronouns.options.1' },
			{ value: 'they/them', label: 'Questionnaire.Config.AdultBio.pronouns.options.2' },
			{ value: 'other', label: 'Questionnaire.Config.AdultBio.pronouns.options.3' }
		]
	},
	email: {
		input_type: SPECIAL_TYPES.EMAIL,
		required: true
	},
	mobileno: {
		input_type: SPECIAL_TYPES.PHONENUMBER,
		required: true
	},
	insurance: {
		input_type: INPUT_TYPES.TEXT,
		placeholder: 'Questionnaire.Config.AdultBio.insurance.placeholder'
	},
	referred_by: {
		input_type: INPUT_TYPES.SELECT,
		options: [
			{
				value: 'Self from CCT website',
				label: 'Questionnaire.Config.AdultBio.referred_by.options.0'
			},
			{ value: 'Self by VAC/RCMP', label: 'Questionnaire.Config.AdultBio.referred_by.options.1' },
			{
				value: 'Self from external website (RateMD etc)',
				label: 'Questionnaire.Config.AdultBio.referred_by.options.2'
			},
			{
				value: 'Self from friend/family recommendation',
				label: 'Questionnaire.Config.AdultBio.referred_by.options.3'
			},
			{
				value: 'Self from doctor referral',
				label: 'Questionnaire.Config.AdultBio.referred_by.options.4'
			},
			{
				value: 'Doctor referral (faxed to us)',
				label: 'Questionnaire.Config.AdultBio.referred_by.options.5'
			}
		]
	},
	emergency_contacts: {
		input_type: SPECIAL_TYPES.CONTACTS,
		fields: ['name', 'relationship', 'phone']
	},
	education_level: {
		input_type: INPUT_TYPES.SELECT,
		options: [
			{ value: 'High School', label: 'Questionnaire.Config.AdultBio.education_level.options.0' },
			{ value: 'Some College', label: 'Questionnaire.Config.AdultBio.education_level.options.1' },
			{
				value: "Associate's Degree",
				label: 'Questionnaire.Config.AdultBio.education_level.options.2'
			},
			{
				value: "Bachelor's Degree",
				label: 'Questionnaire.Config.AdultBio.education_level.options.3'
			},
			{
				value: "Master's Degree",
				label: 'Questionnaire.Config.AdultBio.education_level.options.4'
			},
			{
				value: 'Doctoral Degree',
				label: 'Questionnaire.Config.AdultBio.education_level.options.5'
			},
			{ value: 'Other', label: 'Questionnaire.Config.AdultBio.education_level.options.6' }
		]
	},
	career: {
		input_type: SPECIAL_TYPES.CAREER,
		required: true
	},
	work_hours: {
		input_type: INPUT_TYPES.SELECT,
		options: [
			{ value: 'Full Time', label: 'Questionnaire.Config.AdultBio.work_hours.options.0' },
			{ value: 'Part Time', label: 'Questionnaire.Config.AdultBio.work_hours.options.1' },
			{
				value: 'Currently unemployed',
				label: 'Questionnaire.Config.AdultBio.work_hours.options.2'
			},
			{ value: 'In school', label: 'Questionnaire.Config.AdultBio.work_hours.options.3' }
		]
	},
	marital_status: {
		input_type: INPUT_TYPES.SELECT,
		options: [
			{ value: 'Single', label: 'Questionnaire.Config.AdultBio.marital_status.options.0' },
			{ value: 'Married', label: 'Questionnaire.Config.AdultBio.marital_status.options.1' },
			{ value: 'Divorced', label: 'Questionnaire.Config.AdultBio.marital_status.options.2' },
			{ value: 'Separated', label: 'Questionnaire.Config.AdultBio.marital_status.options.3' },
			{ value: 'Widowed', label: 'Questionnaire.Config.AdultBio.marital_status.options.4' },
			{ value: 'Other', label: 'Questionnaire.Config.AdultBio.marital_status.options.5' }
		]
	},
	spouse_occupation: {
		input_type: INPUT_TYPES.TEXT,
		placeholder: 'Questionnaire.Config.AdultBio.spouse_occupation.placeholder',
		conditional: {
			dependsOn: 'marital_status',
			showIf: ['Married']
		}
	},
	children: {
		input_type: SPECIAL_TYPES.CHILDREN_LIST,
		fields: ['name', 'age']
	},
	family_doctor: {
		input_type: INPUT_TYPES.TEXT,
		placeholder: 'Questionnaire.Config.AdultBio.family_doctor.placeholder'
	},
	medications: {
		input_type: SPECIAL_TYPES.MEDICATION_LIST,
		fields: ['name', 'dosage', 'frequency']
	},
	prescribed_for: {
		input_type: INPUT_TYPES.TEXTAREA,
		placeholder: 'Questionnaire.Config.AdultBio.prescribed_for.placeholder'
	},
	major_illness_history: {
		input_type: SPECIAL_TYPES.BOOLEAN_WITH_DETAILS,
		conditional: {
			showIf: true,
			type: 'textarea',
			placeholder: 'Questionnaire.Config.AdultBio.major_illness_history.placeholder'
		}
	},
	psych_hospitalization: {
		input_type: SPECIAL_TYPES.BOOLEAN_WITH_DETAILS,
		conditional: {
			showIf: true,
			fields: [
				{
					id: 'reason',
					type: 'textarea',
					label: 'Questionnaire.Config.AdultBio.psych_hospitalization.reason_label',
					placeholder: 'Questionnaire.Config.AdultBio.psych_hospitalization.reason_placeholder'
				},
				{
					id: 'length',
					type: 'text',
					label: 'Questionnaire.Config.AdultBio.psych_hospitalization.length_label',
					placeholder: 'Questionnaire.Config.AdultBio.psych_hospitalization.length_placeholder'
				}
			]
		}
	},
	past_therapy: {
		input_type: SPECIAL_TYPES.BOOLEAN_WITH_DETAILS,
		conditional: {
			showIf: true,
			fields: [
				{
					id: 'reason',
					type: 'textarea',
					label: 'Questionnaire.Config.AdultBio.past_therapy.reason_label',
					placeholder: 'Questionnaire.Config.AdultBio.past_therapy.reason_placeholder'
				},
				{
					id: 'length',
					type: 'text',
					label: 'Questionnaire.Config.AdultBio.past_therapy.length_label',
					placeholder: 'Questionnaire.Config.AdultBio.past_therapy.length_placeholder'
				},
				{
					id: 'location',
					type: 'text',
					label: 'Questionnaire.Config.AdultBio.past_therapy.location_label',
					placeholder: 'Questionnaire.Config.AdultBio.past_therapy.location_placeholder'
				}
			]
		}
	},
	current_therapy: {
		input_type: SPECIAL_TYPES.BOOLEAN_WITH_DETAILS,
		conditional: {
			showIf: true,
			fields: [
				{
					id: 'location',
					type: 'text',
					label: 'Questionnaire.Config.AdultBio.past_therapy.location_label',
					placeholder: 'Questionnaire.Config.AdultBio.past_therapy.location_placeholder'
				}
			]
		}
	},
	substance_use_header: {
		input_type: SPECIAL_TYPES.HEADER,
		text: 'Questionnaire.Config.AdultBio.substance_use_header'
	},
	alcohol_use: {
		input_type: SPECIAL_TYPES.BOOLEAN_WITH_DETAILS,
		conditional: {
			showIf: true,
			fields: [
				{
					id: 'amount',
					type: 'text',
					label: 'Questionnaire.Config.AdultBio.alcohol_use.amount_label',
					placeholder: 'Questionnaire.Config.AdultBio.alcohol_use.amount_placeholder'
				},
				{
					id: 'frequency',
					type: 'text',
					label: 'Questionnaire.Config.AdultBio.alcohol_use.frequency_label',
					placeholder: 'Questionnaire.Config.AdultBio.alcohol_use.frequency_placeholder'
				}
			]
		}
	},
	marijuana_use: {
		input_type: SPECIAL_TYPES.BOOLEAN_WITH_DETAILS,
		conditional: {
			showIf: true,
			fields: [
				{
					id: 'amount',
					type: 'text',
					label: 'Questionnaire.Config.AdultBio.marijuana_use.amount_label',
					placeholder: 'Questionnaire.Config.AdultBio.marijuana_use.amount_placeholder'
				},
				{
					id: 'frequency',
					type: 'text',
					label: 'Questionnaire.Config.AdultBio.marijuana_use.frequency_label',
					placeholder: 'Questionnaire.Config.AdultBio.marijuana_use.frequency_placeholder'
				}
			]
		}
	},
	stimulants_use: {
		input_type: SPECIAL_TYPES.BOOLEAN_WITH_DETAILS,
		conditional: {
			showIf: true,
			fields: [
				{
					id: 'amount',
					type: 'text',
					label: 'Questionnaire.Config.AdultBio.stimulants_use.amount_label',
					placeholder: 'Questionnaire.Config.AdultBio.stimulants_use.amount_placeholder'
				},
				{
					id: 'frequency',
					type: 'text',
					label: 'Questionnaire.Config.AdultBio.stimulants_use.frequency_label',
					placeholder: 'Questionnaire.Config.AdultBio.stimulants_use.frequency_placeholder'
				}
			]
		}
	},
	non_stimulants_use: {
		input_type: SPECIAL_TYPES.BOOLEAN_WITH_DETAILS,
		conditional: {
			showIf: true,
			fields: [
				{
					id: 'amount',
					type: 'text',
					label: 'Questionnaire.Config.AdultBio.non_stimulants_use.amount_label',
					placeholder: 'Questionnaire.Config.AdultBio.non_stimulants_use.amount_placeholder'
				},
				{
					id: 'frequency',
					type: 'text',
					label: 'Questionnaire.Config.AdultBio.non_stimulants_use.frequency_label',
					placeholder: 'Questionnaire.Config.AdultBio.non_stimulants_use.frequency_placeholder'
				}
			]
		}
	},
	family_at_occt: {
		input_type: INPUT_TYPES.TEXT,
		placeholder: 'Questionnaire.Config.AdultBio.family_at_occt.placeholder'
	},
	reasons_for_cct: {
		input_type: INPUT_TYPES.CHECKBOX_GROUP,
		options: [
			'Questionnaire.Config.AdultBio.reasons_for_cct.options.0',
			'Questionnaire.Config.AdultBio.reasons_for_cct.options.1',
			'Questionnaire.Config.AdultBio.reasons_for_cct.options.2',
			'Questionnaire.Config.AdultBio.reasons_for_cct.options.3',
			'Questionnaire.Config.AdultBio.reasons_for_cct.options.4',
			'Questionnaire.Config.AdultBio.reasons_for_cct.options.5',
			'Questionnaire.Config.AdultBio.reasons_for_cct.options.6',
			'Questionnaire.Config.AdultBio.reasons_for_cct.options.7',
			'Questionnaire.Config.AdultBio.reasons_for_cct.options.8',
			'Questionnaire.Config.AdultBio.reasons_for_cct.options.9',
			'Questionnaire.Config.AdultBio.reasons_for_cct.options.10',
			'Questionnaire.Config.AdultBio.reasons_for_cct.options.11',
			'Questionnaire.Config.AdultBio.reasons_for_cct.options.12',
			'Questionnaire.Config.AdultBio.reasons_for_cct.options.13',
			'Questionnaire.Config.AdultBio.reasons_for_cct.options.14',
			'Questionnaire.Config.AdultBio.reasons_for_cct.options.15',
			'Questionnaire.Config.AdultBio.reasons_for_cct.options.16',
			'Questionnaire.Config.AdultBio.reasons_for_cct.options.17',
			'Questionnaire.Config.AdultBio.reasons_for_cct.options.18',
			'Questionnaire.Config.AdultBio.reasons_for_cct.options.19',
			'Questionnaire.Config.AdultBio.reasons_for_cct.options.20',
			'Questionnaire.Config.AdultBio.reasons_for_cct.options.21',
			'Questionnaire.Config.AdultBio.reasons_for_cct.options.22',
			'Questionnaire.Config.AdultBio.reasons_for_cct.options.23',
			'Questionnaire.Config.AdultBio.reasons_for_cct.options.24',
			'Questionnaire.Config.AdultBio.reasons_for_cct.options.25',
			'Questionnaire.Config.AdultBio.reasons_for_cct.options.26'
		]
	},
	additional_details: {
		input_type: INPUT_TYPES.TEXTAREA,
		placeholder: 'Questionnaire.Config.AdultBio.additional_details.placeholder'
	},
	main_goals: {
		input_type: INPUT_TYPES.TEXTAREA,
		placeholder: 'Questionnaire.Config.AdultBio.main_goals.placeholder'
	},
	concerns_duration: {
		input_type: INPUT_TYPES.TEXT,
		placeholder: 'Questionnaire.Config.AdultBio.concerns_duration.placeholder'
	},
	motivation_level: {
		input_type: INPUT_TYPES.SCALE,
		scale: [
			{ num: 5, text: 'Questionnaire.Config.AdultBio.motivation_level.scale.0' },
			{ num: 4, text: 'Questionnaire.Config.AdultBio.motivation_level.scale.1' },
			{ num: 3, text: 'Questionnaire.Config.AdultBio.motivation_level.scale.2' },
			{ num: 2, text: 'Questionnaire.Config.AdultBio.motivation_level.scale.3' },
			{ num: 1, text: 'Questionnaire.Config.AdultBio.motivation_level.scale.4' }
		]
	},
	problems_worse: {
		input_type: INPUT_TYPES.TEXTAREA,
		placeholder: 'Questionnaire.Config.AdultBio.problems_worse.placeholder'
	},
	problems_better: {
		input_type: INPUT_TYPES.TEXTAREA,
		placeholder: 'Questionnaire.Config.AdultBio.problems_better.placeholder'
	},
	social_interactions: {
		input_type: SPECIAL_TYPES.SOCIAL_INTERACTIONS,
		required: true
	},
	social_difficulties: {
		input_type: INPUT_TYPES.TEXTAREA
	},
	interests_hobbies: {
		input_type: INPUT_TYPES.TEXTAREA,
		placeholder: 'Questionnaire.Config.AdultBio.interests_hobbies.placeholder'
	},
	exercise_days: {
		input_type: INPUT_TYPES.TEXT,
		placeholder: 'Questionnaire.Config.AdultBio.exercise_days.placeholder'
	},
	exercise_duration: {
		input_type: INPUT_TYPES.TEXT,
		placeholder: 'Questionnaire.Config.AdultBio.exercise_duration.placeholder'
	},
	exercise_intensity: {
		input_type: INPUT_TYPES.SELECT,
		options: [
			{ value: 'Light', label: 'Questionnaire.Config.AdultBio.exercise_intensity.options.0' },
			{ value: 'Moderate', label: 'Questionnaire.Config.AdultBio.exercise_intensity.options.1' },
			{ value: 'Vigorous', label: 'Questionnaire.Config.AdultBio.exercise_intensity.options.2' }
		]
	},
	sleep_pattern: {
		input_type: INPUT_TYPES.TEXTAREA
	},
	nutrition_pattern: {
		input_type: INPUT_TYPES.TEXTAREA
	},
	adopted: {
		input_type: SPECIAL_TYPES.BOOLEAN_WITH_DETAILS,
		conditional: {
			showIf: true,
			fields: [
				{
					id: 'age',
					type: 'number',
					label: 'Questionnaire.Config.AdultBio.adopted.age_label',
					placeholder: 'Questionnaire.Config.AdultBio.adopted.age_placeholder',
					min: 0
				}
			]
		}
	},
	primary_caregiver_occupation_growing_up: {
		input_type: SPECIAL_TYPES.CAREGIVER_INFO,
		required: true
	},
	siblings_count: {
		input_type: INPUT_TYPES.TEXT,
		placeholder: 'Questionnaire.Config.AdultBio.siblings_count.placeholder'
	},
	siblings_relationship: {
		input_type: INPUT_TYPES.TEXTAREA
	},
	siblings_occupation: {
		input_type: INPUT_TYPES.TEXTAREA
	},
	family_emotional_problems: {
		input_type: INPUT_TYPES.TEXTAREA
	},
	religion: {
		input_type: SPECIAL_TYPES.RELIGION,
		options: [
			'Questionnaire.Config.AdultBio.religion.options.0',
			'Questionnaire.Config.AdultBio.religion.options.1',
			'Questionnaire.Config.AdultBio.religion.options.2',
			'Questionnaire.Config.AdultBio.religion.options.3',
			'Questionnaire.Config.AdultBio.religion.options.4'
		],
		required: true
	},
	significant_events: {
		input_type: INPUT_TYPES.TEXTAREA,
		placeholder: 'Questionnaire.Config.AdultBio.significant_events.placeholder'
	},
	other_info: {
		input_type: INPUT_TYPES.TEXTAREA,
		placeholder: 'Questionnaire.Config.AdultBio.other_info.placeholder'
	}
};

export function getQuestionConfig(questionId) {
	return questionMap[questionId] || { input_type: INPUT_TYPES.TEXT };
}

export function isAdultBioQuestion(questionId) {
	return questionId in questionMap;
}
