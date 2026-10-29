function validateQuestion(question, index, testName) {
	const validatedQuestion = { ...question };

	// Ensure required fields
	if (!validatedQuestion.id) {
		console.warn(`Question at index ${index} in ${testName} missing ID, generating one...`);
		validatedQuestion.id = `q${index + 1}`;
	} else if (!validatedQuestion.id.startsWith('q')) {
		// Add 'q' prefix if not present
		validatedQuestion.id = `q${validatedQuestion.id}`;
	}

	if (!validatedQuestion.text) {
		console.warn(`Question ${validatedQuestion.id} in ${testName} missing text`);
		validatedQuestion.text = '';
	}

	// Ensure answer_type is present and valid
	if (!validatedQuestion.answer_type) {
		console.warn(
			`Question ${validatedQuestion.id} in ${testName} missing answer_type, defaulting to "scale"...`
		);
		validatedQuestion.answer_type = 'scale';
	}

	// Handle scale and boolean questions
	if (validatedQuestion.answer_type === 'scale') {
		if (!Array.isArray(validatedQuestion.scale) || validatedQuestion.scale.length === 0) {
			throw new Error(
				`Question ${validatedQuestion.id} in ${testName} is missing required scale values`
			);
		}
		// Transform scale to use num and text properties
		validatedQuestion.scale = validatedQuestion.scale.map((item) => {
			const key = Object.keys(item)[0];
			return {
				num: parseInt(key),
				text: item[key]
			};
		});
	} else if (validatedQuestion.answer_type === 'boolean') {
		// Enforce strict Yes=1, No=0 mapping with num and text properties
		validatedQuestion.scale = [
			{ num: 0, text: 'No' },
			{ num: 1, text: 'Yes' }
		];
		// Clean up any custom answer values since we're enforcing strict mapping
		delete validatedQuestion.answer_values;
	}

	// Ensure all fields from the schema are present with defaults
	validatedQuestion.description_for_subsequent_question =
		validatedQuestion.description_for_subsequent_question || '';

	return validatedQuestion;
}

function validateQuestions(questions, testName) {
	if (!Array.isArray(questions)) {
		console.warn(`Questions for ${testName} is not an array, defaulting to empty array`);
		return [];
	}

	const seenIds = new Set();
	const validatedQuestions = [];

	// Filter out non-permanent questions first

	questions.forEach((question, index) => {
		const validatedQuestion = validateQuestion(question, index, testName);

		// Handle duplicate IDs
		if (seenIds.has(validatedQuestion.id)) {
			console.warn(
				`Duplicate question ID ${validatedQuestion.id} in ${testName}, generating new ID...`
			);
			validatedQuestion.id = `q${testName}_${index + 1}`;
		}
		seenIds.add(validatedQuestion.id);

		validatedQuestions.push(validatedQuestion);
	});

	return validatedQuestions;
}

export function transformQuestionnaireData(questionnaire, fileName) {
	try {
		console.log('Transforming questionnaire data for:', fileName);

		if (!questionnaire || !questionnaire.test_structure) {
			throw new Error('Invalid questionnaire data structure');
		}

		const { test_metadata, questions } = questionnaire.test_structure;

		if (!test_metadata || !questions || !questions.question_template) {
			throw new Error('Missing required questionnaire structure components');
		}

		// Extract test code from filename (remove .json extension)
		const test_code = fileName.replace('.json', '');

		const transformedQuestionnaire = {
			title: test_metadata.test_name,
			test_code,
			displayTextBeforeQuestions:
				test_metadata.display_text_before_questions ||
				'Please indicate below whether you have experienced the following:',
			questions: validateQuestions(questions.question_template, test_code),
			questionDisplayLogic: [] // Add logic if needed in future
		};

		console.log('Questionnaire transformed:', {
			title: transformedQuestionnaire.title,
			test_code: transformedQuestionnaire.test_code,
			questionCount: transformedQuestionnaire.questions.length
		});

		return transformedQuestionnaire;
	} catch (error) {
		console.error('Failed to transform questionnaire data:', error);
		throw error;
	}
}
