import { redirect } from '@sveltejs/kit';

export const load = async ({ cookies, fetch }) => {
	// Check if session cookie exists
	const sessionId = cookies.get('session');

	if (sessionId) {
		// Get user type from API
		const response = await fetch('/api/user-type');
		const { userType } = await response.json();

		if (userType === 'patient') {
			throw redirect(303, '/patient');
		} else if (userType === 'admin') {
			throw redirect(303, '/admin');
		}
	}

	return {};
};
