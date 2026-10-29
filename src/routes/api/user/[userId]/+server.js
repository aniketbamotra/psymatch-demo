import { json } from '@sveltejs/kit';
import { connectToDatabase } from '$lib/database/connection.js';
import { User, Status } from '$lib/database/schemas.js';
import { normalizeLanguage } from '$lib/utils/language.js';

export async function GET({ params, locals }) {
	if (!locals.user || locals.user.userType !== 'admin') {
		return new Response('Unauthorized', { status: 401 });
	}

	try {
		await connectToDatabase();
		const userId = params.userId;

		const user = await User.findById(userId).lean();

		if (!user) {
			return json({ error: 'User not found' }, { status: 404 });
		}

		// Add dateOfReg and lastActivity for patients
		if (user.userType === 'patient') {
			user.dateOfReg = user.createdAt;

			// Get last activity from Status collection
			const status = await Status.findOne({ patientId: userId }).select('lastActivity').lean();

			user.lastActivity = status?.lastActivity || user.createdAt;
		}

		return json({ user });
	} catch (error) {
		console.error('Error fetching user:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}

export async function PUT({ request, params, locals }) {
	if (!locals.user || locals.user.userType !== 'admin') {
		return new Response('Unauthorized', { status: 401 });
	}

	try {
		await connectToDatabase();
		const userId = params.userId;
		const updates = await request.json();

		console.log('PUT /api/user/[userId] - Updates received:', JSON.stringify(updates, null, 2));

		// Preferred language is mandatory: an edit must never be able to blank it. An
		// empty string fails the Mongo enum and would 500 the whole save, so coerce
		// anything unrecognised to English. Both the nested and dotted forms are sent
		// by different callers.
		if (updates?.patientProfile && 'preferredLanguage' in updates.patientProfile) {
			updates.patientProfile.preferredLanguage = normalizeLanguage(
				updates.patientProfile.preferredLanguage
			);
		}
		if (updates && 'patientProfile.preferredLanguage' in updates) {
			updates['patientProfile.preferredLanguage'] = normalizeLanguage(
				updates['patientProfile.preferredLanguage']
			);
		}

		// Update the user document with all provided updates
		const updatedUser = await User.findByIdAndUpdate(
			userId,
			{ $set: updates },
			{ new: true, runValidators: true }
		).lean();

		if (!updatedUser) {
			return json({ error: 'User not found' }, { status: 404 });
		}

		console.log(
			'PUT /api/user/[userId] - Updated user patientProfile:',
			JSON.stringify(updatedUser.patientProfile, null, 2)
		);

		// Return the full user object with all fields
		return json({ user: updatedUser });
	} catch (error) {
		console.error('Error updating user:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}

export async function DELETE({ params, locals }) {
	if (!locals.user || locals.user.userType !== 'admin') {
		return new Response(null, {
			status: 302,
			headers: {
				Location: '/login'
			}
		});
	}

	const userId = params.userId;
	if (!userId) {
		return json({ error: 'User ID is required' }, { status: 400 });
	}

	try {
		await connectToDatabase();

		// Get the user to be deleted
		const userToDelete = await User.findById(userId);
		if (!userToDelete) {
			return json({ error: 'User not found' }, { status: 404 });
		}

		// If trying to delete an admin, check if the current user is a director
		if (userToDelete.userType === 'admin' && !locals.user.isDirector) {
			return json({ error: 'Only directors can remove admin users' }, { status: 403 });
		}

		// Delete followups if it's a patient
		if (userToDelete.userType === 'patient') {
			// Delete followups
			await import('$lib/database/schemas.js').then(async ({ Followup }) => {
				await Followup.deleteMany({ patientId: userId });
			});

			// Delete test responses
			await import('$lib/database/schemas.js').then(async ({ Response }) => {
				await Response.deleteMany({ userId: userId });
			});

			// Delete test assignments
			await import('$lib/database/schemas.js').then(async ({ Assignment }) => {
				await Assignment.deleteMany({ patientId: userId });
			});
		}

		// Finally delete the user
		await userToDelete.deleteOne();

		return json({ message: 'User and related data deleted successfully' });
	} catch (error) {
		console.error('Error deleting user:', error);
		return json({ error: 'Error deleting user' }, { status: 500 });
	}
}
