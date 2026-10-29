import { json } from '@sveltejs/kit';
import mongoose from 'mongoose';
import { User, Assignment, Questionnaire, Response } from '$lib/database/schemas.js';

/**
 * GET /api/questionnaire-results/:patientId
 * Returns completed assignments for a specific patient
 * Query parameter: includeResponses (boolean, default: true)
 */
export async function GET({ params, url, locals }) {
	try {
		// Authentication check
		if (!locals.user || locals.user.userType !== 'admin') {
			return json(
				{
					success: false,
					error: 'Unauthorized access',
					code: 'UNAUTHORIZED'
				},
				{ status: 401 }
			);
		}

		const { patientId } = params;

		// Parse query parameter
		const includeResponses = url.searchParams.get('includeResponses') !== 'false';

		// Validate patientId format
		if (!mongoose.Types.ObjectId.isValid(patientId)) {
			return json(
				{
					success: false,
					error: 'Invalid patient ID format',
					code: 'INVALID_ID'
				},
				{ status: 400 }
			);
		}

		// Fetch patient information
		const patient = await User.findById(patientId).lean();

		if (!patient || patient.userType !== 'patient') {
			return json(
				{
					success: false,
					error: 'Patient not found',
					code: 'NOT_FOUND'
				},
				{ status: 404 }
			);
		}

		// Fetch only completed or downloaded assignments
		const assignments = await Assignment.find({
			patientId,
			status: { $in: ['completed', 'downloaded'] }
		})
			.populate('questionnaireId')
			.sort({ completedAt: -1 })
			.lean();

		// Build assignments array
		const assignmentsData = await Promise.all(
			assignments.map(async (assignment) => {
				const titleObj = assignment.questionnaireId?.title;
				const title =
					titleObj && typeof titleObj === 'object'
						? titleObj.en || Object.values(titleObj)[0]
						: titleObj || 'Unknown';

				const baseData = {
					assignmentId: assignment._id,
					assignmentName: String(title),
					testCode: assignment.questionnaireId?.test_code || null,
					questionnaireId: assignment.questionnaireId?._id,
					status: assignment.status,
					completedQuestions: 0,
					totalQuestions: assignment.questionnaireId?.questions?.length || 0,
					assignedAt: assignment.assignedAt,
					completedAt: assignment.completedAt,
					downloadedOn: assignment.downloadedOn
				};

				// If includeResponses is false, return without results
				if (!includeResponses) {
					return baseData;
				}

				// Fetch response data
				const response = await Response.findOne({ assignmentId: assignment._id }).lean();

				if (!response) {
					return {
						...baseData,
						results: {
							score: null,
							responses: []
						}
					};
				}

				baseData.completedQuestions = response.responses?.length || 0;

				// Build responses array with question details
				const responsesData = response.responses.map((resp) => {
					// Find the question in the questionnaire
					const question = assignment.questionnaireId?.questions?.find(
						(q) => q.id === resp.questionId
					);

					return {
						questionId: resp.questionId,
						question: question?.text || 'Unknown question',
						answer: resp.value,
						submittedAt: response.submittedAt
					};
				});

				// Calculate score if applicable (this is a placeholder - actual scoring logic may vary)
				let score = null;
				if (assignment.questionnaireId?.questions) {
					// Simple scoring: count of responses
					score = response.responses?.length || 0;
				}

				return {
					...baseData,
					results: {
						score,
						responses: responsesData
					}
				};
			})
		);

		// Build response
		const anonProfile = patient.patientProfile?.anonymizationProfile;
		const result = {
			patientId: patient._id,
			patientName: patient.fullName,
			assignments: assignmentsData,
			anonymizationProfile: anonProfile
				? { status: anonProfile.status, generatedAt: anonProfile.generatedAt, version: anonProfile.version }
				: null
		};

		return json(result);
	} catch (err) {
		console.error('Error fetching questionnaire results:', err);
		return json(
			{
				success: false,
				error: 'Failed to fetch questionnaire results',
				code: 'INTERNAL_ERROR'
			},
			{ status: 500 }
		);
	}
}
