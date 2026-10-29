import { json } from '@sveltejs/kit';
import {
	saveQuestionnaireResult,
	getQuestionnaireResult,
	completeQuestionnaire,
	bulkClearResponsesAhead,
	sanitizeResponseSequence
} from '$lib/database/questionnaireResults.js';
import { connectToDatabase } from '$lib/database/connection.js';
import { Assignment, Response, Status } from '$lib/database/schemas.js';

export async function GET({ url, locals }) {
	if (!locals.user) {
		return new Response(null, {
			status: 302,
			headers: {
				Location: '/login'
			}
		});
	}

	const testName = url.searchParams.get('testName');

	if (!testName) {
		return json({ error: 'testName parameter is required' }, { status: 400 });
	}

	try {
		await connectToDatabase();
		const userId = locals.user._id || locals.user.id;
		const result = await getQuestionnaireResult(userId, testName);
		return json(result);
	} catch (error) {
		console.error('Error fetching questionnaire result:', error);
		return json({ error: 'Internal server error', details: error.message }, { status: 500 });
	}
}

export async function POST({ request, locals }) {
	if (!locals.user) {
		return new Response(null, {
			status: 302,
			headers: {
				Location: '/login'
			}
		});
	}

	let body;
	try {
		body = await request.json();
	} catch (error) {
		console.error('Error parsing request body:', error);
		return json({ error: 'Invalid JSON in request body' }, { status: 400 });
	}

	// If userId is provided, fetch completed assignments
	if (body.userId) {
		try {
			console.log('Fetching completed assignments for userId:', body.userId);
			await connectToDatabase();

			// Find all completed assignments for the user
			const assignments = await Assignment.find({
				patientId: body.userId,
				status: 'completed'
			})
				.populate('questionnaireId', 'title test_code')
				.sort('assignedAt');

			console.log('Found assignments:', {
				count: assignments.length,
				assignments: assignments.map((a) => ({
					id: a._id,
					patientId: a.patientId,
					questionnaireId: a.questionnaireId?._id,
					title: a.questionnaireId?.title,
					status: a.status,
					assignedAt: a.assignedAt
				}))
			});

			// Get responses for these assignments
			const results = await Promise.all(
				assignments.map(async (assignment) => {
					const response = await Response.findOne({ assignmentId: assignment._id });
					console.log('Found response for assignment:', {
						assignmentId: assignment._id,
						hasResponse: !!response,
						responseId: response?._id,
						submittedAt: response?.submittedAt
					});

					return {
						_id: assignment._id,
						title: assignment.questionnaireId.title,
						testName: assignment.questionnaireId.test_code,
						assignedAt: assignment.assignedAt,
						submittedAt: response?.submittedAt,
						responses: response?.responses || []
					};
				})
			);

			console.log('Final results:', {
				count: results.length,
				results: results.map((r) => ({
					id: r._id,
					title: r.title,
					testName: r.testName,
					hasResponses: r.responses.length > 0
				}))
			});

			return json(results);
		} catch (error) {
			console.error('Error fetching assignments:', error);
			return json({ error: 'Internal server error', details: error.message }, { status: 500 });
		}
	}

	// Handle saving new questionnaire result
	const { testName, questionId, answer } = body;

	if (!testName || !questionId || answer === undefined) {
		return json({ error: 'testName, questionId, and answer are required' }, { status: 400 });
	}

	try {
		await connectToDatabase();
		const userId = locals.user._id || locals.user.id;
		await saveQuestionnaireResult(userId, testName, questionId, answer);

		// Update Status: change from 'onboarded' to 'active' on first submission
		const status = await Status.findOne({ patientId: userId });
		if (status) {
			status.lastActivity = new Date();

			// If patient is onboarded, change to active when they start answering
			if (status.status === 'onboarded' || status.status === 'inactive') {
				status.status = 'active';
			}

			await status.save();
		}

		console.log('Answer saved successfully');
		return json({ message: 'Answer saved successfully' });
	} catch (error) {
		console.error('Error saving questionnaire result:', error);
		return json({ error: 'Internal server error', details: error.message }, { status: 500 });
	}
}

export async function PUT({ request, locals }) {
	if (!locals.user) {
		return new Response(null, {
			status: 302,
			headers: {
				Location: '/login'
			}
		});
	}

	let body;
	try {
		body = await request.json();
	} catch (error) {
		console.error('Error parsing request body:', error);
		return json({ error: 'Invalid JSON in request body' }, { status: 400 });
	}

	const { testName } = body;

	if (!testName) {
		return json({ error: 'testName is required' }, { status: 400 });
	}

	try {
		await connectToDatabase();
		const userId = locals.user._id || locals.user.id;
		await completeQuestionnaire(userId, testName);
		return json({ message: 'Questionnaire completed successfully' });
	} catch (error) {
		console.error('Error completing questionnaire:', error);
		return json({ error: 'Internal server error', details: error.message }, { status: 500 });
	}
}

export async function PATCH({ request, locals }) {
	if (!locals.user) {
		return new Response(null, {
			status: 302,
			headers: { Location: '/login' }
		});
	}

	let body;
	try {
		body = await request.json();
	} catch (error) {
		console.error('Error parsing request body:', error);
		return json({ error: 'Invalid JSON in request body' }, { status: 400 });
	}

	const { testName, operation, parameters } = body;

	if (!testName || !operation) {
		return json({ error: 'testName and operation are required' }, { status: 400 });
	}

	try {
		await connectToDatabase();
		const userId = locals.user._id || locals.user.id;

		if (operation === 'clearResponsesAhead') {
			const { currentIndex } = parameters || {};

			if (currentIndex === undefined) {
				return json({ error: 'currentIndex parameter is required' }, { status: 400 });
			}

			await bulkClearResponsesAhead(userId, testName, currentIndex);
			return json({ message: 'Responses cleared successfully' });
		} else if (operation === 'sanitizeSequence') {
			await sanitizeResponseSequence(userId, testName);
			return json({ message: 'Responses sanitized successfully' });
		} else {
			return json({ error: 'Unknown operation' }, { status: 400 });
		}
	} catch (error) {
		console.error(`Error performing ${operation}:`, error);
		return json({ error: 'Internal server error', details: error.message }, { status: 500 });
	}
}
