import { json } from '@sveltejs/kit';
import { Assignment, Questionnaire, Response } from '$lib/database/schemas.js';
import { connectToDatabase } from '$lib/database/connection.js';
import mongoose from 'mongoose';

/**
 * Get test responses for a patient across multiple assignments of the same test
 */
export async function POST({ request }) {
	try {
		// Ensure database connection
		await connectToDatabase();

		// Parse request body
		const { assignmentId, patientId } = await request.json();

		if (!assignmentId || !patientId) {
			return json({ error: 'Assignment ID and Patient ID are required' }, { status: 400 });
		}

		// Validate ObjectIds
		if (
			!mongoose.Types.ObjectId.isValid(assignmentId) ||
			!mongoose.Types.ObjectId.isValid(patientId)
		) {
			return json({ error: 'Invalid ID format' }, { status: 400 });
		}

		// Find the current assignment to get the questionnaire
		const currentAssignment = await Assignment.findById(assignmentId).populate('questionnaireId');

		if (!currentAssignment) {
			return json({ error: 'Assignment not found' }, { status: 404 });
		}

		const testCode = currentAssignment.questionnaireId.test_code;

		// Find all assignments for this patient with the same test code
		const relatedAssignments = await Assignment.find({
			patientId: patientId,
			status: 'completed',
			_id: { $ne: assignmentId } // Exclude the current assignment
		}).populate('questionnaireId');

		// Filter assignments with matching test code
		const matchingAssignments = relatedAssignments.filter(
			(assignment) => assignment.questionnaireId.test_code === testCode
		);

		// Combine current assignment with matching assignments
		const allRelevantAssignments = [currentAssignment, ...matchingAssignments];

		// Fetch responses for all these assignments
		const allResponses = await Promise.all(
			allRelevantAssignments.map(async (assignment) => {
				const response = await Response.findOne({
					assignmentId: assignment._id
				}).lean();

				return {
					assignmentId: assignment._id,
					responses: response ? response.responses : [],
					submittedAt: response ? response.submittedAt : null
				};
			})
		);

		// Format responses into a consistent structure
		const formattedResponses = allResponses.map((responseSet) => ({
			assignmentId: responseSet.assignmentId,
			submittedAt: responseSet.submittedAt,
			responses: responseSet.responses.reduce((acc, response) => {
				const questionKey = response.questionId.startsWith('q')
					? response.questionId
					: `q${response.questionId.replace(/\D/g, '')}`;
				acc[questionKey] = response.value;
				return acc;
			}, {})
		}));

		console.log('Found responses:', {
			totalAssignments: formattedResponses.length,
			testCode: testCode
		});

		return json({
			testCode: testCode,
			currentAssignmentId: assignmentId,
			responses: formattedResponses
		});
	} catch (error) {
		console.error('Error fetching test responses:', error);
		return json({ error: error.message }, { status: 500 });
	}
}
