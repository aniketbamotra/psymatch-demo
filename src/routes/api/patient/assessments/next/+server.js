import { json } from '@sveltejs/kit';
import { getNextRecommendedTest } from '$lib/database/testAllocations.js';

/** @type {import('./$types').RequestHandler} */
export async function GET({ locals }) {
	try {
		// 1. Authenticate User
		if (!locals.user) {
			return new Response('Unauthorized', { status: 401 });
		}

		// Optional: Ensure it's a patient (though admins might want to see this too for debugging)
		// For now, let's restrict to patients or admins acting as patients if needed.
		// But the requirement says "accessible to patient".

		// 2. Get Recommended Test
		const result = await getNextRecommendedTest(locals.user._id);

		// 3. Return JSON
		return json(result);
	} catch (error) {
		console.error('Error in /api/patient/assessments/next:', error);
		return json({ error: 'Internal Server Error' }, { status: 500 });
	}
}
