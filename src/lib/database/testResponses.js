import { Response, Assignment } from './schemas.js';
import { connectToDatabase } from './connection.js';
import { getQuestionnaireResults } from './questionnaireResults.js';

// Helper function to normalize response value
function normalizeResponseValue(value) {
	if (typeof value === 'object' && value !== null) {
		if (value.value == 'yes' || value.value == 'Yes') return '1';
		if (value.value == 'no' || value.value == 'No') return '0';
		return value.value || value;
	}
	return value;
}

/**
 * Get test responses for multiple assignments
 */
export async function getMultipleTestResponses(assignmentIds) {
	try {
		if (!Array.isArray(assignmentIds) || assignmentIds.length === 0) {
			throw new Error('Assignment IDs array is required');
		}

		// Ensure database connection
		await connectToDatabase();

		const responses = {};

		for (const assignmentId of assignmentIds) {
			const result = await getQuestionnaireResults(assignmentId);
			if (result) {
				// Normalize responses
				const normalizedResponses = Object.entries(result.responses).reduce((acc, [key, value]) => {
					const questionKey = key.startsWith('q') ? key : `q${key.replace(/\D/g, '')}`;
					acc[questionKey] = normalizeResponseValue(value);
					return acc;
				}, {});

				responses[assignmentId] = normalizedResponses;
			}
		}

		console.log('Found responses for assignments:', {
			requestedCount: assignmentIds.length,
			foundCount: Object.keys(responses).length
		});

		return responses;
	} catch (error) {
		console.error('Error fetching multiple test responses:', error);
		throw error;
	}
}

/**
 * Get test responses with metadata
 */
export async function getTestResponsesWithMetadata(assignmentId) {
	try {
		if (!assignmentId) {
			throw new Error('Assignment ID is required');
		}

		// Ensure database connection
		await connectToDatabase();

		// First get the assignment with populated questionnaire
		const assignment = await Assignment.findById(assignmentId).populate('questionnaireId').lean();

		if (!assignment) {
			console.log('No assignment found:', assignmentId);
			return null;
		}

		// Then get the responses
		const result = await Response.findOne({ assignmentId }).lean();

		if (!result) {
			console.log('No results found for assignment:', assignmentId);
			return null;
		}

		// Format response with metadata
		const formattedResponse = {
			assignmentId: assignment._id,
			testName: assignment.questionnaireId.title,
			testCode: assignment.questionnaireId.test_code,
			questions: assignment.questionnaireId.questions,
			responses: Object.entries(result.responses).reduce((acc, [key, value]) => {
				const questionKey = value.questionId;
				acc[questionKey] = value.value;
				return acc;
			}, {}),
			submittedAt: result.submittedAt
		};

		console.log('Found test response with metadata:', {
			assignmentId,
			testName: formattedResponse.testName,
			responseCount: formattedResponse.responses
		});

		return formattedResponse;
	} catch (error) {
		console.error('Error fetching test response with metadata:', error);
		throw error;
	}
}
