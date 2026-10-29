import { json } from '@sveltejs/kit';
import { connectToDatabase } from '$lib/database/connection.js';
import { Set as SetModel, Questionnaire } from '$lib/database/schemas.js';
import mongoose from 'mongoose';

/**
 * PATCH /api/set/edit — Edit an existing set
 * Admin-only route
 */
export async function PATCH({ request, locals }) {
	if (!locals.user || locals.user.userType !== 'admin') {
		return json({ error: 'Unauthorized' }, { status: 403 });
	}

	try {
		await connectToDatabase();

		const { set_id, set_name, status, interviews } = await request.json();

		// Validate set_id
		if (!set_id) {
			return json({ error: 'set_id is required' }, { status: 400 });
		}
		if (!mongoose.Types.ObjectId.isValid(set_id)) {
			return json({ error: 'Invalid set ID format' }, { status: 400 });
		}

		// Check at least one field to update
		if (set_name === undefined && status === undefined && interviews === undefined) {
			return json({ error: 'No fields to update' }, { status: 400 });
		}

		// Find existing set
		const existingSet = await SetModel.findById(set_id);
		if (!existingSet) {
			return json({ error: 'Set not found' }, { status: 404 });
		}

		// Validate and apply set_name if provided
		if (set_name !== undefined) {
			if (typeof set_name !== 'string' || set_name.trim() === '') {
				return json({ error: 'set_name must be a non-empty string' }, { status: 400 });
			}
			// Check uniqueness (exclude current set)
			const duplicate = await SetModel.findOne({
				_id: { $ne: set_id },
				set_name: { $regex: new RegExp(`^${set_name.trim()}$`, 'i') }
			});
			if (duplicate) {
				return json({ error: 'A set with this name already exists' }, { status: 409 });
			}
			existingSet.set_name = set_name.trim();
		}

		// Validate and apply status if provided
		if (status !== undefined) {
			if (!['active', 'disabled'].includes(status)) {
				return json({ error: 'Invalid status value' }, { status: 400 });
			}
			existingSet.status = status;
		}

		// Validate and apply interviews if provided
		if (interviews !== undefined) {
			if (!Array.isArray(interviews)) {
				return json({ error: 'interviews must be an array' }, { status: 400 });
			}

			if (interviews.length > 0) {
				// Check for duplicates
				const uniqueIds = new Set(interviews);
				if (uniqueIds.size !== interviews.length) {
					return json({ error: 'Duplicate interview IDs found' }, { status: 400 });
				}

				// Validate ObjectId format
				const invalidFormatIds = interviews.filter((id) => !mongoose.Types.ObjectId.isValid(id));
				if (invalidFormatIds.length > 0) {
					return json(
						{ error: 'Invalid interview ID format', invalidIds: invalidFormatIds },
						{ status: 400 }
					);
				}

				// Verify all interviews exist
				const existingQuestionnaires = await Questionnaire.find({
					_id: { $in: interviews }
				}).select('_id');
				const existingIds = existingQuestionnaires.map((q) => q._id.toString());
				const invalidIds = interviews.filter((id) => !existingIds.includes(id));

				if (invalidIds.length > 0) {
					return json({ error: 'Invalid interview IDs', invalidIds }, { status: 400 });
				}
			}

			existingSet.interviews = interviews;
		}

		await existingSet.save();
		return json(existingSet);
	} catch (error) {
		console.error('Error updating set:', error);
		return json({ error: 'Failed to update set', details: error.message }, { status: 500 });
	}
}
