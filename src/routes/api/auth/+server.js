import { json } from '@sveltejs/kit';
import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import { User } from '$lib/database/schemas.js';
import { connectToDatabase } from '$lib/database/connection.js';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { verifyRecaptchaToken } from '$lib/utils/recaptcha.js';

console.log('Configuring LocalStrategy');
passport.use(
	new LocalStrategy(
		{
			usernameField: 'email',
			passwordField: 'password'
		},
		async (email, password, done) => {
			console.log(`Attempting authentication for email: ${email}`);
			try {
				await connectToDatabase();
				const user = await User.findOne({ email });
				console.log(`Query result for email ${email}:`, user);

				if (!user) {
					console.log(`No user found with email: ${email}`);
					return done(null, false, { message: 'Incorrect email or password.' });
				}

				let isValidPassword;
				if (user.userType === 'admin') {
					isValidPassword = await bcrypt.compare(password, user.adminProfile.passwordHash);
				} else if (user.userType === 'patient') {
					isValidPassword = await bcrypt.compare(password, user.patientProfile.passwordHash);
				} else {
					console.log(`Invalid user type for user: ${email}`);
					return done(null, false, { message: 'Invalid user type.' });
				}

				console.log(`Password validation result:`, isValidPassword);

				if (!isValidPassword) {
					console.log(`Invalid password for user: ${email}`);
					return done(null, false, { message: 'Incorrect email or password.' });
				}

				console.log(`User authenticated successfully: ${email}`);
				return done(null, user);
			} catch (error) {
				console.error('Error during authentication:', error);
				return done(error);
			}
		}
	)
);

function generateSessionId() {
	return crypto.randomBytes(32).toString('hex');
}

export async function POST({ request, cookies }) {
	console.log('Received POST request to /api/auth');
	console.log('Request method:', request.method);
	console.log('Request headers:', Object.fromEntries(request.headers));

	let requestBody;
	try {
		requestBody = await request.json();
		console.log('Request body:', { ...requestBody, password: '[REDACTED]' });
	} catch (error) {
		console.error('Error parsing request body:', error);
		return json({ error: 'Invalid request body' }, { status: 400 });
	}

	const { email, password, keepSignedIn, recaptchaToken } = requestBody;

	if (!email || !password) {
		console.error('Missing email or password in request');
		return json({ error: 'Email and password are required' }, { status: 400 });
	}

	// Verify reCAPTCHA token
	if (!recaptchaToken) {
		console.error('Missing reCAPTCHA token in request');
		return json({ error: 'reCAPTCHA verification is required' }, { status: 400 });
	}

	// Check if this is an admin login to use appropriate action and threshold
	const isAdminLogin = request.url.includes('/admin') || email.endsWith('@admin.com');
	const expectedAction = isAdminLogin ? 'login_admin' : 'login';
	const customThreshold = isAdminLogin ? 0.3 : 0.3; // Higher threshold for admin login

	try {
		const recaptchaVerification = await verifyRecaptchaToken(
			recaptchaToken,
			expectedAction,
			customThreshold
		);

		if (!recaptchaVerification.success) {
			console.error('reCAPTCHA verification failed:', recaptchaVerification.error);
			return json(
				{
					error: 'Security verification failed',
					details: recaptchaVerification.error
				},
				{ status: 400 }
			);
		}

		console.log('reCAPTCHA verification successful with score:', recaptchaVerification.score);
	} catch (error) {
		console.error('Error during reCAPTCHA verification:', error);
		return json({ error: 'Error during reCAPTCHA verification' }, { status: 500 });
	}

	return new Promise((resolve) => {
		console.log('Calling passport.authenticate');
		passport.authenticate('local', { session: false }, async (err, user, info) => {
			console.log('Inside passport.authenticate callback');
			if (err) {
				console.error('Authentication error:', err);
				return resolve(json({ error: 'An error occurred during authentication' }, { status: 500 }));
			}
			if (!user) {
				console.log('Authentication failed:', info.message);
				return resolve(json({ error: info.message || 'Authentication failed' }, { status: 400 }));
			}

			console.log('Generating session ID');
			const sessionId = generateSessionId();

			const cookieOptions = {
				httpOnly: true,
				secure: process.env.NODE_ENV === 'production',
				sameSite: 'strict',
				path: '/'
			};

			if (keepSignedIn) {
				cookieOptions.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
			}

			cookies.set('session', sessionId, cookieOptions);

			// Store session in user document
			try {
				const updateFields = {
					'session.id': sessionId,
					'session.expires': keepSignedIn ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null
				};

				// Fallback for patient language
				if (user.userType === 'patient' && !user.patientProfile?.preferredLanguage) {
					console.log(`Setting default language 'en' for patient: ${user.email}`);
					updateFields['patientProfile.preferredLanguage'] = 'en';
				}

				await User.updateOne(
					{ _id: user._id },
					{
						$set: updateFields
					}
				);
			} catch (error) {
				console.error('Error storing session:', error);
				return resolve(json({ error: 'An error occurred during authentication' }, { status: 500 }));
			}

			console.log(`Session created for user: ${user.email}`);
			const language =
				user.userType === 'patient' ? user.patientProfile?.preferredLanguage || 'en' : 'en';
			resolve(json({ message: 'Authentication successful', role: user.userType, language }));
		})({ body: { email, password } });
	});
}

export async function GET({ request }) {
	console.log('Received GET request to /api/auth');
	console.log('Request method:', request.method);
	console.log('Request headers:', Object.fromEntries(request.headers));
	return json({ error: 'GET method not supported for authentication' }, { status: 405 });
}

export async function DELETE({ cookies }) {
	console.log('Received DELETE request to /api/auth (logout)');

	const sessionId = cookies.get('session');

	if (sessionId) {
		// Remove session from user document
		try {
			await connectToDatabase();
			await User.updateOne({ 'session.id': sessionId }, { $unset: { session: '' } });
		} catch (error) {
			console.error('Error removing session:', error);
		}
	}

	// Clear the session cookie
	cookies.delete('session', { path: '/' });

	return json({ message: 'Logged out successfully' });
}
