import { json } from '@sveltejs/kit';
import { Questionnaire } from '$lib/database/schemas.js';
import { connectToDatabase } from '$lib/database/connection.js';

export async function GET({ url, locals }) {
	// Check if user is authenticated
	if (!locals.user) {
		return new Response(null, {
			status: 302,
			headers: {
				Location: '/login'
			}
		});
	}

	await connectToDatabase();

	const testName = url.searchParams.get('testName');

	if (url.searchParams.has('list')) {
		return listQuestionnaires();
	} else if (testName) {
		return getQuestionnaire(testName);
	} else {
		return new Response(
			'Invalid request. Use "testName" parameter to fetch a specific questionnaire or "list" to get all questionnaires.',
			{ status: 400 }
		);
	}
}

async function getQuestionnaire(testName) {
	try {
		console.log(`Received testName: ${testName}`);

		// Try to find by test_code, title (string), or title.en (localized)
		const questionnaire = await Questionnaire.findOne({
			$or: [{ test_code: testName }, { 'title.en': testName }]
		});

		if (!questionnaire) {
			console.error(`Questionnaire not found: ${testName}`);
			return new Response(`Questionnaire not found`, { status: 404 });
		}

		// Validate the questionnaire structure
		if (
			!questionnaire.questions ||
			!Array.isArray(questionnaire.questions) ||
			questionnaire.questions.length === 0
		) {
			console.error(`Invalid questionnaire structure:`, questionnaire);
			return new Response(`Invalid questionnaire structure`, { status: 500 });
		}

		console.log(`Returning ${testName}. Questions: ${questionnaire.questions.length}`);

		// Log the structure of each question
		questionnaire.questions.forEach((question, index) => {
			console.log(`Question ${index + 1}:`, JSON.stringify(question, null, 2));
		});

		return json(questionnaire);
	} catch (error) {
		console.error(`Error processing questionnaire:`, error);
		return new Response(`Internal Server Error: ${error.message}`, { status: 500 });
	}
}

async function listQuestionnaires() {
	try {
		const questionnaires = await Questionnaire.find({}, 'title');
		const questionnaireNames = questionnaires.map((q) => q.title);
		console.log(`Available questionnaires:`, questionnaireNames);
		return json(questionnaireNames);
	} catch (error) {
		console.error('Error listing questionnaires:', error);
		return new Response(`Internal Server Error: ${error.message}`, { status: 500 });
	}
}
