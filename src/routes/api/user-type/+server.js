import { json } from '@sveltejs/kit';
import { User } from '$lib/database/schemas';

export async function GET({ cookies }) {
	try {
		const sessionId = cookies.get('session');
		if (!sessionId) {
			return json({ userType: null });
		}

		const user = await User.findOne({
			'session.id': sessionId,
			$or: [{ 'session.expires': { $gt: new Date() } }, { 'session.expires': null }]
		}).select('userType');

		return json({ userType: user?.userType || null });
	} catch (error) {
		console.error('Error getting user type:', error);
		return json({ userType: null });
	}
}
