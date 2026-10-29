export const load = async ({ cookies }) => {
	cookies.set('locale', 'en', {
		path: '/',
		httpOnly: false,
		maxAge: 60 * 60 * 24 * 365,
		sameSite: 'lax'
	});
	return {};
};
