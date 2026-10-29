import { error } from '@sveltejs/kit';
import { fetchCurrentLegalBundle } from '$lib/utils/legal';

export const load = async ({ locals }) => {
	if (!locals.user || locals.user.userType !== 'admin' || !locals.user.isDirector) {
		throw error(403, 'Director access required');
	}
	const bundle = await fetchCurrentLegalBundle();
	return { bundle };
};
