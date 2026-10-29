import { json } from '@sveltejs/kit';
import { getAllocatedTests, allocateTest, allocateTestsBatch } from '$lib/database/testAllocations';
import { connectToDatabase } from '$lib/database/connection.js';

export async function GET({ locals }) {
	console.log('Received GET request for allocated tests');
	console.log('User in locals:', locals.user);

	if (!locals.user) {
		console.log('No user found in locals');
		return new Response(null, {
			status: 302,
			headers: {
				Location: '/login'
			}
		});
	}

	try {
		await connectToDatabase();

		const userId = locals.user._id || locals.user.id; // Handle both MongoDB _id and potential legacy id
		console.log('Fetching allocated tests for user ID:', userId);

		const allocatedTests = await getAllocatedTests(userId);
		console.log('Allocated tests for user:', allocatedTests);

		return json(allocatedTests);
	} catch (error) {
		console.error('Error fetching allocated tests:', error);
		return new Response(`Error fetching allocated tests: ${error.message}`, { status: 500 });
	}
}

export async function POST({ request, locals }) {
	console.log('Received POST request for allocating tests');

	if (!locals.user || locals.user.userType !== 'admin') {
		console.log('Unauthorized: User is not an admin');
		return new Response(null, {
			status: 302,
			headers: {
				Location: '/login'
			}
		});
	}

	try {
		await connectToDatabase();
		const { userId, questionnaireIds } = await request.json();
		console.log('Allocating tests:', { userId, questionnaireIds });

		const result = await allocateTestsBatch(userId, questionnaireIds, locals.user._id);

		if (!result.success && result.message === 'All selected questionnaires are already allocated') {
			return json({
				message: result.message,
				results: []
			});
		}

		return json({
			message: result.message || 'Tests allocated successfully',
			results: result.results || []
		});
	} catch (error) {
		console.error('Error allocating tests:', error);
		return json({ error: error.message }, { status: 500 });
	}
}
