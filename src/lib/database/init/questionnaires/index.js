import { loadQuestionnaireData } from './loader.js';
import { saveQuestionnaires } from './storage.js';
import { initializeTestLogics } from '../test_logics/index.js';

/**
 * Create initial questionnaires with transformed logic
 * @param {Function} fetch - The fetch function from the event context
 */
export async function createInitialQuestionnaires(fetch) {
	try {
		console.log('Starting questionnaire initialization...');

		// Load questionnaire data with fetch function
		console.log('Loading questionnaire data...');
		const questionnairesData = await loadQuestionnaireData(fetch);
		console.log('Questionnaire data loaded successfully');
		console.log(questionnairesData);

		// Save questionnaires to database
		console.log('Saving questionnaires to database...');
		const savedQuestionnaires = await saveQuestionnaires(questionnairesData);
		console.log('Questionnaires saved successfully');

		// Create map of test codes to questionnaire IDs
		console.log('Creating questionnaire map from saved questionnaires:');
		console.log('Number of saved questionnaires:', savedQuestionnaires.length);
		savedQuestionnaires.forEach((q) => {
			console.log('Questionnaire:', q.test_code, q._id);
		});

		// Create map of test codes to questionnaire IDs, handling both Mongoose docs and plain objects
		const questionnaireMap = new Map(
			savedQuestionnaires.map((questionnaire) => {
				console.log('Processing questionnaire for map:', questionnaire.test_code);
				// Get _id, handling both Mongoose documents and plain objects
				const id = questionnaire._id?.toString() || questionnaire.id?.toString();
				console.log('ID:', id);

				if (!questionnaire.test_code || !id) {
					console.error('Invalid questionnaire:', questionnaire);
					throw new Error(`Invalid questionnaire data: missing test_code or id`);
				}

				return [questionnaire.test_code, id];
			})
		);

		console.log('Created questionnaire map:');
		console.log('Map size:', questionnaireMap.size);
		questionnaireMap.forEach((value, key) => {
			console.log(`${key} => ${value}`);
		});

		// Initialize test logics with questionnaire IDs
		console.log('Initializing test logics...');
		console.log(questionnaireMap);
		await initializeTestLogics(questionnaireMap);
		console.log('Test logics initialized successfully');
	} catch (error) {
		console.error('Error in questionnaire initialization:', error);
		throw error;
	}
}
