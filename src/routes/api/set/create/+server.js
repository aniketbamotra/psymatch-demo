import { json } from '@sveltejs/kit';
import { connectToDatabase } from '$lib/database/connection.js';
import { Set as SetModel, Questionnaire } from '$lib/database/schemas.js';
import mongoose from 'mongoose';

/**
 * POST /api/set/create — Create a new set
 * Admin-only route
 */
export async function POST({ request, locals }) {
	if (!locals.user || locals.user.userType !== 'admin') {
		return json({ error: 'Unauthorized' }, { status: 403 });
	}

	try {
		await connectToDatabase();

		const { set_name, status, interviews } = await request.json();

		// Validate set_name
		if (!set_name || typeof set_name !== 'string' || set_name.trim() === '') {
			return json({ error: 'set_name is required' }, { status: 400 });
		}

		// Validate status if provided
		if (status && !['active', 'disabled'].includes(status)) {
			return json({ error: 'Invalid status value' }, { status: 400 });
		}

		// Check for duplicate set name
		const existingSet = await SetModel.findOne({
			set_name: { $regex: new RegExp(`^${set_name.trim()}$`, 'i') }
		});
		if (existingSet) {
			return json({ error: 'A set with this name already exists' }, { status: 409 });
		}

		// Validate interviews if provided
		if (interviews && Array.isArray(interviews) && interviews.length > 0) {
			// Check for duplicates
			const uniqueIds = new Set(interviews);
			if (uniqueIds.size !== interviews.length) {
				return json({ error: 'Duplicate interview IDs found' }, { status: 400 });
			}

			// Validate all IDs are valid ObjectIds
			const invalidFormatIds = interviews.filter((id) => !mongoose.Types.ObjectId.isValid(id));
			if (invalidFormatIds.length > 0) {
				return json(
					{ error: 'Invalid interview ID format', invalidIds: invalidFormatIds },
					{ status: 400 }
				);
			}

			// Verify all interviews exist in the Questionnaire collection
			const existingQuestionnaires = await Questionnaire.find({
				_id: { $in: interviews }
			}).select('_id');
			const existingIds = existingQuestionnaires.map((q) => q._id.toString());
			const invalidIds = interviews.filter((id) => !existingIds.includes(id));

			if (invalidIds.length > 0) {
				return json({ error: 'Invalid interview IDs', invalidIds }, { status: 400 });
			}
		}

		const newSet = new SetModel({
			set_name: set_name.trim(),
			status: status || 'active',
			interviews: interviews || []
		});

		await newSet.save();
		return json(newSet, { status: 201 });
	} catch (error) {
		console.error('Error creating set:', error);
		return json({ error: 'Failed to create set', details: error.message }, { status: 500 });
	}
}
