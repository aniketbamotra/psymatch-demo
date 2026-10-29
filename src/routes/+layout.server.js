export const load = async ({ locals }) => {
	return {
		user: locals.user ? JSON.parse(JSON.stringify(locals.user)) : null
	};
};
