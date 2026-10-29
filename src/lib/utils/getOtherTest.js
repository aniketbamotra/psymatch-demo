import { Assignment, Response } from '$lib/database/schemas.js';

/**
 * Gets responses from another test for the same patient
 * @param {string} test_code - The test code to fetch responses for (e.g., 'depression_test', 'manic_test')
 * @param {string} assignmentId - The current assignment ID
 * @returns {Promise<Object>} The test responses
 */
export async function getOtherTest(test_code, assignmentId) {
	try {
		// First, get the original assignment to find the patientId
		const originalAssignment = await Assignment.findById(assignmentId);
		if (!originalAssignment) {
			throw new Error('Original assignment not found');
		}

		// Find another assignment for the same patient with the requested test_code
		const otherAssignment = await Assignment.findOne({
			patientId: originalAssignment.patientId,
			_id: { $ne: assignmentId } // Exclude the original assignment
		}).populate('questionnaireId');

		if (!otherAssignment) {
			throw new Error('No other test found for this patient');
		}

		// Verify the test type matches the requested test_code
		const testType =
			otherAssignment.questionnaireId.type?.toLowerCase() ||
			otherAssignment.questionnaireId.title?.toLowerCase() ||
			'';

		const isMatchingTest =
			(test_code === 'depression_test' && testType.includes('depression')) ||
			(test_code === 'manic_test' && (testType.includes('manic') || testType.includes('bipolar')));

		if (!isMatchingTest) {
			throw new Error('No matching test type found for this patient');
		}

		// Get the responses for the other assignment
		const responses = await Response.findOne({ assignmentId: otherAssignment._id });
		if (!responses) {
			throw new Error('No responses found for the other test');
		}

		// Format responses into a map with question IDs as keys
		const formattedResponses = {};
		responses.responses.forEach((response) => {
			const key = response.questionId.startsWith('q')
				? response.questionId
				: `q${response.questionId}`;
			formattedResponses[key] = response.value;
		});
		return formattedResponses;
	} catch (error) {
		console.error('Error in getOtherTest:', error);
		return {};
	}
}

/**
 * Gets a specific answer from other test responses
 * @param {string} test_code - The test code to get answers from (e.g., 'depression_test', 'manic_test')
 * @param {number|string} questionId - The question ID to get
 * @param {string} assignmentId - The current assignment ID
 * @returns {Promise<any>} The answer value
 */
export async function getOtherTestAnswer(test_code, questionId, assignmentId) {
	try {
		const otherAnswers = await getOtherTest(test_code, assignmentId);
		return otherAnswers[`q${questionId}`];
	} catch (error) {
		console.error('Error in getOtherTestAnswer:', error);
		return null;
	}
}
