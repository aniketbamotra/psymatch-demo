import { Questionnaire } from '../../schemas.js';

function validateQuestionnaireData(questionnaire) {
	if (!questionnaire) {
		throw new Error('Questionnaire data is undefined');
	}

	// Validate required metadata
	if (!questionnaire.title) {
		throw new Error('Questionnaire title is required');
	}

	if (!questionnaire.test_code) {
		throw new Error('Questionnaire test_code is required');
	}

	// Initialize arrays if undefined
	questionnaire.questions = questionnaire.questions || [];
	questionnaire.questionDisplayLogic = questionnaire.questionDisplayLogic || [];

	// Validate questions
	questionnaire.questions.forEach((question, index) => {
		if (!question.id || !question.text || !question.answer_type) {
			throw new Error(`Invalid question at index ${index} in ${questionnaire.title}`);
		}

		// Validate scale format (all questions use scale, both boolean and scale types)
		if (!Array.isArray(question.scale) || question.scale.length === 0) {
			throw new Error(`Invalid scale in question ${question.id} of ${questionnaire.title}`);
		}

		// Validate each scale option has num and text properties
		question.scale.forEach((option, optionIndex) => {
			if (
				!Object.prototype.hasOwnProperty.call(option, 'num') ||
				!Object.prototype.hasOwnProperty.call(option, 'text')
			) {
				throw new Error(
					`Invalid scale option at index ${optionIndex} in question ${question.id} of ${questionnaire.title}: missing num or text property`
				);
			}
			if (typeof option.num !== 'number' || typeof option.text !== 'string') {
				throw new Error(
					`Invalid scale option at index ${optionIndex} in question ${question.id} of ${questionnaire.title}: invalid type for num or text`
				);
			}
		});

		// Validate dynamic question fields if present
		if (question.is_dynamically_generated_question === 'Yes') {
			if (!Array.isArray(question.summary_voiceover_parts)) {
				throw new Error(
					`Missing summary_voiceover_parts for dynamic question ${question.id} of ${questionnaire.title}`
				);
			}
		}
	});

	return questionnaire;
}

export async function saveQuestionnaire(questionnaire) {
	try {
		if (!questionnaire) {
			throw new Error('Cannot save undefined questionnaire');
		}

		console.log(`Processing questionnaire: ${questionnaire.title}`);

		// Validate questionnaire data before saving
		const validatedQuestionnaire = validateQuestionnaireData(questionnaire);

		const existingQuestionnaire = await Questionnaire.findOne({
			test_code: questionnaire.test_code
		});

		if (!existingQuestionnaire) {
			const newQuestionnaire = await Questionnaire.create(validatedQuestionnaire);
			console.log(`Created questionnaire: ${questionnaire.title}`);
			console.log(`Questions: ${newQuestionnaire.questions}`);
			console.log(newQuestionnaire.questions);
			return newQuestionnaire;
		} else {
			// Update existing questionnaire
			const updatedQuestionnaire = await Questionnaire.findOneAndUpdate(
				{ test_code: questionnaire.test_code },
				validatedQuestionnaire,
				{
					new: true,
					runValidators: true
				}
			);
			console.log(`Updated questionnaire: ${questionnaire.title}`);
			console.log(`Questions: ${updatedQuestionnaire.questions.length}`);
			console.log(updatedQuestionnaire.questions);
			return updatedQuestionnaire;
		}
	} catch (error) {
		console.error(`Error saving questionnaire ${questionnaire?.title}:`, error);
		if (error.errors) {
			Object.keys(error.errors).forEach((key) => {
				console.error(`Validation error for ${key}:`, error.errors[key].message);
				if (error.errors[key].value) {
					console.error(`Invalid value:`, error.errors[key].value);
				}
			});
		}
		throw error;
	}
}

export async function saveQuestionnaires(questionnaires) {
	try {
		if (!Array.isArray(questionnaires)) {
			throw new Error('Expected questionnaires to be an array');
		}

		console.log(`Saving ${questionnaires.length} questionnaires...`);

		const savedQuestionnaires = await Promise.all(
			questionnaires.map((questionnaire) => saveQuestionnaire(questionnaire))
		);

		console.log('Successfully saved all questionnaires');
		return savedQuestionnaires;
	} catch (error) {
		console.error('Error saving questionnaires:', error);
		throw error;
	}
}

export async function validateQuestionnaires(questionnaires) {
	try {
		if (!Array.isArray(questionnaires)) {
			throw new Error('Expected questionnaires to be an array');
		}

		console.log('Validating saved questionnaires...');

		const validationResults = await Promise.all(
			questionnaires.map(async (questionnaire) => {
				if (!questionnaire || !questionnaire.test_code) {
					return {
						title: 'Unknown',
						valid: false,
						issues: ['Invalid questionnaire data']
					};
				}

				const savedQuestionnaire = await Questionnaire.findOne({
					test_code: questionnaire.test_code
				});

				if (!savedQuestionnaire) {
					return {
						title: questionnaire.title || 'Unknown',
						valid: false,
						issues: [`Questionnaire ${questionnaire.title} not found in database`]
					};
				}

				// Validate essential components
				const validationResult = {
					title: questionnaire.title,
					valid: true,
					issues: []
				};

				if (savedQuestionnaire.questions.length !== questionnaire.questions.length) {
					validationResult.valid = false;
					validationResult.issues.push(
						`Question count mismatch: expected ${questionnaire.questions.length}, got ${savedQuestionnaire.questions.length}`
					);
				}

				// Log validation result
				if (validationResult.valid) {
					console.log(`Validation successful for ${questionnaire.title}`);
				} else {
					console.warn(
						`Validation issues found for ${questionnaire.title}:`,
						validationResult.issues
					);
				}

				return validationResult;
			})
		);

		console.log('Validation results:', validationResults);
		return validationResults;
	} catch (error) {
		console.error('Error validating questionnaires:', error);
		throw error;
	}
}
