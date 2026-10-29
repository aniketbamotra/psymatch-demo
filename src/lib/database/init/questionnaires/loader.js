import { transformQuestionnaireData } from './transformer.js';
import depressionTest from './jsons/depression_test.json';
import manicTest from './jsons/manic_test.json';
import generalizedAnxietyTest from './jsons/generalized_anxiety_test.json';
import socialAnxietyTest from './jsons/social_anxiety_test.json';
import sleepDisorderTest from './jsons/sleep_disorder_test.json';
import persistentDepressiveTest from './jsons/persistent_depressive_test.json';
import panicTest from './jsons/panic_test.json';

const TEST_FILES = {
	'depression_test.json': depressionTest,
	'manic_test.json': manicTest,
	'generalized_anxiety_test.json': generalizedAnxietyTest,
	'social_anxiety_test.json': socialAnxietyTest,
	'sleep_disorder_test.json': sleepDisorderTest,
	'persistent_depressive_test.json': persistentDepressiveTest,
	'panic_test.json': panicTest
};

export async function loadQuestionnaireData() {
	try {
		console.log('Loading questionnaire data...');

		const questionnaires = Object.entries(TEST_FILES).map(([fileName, data]) => {
			console.log(`Loading ${fileName}...`);
			return transformQuestionnaireData(data, fileName);
		});

		console.log('Successfully loaded questionnaire data:', {
			count: questionnaires.length,
			questionnaires: questionnaires.map((q) => ({
				title: q.title,
				test_code: q.test_code,
				questionCount: q.questions.length
			}))
		});
		console.log(questionnaires[0].questions[0]);
		return questionnaires;
	} catch (error) {
		console.error('Error loading questionnaire data:', error);
		throw error;
	}
}
