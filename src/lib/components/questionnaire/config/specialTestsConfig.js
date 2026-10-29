import { INPUT_TYPES } from './questionTypes.js';

// Configuration for Specific Phobia Test
const specificPhobiaConfig = {
	q2: {
		input_type: INPUT_TYPES.TEXTAREA,
		placeholder: 'Questionnaire.Config.SpecificPhobia.q2.placeholder',
		required: true
	},
	q3: {
		input_type: INPUT_TYPES.TEXTAREA,
		placeholder: 'Questionnaire.Config.SpecificPhobia.q3.placeholder',
		required: true
	}
};

// Configuration for Anorexia Test
const anorexiaConfig = {
	q11: {
		input_type: 'bmi_calculator', // Custom type for weight/height conversion
		fields: [
			{
				id: 'weight',
				type: 'number',
				label: 'Questionnaire.Config.Anorexia.weight_label',
				placeholder: 'Questionnaire.Config.Anorexia.weight_placeholder'
			},
			{
				id: 'weightUnit',
				type: 'select',
				label: 'Questionnaire.Config.Anorexia.unit_label',
				options: ['kg', 'lbs']
			},
			{
				id: 'height',
				type: 'number',
				label: 'Questionnaire.Config.Anorexia.height_label',
				placeholder: 'Questionnaire.Config.Anorexia.height_placeholder'
			},
			{
				id: 'heightUnit',
				type: 'select',
				label: 'Questionnaire.Config.Anorexia.unit_label',
				options: ['cm', 'ft']
			}
		],
		required: true
	}
};

// Get configuration based on test code and question ID
export function getQuestionConfig(testCode, questionId) {
	if (testCode === 'specific_phobia_test') {
		return specificPhobiaConfig[questionId] || { input_type: INPUT_TYPES.TEXT };
	} else if (testCode === 'anorexia_test') {
		return anorexiaConfig[questionId] || { input_type: INPUT_TYPES.TEXT };
	}
	return null;
}
