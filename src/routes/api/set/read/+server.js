import { json } from '@sveltejs/kit';
import { connectToDatabase } from '$lib/database/connection.js';
import { Set, Questionnaire, Assignment, Response, User } from '$lib/database/schemas.js';

/**
 * GET /api/set/read — Read all sets
 * Supports query modes: ?mode=assign | ?mode=patientPopup&patientId=xxx
 * Admin-only route
 */
export async function GET({ url, locals }) {
	if (!locals.user || locals.user.userType !== 'admin') {
		return json({ error: 'Unauthorized' }, { status: 403 });
	}

	try {
		await connectToDatabase();

		const mode = url.searchParams.get('mode');

		// ── MODE: assign ──────────────────────────────────────────────
		if (mode === 'assign') {
			const sets = await Set.find({ status: 'active' })
				.populate('interviews', '_id title test_code')
				.lean();

			return json({
				sets: sets.map((set) => ({
					_id: set._id,
					set_name: set.set_name,
					status: set.status,
					interviews: set.interviews
				}))
			});
		}

		// ── MODE: patientPopup ────────────────────────────────────────
		if (mode === 'patientPopup') {
			const patientId = url.searchParams.get('patientId');

			if (!patientId) {
				return json({ error: 'patientId is required for patientPopup mode' }, { status: 400 });
			}

			const mongoose = (await import('mongoose')).default;
			if (!mongoose.Types.ObjectId.isValid(patientId)) {
				return json({ error: 'Invalid patient ID format' }, { status: 400 });
			}

			// Verify patient exists
			const patient = await User.findById(patientId).lean();
			if (!patient) {
				return json({ error: 'Patient not found' }, { status: 404 });
			}

			const allSets = await Set.find({ status: 'active' })
				.populate('interviews', '_id title test_code questions')
				.lean();

			// Get all assignments for this patient
			const patientAssignments = await Assignment.find({
				patientId,
				status: { $ne: 'removed' }
			}).lean();

			// Get responses for progress calculation
			const assignmentIds = patientAssignments.map((a) => a._id);
			const responses = await Response.find({
				assignmentId: { $in: assignmentIds }
			}).lean();

			const responseMap = {};
			responses.forEach((r) => {
				responseMap[r.assignmentId.toString()] = r;
			});

			const resultSets = [];

			for (const set of allSets) {
				if (set.interviews.length === 0) continue;

				const interviewResults = [];
				let allAssigned = true;

				for (const interview of set.interviews) {
					// Find assignment for this interview + patient
					const assignment = patientAssignments.find(
						(a) => a.questionnaireId.toString() === interview._id.toString()
					);

					if (assignment) {
						const response = responseMap[assignment._id.toString()];
						const totalQuestions = interview.questions ? interview.questions.length : 0;
						const completedQuestions = response?.responses?.length || 0;

						interviewResults.push({
							_id: interview._id,
							title: interview.title,
							test_code: interview.test_code,
							assignmentId: assignment._id,
							status: assignment.status,
							completedQuestions,
							totalQuestions
						});
					} else {
						allAssigned = false;
					}
				}

				// Only include sets where ALL interviews are assigned to this patient.
				// Partially-assigned interviews will fall into the "Others" set.
				if (!allAssigned || interviewResults.length === 0) continue;

				// Compute info
				const completedCount = interviewResults.filter(
					(i) => i.status === 'completed' || i.status === 'downloaded'
				).length;
				const totalInSet = interviewResults.length;
				const allDownloaded =
					interviewResults.length > 0 &&
					interviewResults.every((i) => i.status === 'downloaded');
				const info = allDownloaded ? 'Printed' : `${completedCount}/${totalInSet}`;

				resultSets.push({
					_id: set._id,
					set_name: set.set_name,
					info,
					interviews: interviewResults.map((i) => ({
						...i,
						questions: undefined // Remove questions array from response
					}))
				});
			}

			// Gather unmapped Assignments to form an "Others" Set
			const mappedAssignmentIds = resultSets.flatMap((set) =>
				set.interviews.map((i) => i.assignmentId?.toString()).filter(Boolean)
			);

			const unmappedAssignments = patientAssignments.filter(
				(a) => !mappedAssignmentIds.includes(a._id.toString())
			);

			if (unmappedAssignments.length > 0) {
				const unmappedQuestionnaireIds = unmappedAssignments.map((a) => a.questionnaireId);
				const unmappedQuestionnaires = await Questionnaire.find({
					_id: { $in: unmappedQuestionnaireIds }
				}).lean();

				const othersInterviews = [];

				for (const assignment of unmappedAssignments) {
					const q = unmappedQuestionnaires.find(
						(qu) => qu._id.toString() === assignment.questionnaireId.toString()
					);
					if (q) {
						const response = responseMap[assignment._id.toString()];
						const completedQuestions = response?.responses?.length || 0;
						othersInterviews.push({
							_id: q._id,
							title: q.title,
							test_code: q.test_code,
							assignmentId: assignment._id,
							status: assignment.status,
							completedQuestions,
							totalQuestions: q.questions ? q.questions.length : 0
						});
					}
				}

				if (othersInterviews.length > 0) {
					const completedCount = othersInterviews.filter(
						(i) => i.status === 'completed' || i.status === 'downloaded'
					).length;
					const allDownloaded =
						othersInterviews.length > 0 && othersInterviews.every((i) => i.status === 'downloaded');
					const info = allDownloaded ? 'Printed' : `${completedCount}/${othersInterviews.length}`;

					resultSets.push({
						_id: 'others_set', // Fake ID for Svelte loop
						set_name: 'Others',
						info,
						interviews: othersInterviews
					});
				}
			}

			return json({ sets: resultSets });
		}

		// ── DEFAULT: Read all sets ────────────────────────────────────
		const sets = await Set.find().lean();

		// Batch-compute "sent" (downloaded assignments) across all sets in one query
		const allInterviewIds = sets.flatMap((s) => s.interviews || []);

		const sentAgg = await Assignment.aggregate([
			{ $match: { questionnaireId: { $in: allInterviewIds }, status: 'downloaded' } },
			{ $group: { _id: '$questionnaireId', count: { $sum: 1 } } }
		]);

		// Map questionnaireId → downloaded count
		const sentMap = {};
		sentAgg.forEach(({ _id, count }) => {
			sentMap[_id.toString()] = count;
		});

		const result = sets.map((set) => {
			const sent = (set.interviews || []).reduce(
				(sum, id) => sum + (sentMap[id.toString()] || 0),
				0
			);
			return {
				_id: set._id,
				set_name: set.set_name,
				status: set.status,
				interviewCount: set.interviews ? set.interviews.length : 0,
				sent,
				createdAt: set.createdAt,
				updatedAt: set.updatedAt
			};
		});

		return json({ sets: result });
	} catch (error) {
		console.error('Error fetching sets:', error);
		return json({ error: 'Failed to fetch sets', details: error.message }, { status: 500 });
	}
}
