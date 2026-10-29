import { json } from '@sveltejs/kit';
import { User } from '$lib/database/schemas';

export async function GET({ url }) {
	try {
		const token = url.searchParams.get('token');
		console.log('Token:', token);
		if (!token) {
			return json({ error: 'Token is required' }, { status: 400 });
		}

		const user = await User.findOne({
			resetPasswordToken: token
		}).select('email fullName patientProfile.preferredLanguage');
		console.log('User:', user);
		if (!user) {
			return json({ error: 'Invalid or expired token' }, { status: 400 });
		}

		return json({
			email: user.email,
			name: user.fullName,
			language: user.patientProfile?.preferredLanguage || 'en'
		});
	} catch (error) {
		console.error('Error getting user info:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
