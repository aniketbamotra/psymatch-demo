import { json } from '@sveltejs/kit';
import { connectToDatabase } from '$lib/database/connection.js';
import { Questionnaire } from '$lib/database/schemas.js';

export async function GET() {
	try {
		await connectToDatabase();
		const questionnaires = await Questionnaire.find({}, 'title test_code');
		return json(questionnaires);
	} catch (error) {
		console.error('Error fetching available questionnaires:', error);
		return json({ error: 'Failed to fetch available questionnaires' }, { status: 500 });
	}
}
