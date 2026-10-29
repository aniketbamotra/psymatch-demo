import { redirect } from '@sveltejs/kit';

export const load = async ({ locals }) => {
	const user = locals.user;

	if (!user) {
		throw redirect(302, '/login');
	}

	if (user.role === 'patient') {
		throw redirect(302, '/patient');
	} else if (user.role === 'admin') {
		throw redirect(302, '/admin');
	} else {
		// If the role is neither patient nor admin, redirect to login
		throw redirect(302, '/login');
	}
};
