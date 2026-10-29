import { json } from '@sveltejs/kit';
import { connectToDatabase } from '$lib/database/connection.js';
import { Questionnaire, Assignment } from '$lib/database/schemas.js';
import mongoose from 'mongoose';

export async function GET({ params, locals }) {
	if (!locals.user || locals.user.userType !== 'admin') {
		return new Response(null, {
			status: 302,
			headers: {
				Location: '/login'
			}
		});
	}

	try {
		await connectToDatabase();
		const { patientId } = params;

		// Convert patientId to ObjectId
		const patientObjectId = new mongoose.Types.ObjectId(patientId);

		// Get all assignments for this patient
		const assignments = await Assignment.find({ patientId: patientObjectId });

		// Extract all questionnaire IDs that are already assigned
		const assignedQuestionnaireIds = assignments.map((a) => a.questionnaireId);

		console.log('Assigned questionnaire IDs:', assignedQuestionnaireIds);

		// Find all questionnaires that are not in the assigned list
		const unallocatedQuestionnaires = await Questionnaire.find(
			{
				_id: { $nin: assignedQuestionnaireIds }
			},
			'title test_code'
		);

		console.log('Found unallocated questionnaires:', unallocatedQuestionnaires);

		// Force English titles with robust fallback
		const sanitizedQuestionnaires = unallocatedQuestionnaires.map((q) => {
			let title = q.title;
			if (title && typeof title === 'object') {
				// Try English, then first available value, then 'Untitled'
				title =
					title.en ||
					Object.values(title).find((v) => typeof v === 'string') ||
					'Untitled Questionnaire';
			}
			return {
				...q.toObject(),
				title: String(title) // Ensure it's primitive string
			};
		});

		return json(sanitizedQuestionnaires);
	} catch (error) {
		console.error('Error fetching unallocated tests:', error);
		return json({ error: error.message }, { status: 500 });
	}
}
