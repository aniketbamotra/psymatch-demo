import { INPUT_TYPES, SPECIAL_TYPES } from './questionTypes';

const questionMap = {
	therapist_energy_level: {
		input_type: SPECIAL_TYPES.MULTI_OPTIONS,
		optionSets: [
			{
				label: 'Questionnaire.Config.TherapistMatch.preference_label',
				options: [
					{
						value: 'Very energetic and lively',
						label: 'Questionnaire.Config.TherapistMatch.energy_level.options.0'
					},
					{
						value: 'Somewhat energetic and lively',
						label: 'Questionnaire.Config.TherapistMatch.energy_level.options.1'
					},
					{
						value: 'Somewhat calm and quiet',
						label: 'Questionnaire.Config.TherapistMatch.energy_level.options.2'
					},
					{
						value: 'Very calm and quiet',
						label: 'Questionnaire.Config.TherapistMatch.energy_level.options.3'
					}
				]
			},
			{
				label: 'Questionnaire.Config.TherapistMatch.importance_label',
				options: [
					{
						value: 'extremely important',
						label: 'Questionnaire.Config.TherapistMatch.importance.options.0'
					},
					{
						value: 'very important',
						label: 'Questionnaire.Config.TherapistMatch.importance.options.1'
					},
					{
						value: 'somewhat important',
						label: 'Questionnaire.Config.TherapistMatch.importance.options.2'
					},
					{
						value: 'not important',
						label: 'Questionnaire.Config.TherapistMatch.importance.options.3'
					}
				]
			}
		]
	},
	therapist_collaboration_style: {
		input_type: SPECIAL_TYPES.MULTI_OPTIONS,
		optionSets: [
			{
				label: 'Questionnaire.Config.TherapistMatch.preference_label',
				options: [
					{
						value: 'Very Collaborative',
						label: 'Questionnaire.Config.TherapistMatch.collaboration_style.options.0'
					},
					{
						value: 'Quite Collaborative',
						label: 'Questionnaire.Config.TherapistMatch.collaboration_style.options.1'
					},
					{
						value: 'Somewhat Collaborative',
						label: 'Questionnaire.Config.TherapistMatch.collaboration_style.options.2'
					},
					{
						value: 'Does what they think is best for me',
						label: 'Questionnaire.Config.TherapistMatch.collaboration_style.options.3'
					}
				]
			},
			{
				label: 'Questionnaire.Config.TherapistMatch.importance_label',
				options: [
					{
						value: 'extremely important',
						label: 'Questionnaire.Config.TherapistMatch.importance.options.0'
					},
					{
						value: 'very important',
						label: 'Questionnaire.Config.TherapistMatch.importance.options.1'
					},
					{
						value: 'somewhat important',
						label: 'Questionnaire.Config.TherapistMatch.importance.options.2'
					},
					{
						value: 'not important',
						label: 'Questionnaire.Config.TherapistMatch.importance.options.3'
					}
				]
			}
		]
	},
	therapist_directiveness: {
		input_type: SPECIAL_TYPES.MULTI_OPTIONS,
		optionSets: [
			{
				label: 'Questionnaire.Config.TherapistMatch.preference_label',
				options: [
					{
						value: 'Very Directive, pushes me to make changes, do homework etc.',
						label: 'Questionnaire.Config.TherapistMatch.directiveness.options.0'
					},
					{
						value: 'Fairly Directive and somewhat pushy',
						label: 'Questionnaire.Config.TherapistMatch.directiveness.options.1'
					},
					{
						value: 'Somewhat Directive, a little Pushy',
						label: 'Questionnaire.Config.TherapistMatch.directiveness.options.2'
					},
					{
						value: 'Not really Directive, or Pushy',
						label: 'Questionnaire.Config.TherapistMatch.directiveness.options.3'
					}
				]
			},
			{
				label: 'Questionnaire.Config.TherapistMatch.importance_label',
				options: [
					{
						value: 'extremely important',
						label: 'Questionnaire.Config.TherapistMatch.importance.options.0'
					},
					{
						value: 'very important',
						label: 'Questionnaire.Config.TherapistMatch.importance.options.1'
					},
					{
						value: 'somewhat important',
						label: 'Questionnaire.Config.TherapistMatch.importance.options.2'
					},
					{
						value: 'not important',
						label: 'Questionnaire.Config.TherapistMatch.importance.options.3'
					}
				]
			}
		]
	},
	therapist_compassion: {
		input_type: SPECIAL_TYPES.MULTI_OPTIONS,
		optionSets: [
			{
				label: 'Questionnaire.Config.TherapistMatch.preference_label',
				options: [
					{
						value: 'Very Gentle and Compassionate',
						label: 'Questionnaire.Config.TherapistMatch.compassion.options.0'
					},
					{
						value: 'Fairly Gentle and Compassionate',
						label: 'Questionnaire.Config.TherapistMatch.compassion.options.1'
					},
					{
						value: 'Somewhat Gentle and Compassionate',
						label: 'Questionnaire.Config.TherapistMatch.compassion.options.2'
					},
					{
						value: 'Does not really express Compassion',
						label: 'Questionnaire.Config.TherapistMatch.compassion.options.3'
					}
				]
			},
			{
				label: 'Questionnaire.Config.TherapistMatch.importance_label',
				options: [
					{
						value: 'extremely important',
						label: 'Questionnaire.Config.TherapistMatch.importance.options.0'
					},
					{
						value: 'very important',
						label: 'Questionnaire.Config.TherapistMatch.importance.options.1'
					},
					{
						value: 'somewhat important',
						label: 'Questionnaire.Config.TherapistMatch.importance.options.2'
					},
					{
						value: 'not important',
						label: 'Questionnaire.Config.TherapistMatch.importance.options.3'
					}
				]
			}
		]
	},
	therapist_cultural_background: {
		input_type: SPECIAL_TYPES.MULTI_OPTIONS,
		optionSets: [
			{
				label: 'Questionnaire.Config.TherapistMatch.preference_label',
				options: [
					{
						value: 'Very similar cultural background to me',
						label: 'Questionnaire.Config.TherapistMatch.cultural_background.options.0'
					},
					{
						value: 'Somewhat similar cultural background to me',
						label: 'Questionnaire.Config.TherapistMatch.cultural_background.options.1'
					},
					{
						value: 'No preference for cultural background',
						label: 'Questionnaire.Config.TherapistMatch.cultural_background.options.2'
					},
					{
						value: 'A different cultural background to me',
						label: 'Questionnaire.Config.TherapistMatch.cultural_background.options.3'
					}
				]
			},
			{
				label: 'Questionnaire.Config.TherapistMatch.importance_label',
				options: [
					{
						value: 'extremely important',
						label: 'Questionnaire.Config.TherapistMatch.importance.options.0'
					},
					{
						value: 'very important',
						label: 'Questionnaire.Config.TherapistMatch.importance.options.1'
					},
					{
						value: 'somewhat important',
						label: 'Questionnaire.Config.TherapistMatch.importance.options.2'
					},
					{
						value: 'not important',
						label: 'Questionnaire.Config.TherapistMatch.importance.options.3'
					}
				]
			}
		]
	},
	therapist_homework_approach: {
		input_type: SPECIAL_TYPES.MULTI_OPTIONS,
		optionSets: [
			{
				label: 'Questionnaire.Config.TherapistMatch.preference_label',
				options: [
					{
						value: 'Very Pushy about getting me to do homework',
						label: 'Questionnaire.Config.TherapistMatch.homework_approach.options.0'
					},
					{
						value: 'Moderately encouraging of me to do homework',
						label: 'Questionnaire.Config.TherapistMatch.homework_approach.options.1'
					},
					{
						value: 'Is mildly encouraging of me to do homework',
						label: 'Questionnaire.Config.TherapistMatch.homework_approach.options.2'
					},
					{
						value: "Suggests homework, but doesn't follow-up",
						label: 'Questionnaire.Config.TherapistMatch.homework_approach.options.3'
					}
				]
			},
			{
				label: 'Questionnaire.Config.TherapistMatch.importance_label',
				options: [
					{
						value: 'extremely important',
						label: 'Questionnaire.Config.TherapistMatch.importance.options.0'
					},
					{
						value: 'very important',
						label: 'Questionnaire.Config.TherapistMatch.importance.options.1'
					},
					{
						value: 'somewhat important',
						label: 'Questionnaire.Config.TherapistMatch.importance.options.2'
					},
					{
						value: 'not important',
						label: 'Questionnaire.Config.TherapistMatch.importance.options.3'
					}
				]
			}
		]
	},
	therapist_age: {
		input_type: SPECIAL_TYPES.MULTI_OPTIONS,
		optionSets: [
			{
				label: 'Questionnaire.Config.TherapistMatch.preference_label',
				options: [
					{
						value: 'Close in age to myself',
						label: 'Questionnaire.Config.TherapistMatch.age.options.0'
					},
					{
						value: 'Older, more experienced than me',
						label: 'Questionnaire.Config.TherapistMatch.age.options.1'
					},
					{
						value: 'Younger than I am',
						label: 'Questionnaire.Config.TherapistMatch.age.options.2'
					},
					{
						value: "No preference regarding my therapist's age",
						label: 'Questionnaire.Config.TherapistMatch.age.options.3'
					}
				]
			},
			{
				label: 'Questionnaire.Config.TherapistMatch.importance_label',
				options: [
					{
						value: 'extremely important',
						label: 'Questionnaire.Config.TherapistMatch.importance.options.0'
					},
					{
						value: 'very important',
						label: 'Questionnaire.Config.TherapistMatch.importance.options.1'
					},
					{
						value: 'somewhat important',
						label: 'Questionnaire.Config.TherapistMatch.importance.options.2'
					},
					{
						value: 'not important',
						label: 'Questionnaire.Config.TherapistMatch.importance.options.3'
					}
				]
			}
		]
	},
	therapist_gender: {
		input_type: SPECIAL_TYPES.MULTI_OPTIONS,
		optionSets: [
			{
				label: 'Questionnaire.Config.TherapistMatch.preference_label',
				options: [
					{ value: 'Female', label: 'Questionnaire.Config.TherapistMatch.gender.options.0' },
					{ value: 'Male', label: 'Questionnaire.Config.TherapistMatch.gender.options.1' },
					{ value: 'No preference', label: 'Questionnaire.Config.TherapistMatch.gender.options.2' }
				]
			},
			{
				label: 'Questionnaire.Config.TherapistMatch.importance_label',
				options: [
					{
						value: 'extremely important',
						label: 'Questionnaire.Config.TherapistMatch.importance.options.0'
					},
					{
						value: 'very important',
						label: 'Questionnaire.Config.TherapistMatch.importance.options.1'
					},
					{
						value: 'somewhat important',
						label: 'Questionnaire.Config.TherapistMatch.importance.options.2'
					},
					{
						value: 'not important',
						label: 'Questionnaire.Config.TherapistMatch.importance.options.3'
					}
				]
			}
		]
	},
	therapy_timing: {
		input_type: INPUT_TYPES.SELECT,
		options: [
			{
				value: 'It is extremely important to start as soon as possible',
				label: 'Questionnaire.Config.TherapistMatch.therapy_timing.options.0'
			},
			{
				value: 'Somewhat important to start ASAP',
				label: 'Questionnaire.Config.TherapistMatch.therapy_timing.options.1'
			},
			{
				value: 'can wait a few months for the best therapist for me',
				label: 'Questionnaire.Config.TherapistMatch.therapy_timing.options.2'
			},
			{
				value: 'I Prefer to start in a few months due to personal comittmnents',
				label: 'Questionnaire.Config.TherapistMatch.therapy_timing.options.3'
			}
		]
	}
};

export function getQuestionConfig(questionId) {
	return questionMap[questionId] || { input_type: INPUT_TYPES.TEXT };
}

export function isTherapistMatchQuestion(questionId) {
	return questionId in questionMap;
}
