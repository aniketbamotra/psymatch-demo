import { User } from '$lib/database/schemas';
import { initDatabase } from '$lib/database/init';
import { DEMO_MODE } from '$lib/demo/mode.js';

// Shared by concurrent requests on a cold start so the database is only
// initialised (and, in demo mode, seeded) once per server instance.
let databaseReady = null;

function ensureDatabaseInitialized() {
	if (!databaseReady) {
		databaseReady = initDatabase().catch((error) => {
			databaseReady = null;
			throw error;
		});
	}
	return databaseReady;
}

// AI report generation calls the separate psymatch-agent service, which the
// demo doesn't have. Reads still work; actions are refused. (Redaction runs in
// demo mode without its AI phase; see api/anonymization/process.)
const DEMO_DISABLED_API = /^\/api\/(comprehensive-report|ai-report|generative-summary)(\/|$)/;

async function getUserFromSession(sessionId) {
	try {
		return await User.findOne({
			'session.id': sessionId,
			$or: [{ 'session.expires': { $gt: new Date() } }, { 'session.expires': null }]
		}).select('-adminProfile.passwordHash -patientProfile.passwordHash'); // Exclude password hashes from the result
	} catch (error) {
		console.error('Error getting user from session:', error);
		return null;
	}
}

export async function handle({ event, resolve }) {
	try {
		if (DEMO_MODE && event.request.method !== 'GET' && DEMO_DISABLED_API.test(event.url.pathname)) {
			return Response.json(
				{ success: false, error: 'AI reports are disabled in this demo.' },
				{ status: 503 }
			);
		}

		await ensureDatabaseInitialized();

		const sessionId = event.cookies.get('session');
		if (sessionId) {
			event.locals.user = await getUserFromSession(sessionId);
		}

		// Handle authentication and authorization
		const protectedRoutes = ['/admin', '/patient'];

		if (protectedRoutes.some((route) => event.url.pathname.startsWith(route))) {
			const user = event.locals.user;

			if (!user) {
				return new Response(null, {
					status: 302,
					headers: {
						Location: '/login'
					}
				});
			}

			// Check if the user has the correct userType for the route
			const isAdmin = user.userType === 'admin';
			const isPatient = user.userType === 'patient';

			if (
				(event.url.pathname.startsWith('/admin') && !isAdmin) ||
				(event.url.pathname.startsWith('/patient') && !isPatient)
			) {
				return new Response(null, {
					status: 302,
					headers: {
						Location: '/login'
					}
				});
			}
		}

		return await resolve(event);
	} catch (error) {
		console.error('Unhandled error in hooks.server.js:', error);
		return new Response('Internal Server Error', { status: 500 });
	}
}
