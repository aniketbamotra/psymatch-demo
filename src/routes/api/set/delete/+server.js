import { json } from '@sveltejs/kit';
import { connectToDatabase } from '$lib/database/connection.js';
import { Set } from '$lib/database/schemas.js';
import mongoose from 'mongoose';

/**
 * DELETE /api/set/delete — Delete a set
 * Does NOT delete underlying questionnaires or patient assignments
 * Admin-only route
 */
export async function DELETE({ request, locals }) {
	if (!locals.user || locals.user.userType !== 'admin') {
		return json({ error: 'Unauthorized' }, { status: 403 });
	}

	try {
		await connectToDatabase();

		const { set_id } = await request.json();

		// Validate set_id
		if (!set_id) {
			return json({ error: 'set_id is required' }, { status: 400 });
		}
		if (!mongoose.Types.ObjectId.isValid(set_id)) {
			return json({ error: 'Invalid set ID format' }, { status: 400 });
		}

		// Find and delete
		const deletedSet = await Set.findByIdAndDelete(set_id).lean();

		if (!deletedSet) {
			return json({ error: 'Set not found' }, { status: 404 });
		}

		return json({
			message: 'Set deleted successfully',
			deletedSet: {
				_id: deletedSet._id,
				set_name: deletedSet.set_name
			}
		});
	} catch (error) {
		console.error('Error deleting set:', error);
		return json({ error: 'Failed to delete set', details: error.message }, { status: 500 });
	}
}
