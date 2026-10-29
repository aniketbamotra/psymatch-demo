import { json } from '@sveltejs/kit';
import { Assignment, Response, Questionnaire } from '$lib/database/schemas.js';

/** @type {import('./$types').RequestHandler} */
export async function GET({ params, locals }) {
	try {
		// Check if user is admin
		if (!locals.user || locals.user.userType !== 'admin') {
			return new Response('Unauthorized', { status: 401 });
		}

		const userId = params.userId;

		// Get all assignments for the user
		const assignments = await Assignment.find({ patientId: userId }).lean();
		console.log('Found assignments:', assignments);

		if (!assignments || assignments.length === 0) {
			return json([]);
		}

		// Get valid assignment IDs and questionnaire IDs
		const assignmentIds = assignments.map((a) => a._id).filter((id) => id);
		const questionnaireIds = assignments.map((a) => a.questionnaireId).filter((id) => id);

		console.log('Assignment IDs:', assignmentIds);
		console.log('Questionnaire IDs:', questionnaireIds);

		// Get all responses
		const responses = await Response.find({
			assignmentId: { $in: assignmentIds }
		}).lean();
		console.log('Found responses:', responses);

		// Get all questionnaire details
		const questionnaires = await Questionnaire.find({
			_id: { $in: questionnaireIds }
		}).lean();
		console.log('Found questionnaires:', questionnaires);

		// Calculate progress for each assignment
		const progressData = await Promise.all(
			assignments.map(async (assignment) => {
				try {
					// Find the questionnaire
					const questionnaire = questionnaires.find(
						(q) => q._id.toString() === assignment.questionnaireId.toString()
					);

					if (!questionnaire) {
						console.error('Questionnaire not found for id:', assignment.questionnaireId);
						return null;
					}

					const assignmentResponses = responses.filter(
						(r) => r.assignmentId.toString() === assignment._id.toString()
					);

					const totalQuestions = questionnaire.questions?.length || 20;
					const answeredQuestions =
						assignmentResponses.length > 0 ? assignmentResponses[0].responses.length : 0;
					const progress = Math.round((answeredQuestions / totalQuestions) * 100);

					return {
						id: assignment._id,
						title: questionnaire.title,
						progress,
						totalQuestions,
						answeredQuestions,
						allocatedAt: assignment.assignedAt
					};
				} catch (error) {
					console.error('Error processing allocation:', error);
					return null;
				}
			})
		);

		// Filter out any null values from failed processing
		const validProgressData = progressData.filter((data) => data !== null);

		return json(validProgressData);
	} catch (error) {
		console.error('Error fetching test progress:', error);
		return new Response('Internal Server Error', { status: 500 });
	}
}
