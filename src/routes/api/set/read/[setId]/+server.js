import { json } from '@sveltejs/kit';
import { connectToDatabase } from '$lib/database/connection.js';
import { Set, Questionnaire, Assignment } from '$lib/database/schemas.js';
import mongoose from 'mongoose';

/**
 * GET /api/set/read/:setId — Read a single set by ID
 * Returns full set detail with populated interviews, sent count, and all available interviews.
 * Admin-only route
 */
export async function GET({ params, locals }) {
	if (!locals.user || locals.user.userType !== 'admin') {
		return json({ error: 'Unauthorized' }, { status: 403 });
	}

	const { setId } = params;

	if (!mongoose.Types.ObjectId.isValid(setId)) {
		return json({ error: 'Invalid set ID format' }, { status: 400 });
	}

	try {
		await connectToDatabase();

		// Fetch the set with populated interview details
		const set = await Set.findById(setId).populate('interviews', '_id title test_code').lean();

		if (!set) {
			return json({ error: 'Set not found' }, { status: 404 });
		}

		// Count downloaded assignments across all interviews in this set
		const sent = await Assignment.countDocuments({
			questionnaireId: { $in: set.interviews.map((i) => i._id) },
			status: 'downloaded'
		});

		// Fetch all questionnaires for the edit form panel
		const allInterviews = await Questionnaire.find({}, '_id title test_code').lean();

		return json({
			_id: set._id,
			set_name: set.set_name,
			status: set.status,
			interviews: set.interviews,
			interviewCount: set.interviews.length,
			sent,
			allInterviews,
			createdAt: set.createdAt,
			updatedAt: set.updatedAt
		});
	} catch (error) {
		console.error('Error fetching set:', error);
		return json({ error: 'Failed to fetch set', details: error.message }, { status: 500 });
	}
}
