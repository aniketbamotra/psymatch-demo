import { json } from '@sveltejs/kit';
import { connectToDatabase } from '$lib/database/connection.js';
import { Set } from '$lib/database/schemas.js';
import mongoose from 'mongoose';

/**
 * PATCH /api/set/edit-status — Bulk toggle set status
 * Admin-only route
 */
export async function PATCH({ request, locals }) {
	if (!locals.user || locals.user.userType !== 'admin') {
		return json({ error: 'Unauthorized' }, { status: 403 });
	}

	try {
		await connectToDatabase();

		const { updates } = await request.json();

		// Validate updates array
		if (!updates || !Array.isArray(updates) || updates.length === 0) {
			return json({ error: 'updates must be a non-empty array' }, { status: 400 });
		}

		// Validate each entry
		for (const update of updates) {
			if (!update.set_id) {
				return json({ error: 'Each update must have a set_id' }, { status: 400 });
			}
			if (!mongoose.Types.ObjectId.isValid(update.set_id)) {
				return json({ error: 'Invalid set ID format in updates' }, { status: 400 });
			}
			if (!update.status || !['active', 'disabled'].includes(update.status)) {
				return json({ error: 'Invalid status value in updates' }, { status: 400 });
			}
		}

		// Apply all updates
		const results = [];
		for (const update of updates) {
			const updatedSet = await Set.findByIdAndUpdate(
				update.set_id,
				{ status: update.status },
				{ new: true }
			)
				.select('_id set_name status')
				.lean();

			if (updatedSet) {
				results.push(updatedSet);
			}
		}

		return json({
			message: 'Status updated successfully',
			updated: results
		});
	} catch (error) {
		console.error('Error updating set status:', error);
		return json({ error: 'Failed to update set status', details: error.message }, { status: 500 });
	}
}
