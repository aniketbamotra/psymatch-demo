/**
 * Utility functions for Google reCAPTCHA v3 verification
 */

import { env } from '$env/dynamic/private';
import { DEMO_MODE } from '$lib/demo/mode.js';

const VERIFICATION_URL = 'https://www.google.com/recaptcha/api/siteverify';
const SCORE_THRESHOLD = 0.5; // Default threshold - scores below this are considered suspicious

// Action-specific thresholds can be set as needed
const ACTION_SCORE_THRESHOLDS = {
	login: 0.5,
	login_admin: 0.7, // Higher threshold for admin login
	reset_password: 0.5,
	forget_password: 0.5
};

/**
 * Verifies a reCAPTCHA v3 token with Google's verification API
 *
 * @param {string} token - The reCAPTCHA token from the client
 * @param {string} expectedAction - Optional expected action for additional verification
 * @param {number} customThreshold - Optional custom threshold to override the default or action-specific threshold
 * @param {string} remoteIp - Optional IP address of the user
 * @returns {Promise<object>} - The verification result
 */
export async function verifyRecaptchaToken(
	token,
	expectedAction = null,
	customThreshold = null,
	remoteIp = null
) {
	if (!token) {
		return {
			success: false,
			error: 'Missing reCAPTCHA token'
		};
	}

	// Skip reCAPTCHA verification in local development (TLS certificate issues) and
	// in the demo, whose domain is not registered with the reCAPTCHA site key
	if (process.env.NODE_ENV === 'development' || DEMO_MODE) {
		return {
			success: true,
			score: 1.0,
			action: expectedAction,
			challengeTimestamp: new Date().toISOString()
		};
	}

	try {
		// Build the request body
		const formData = new URLSearchParams();
		formData.append('secret', env.RECAPTCHA_SECRET_KEY);
		formData.append('response', token);

		if (remoteIp) {
			formData.append('remoteip', remoteIp);
		}

		// Make the verification request to Google
		const response = await fetch(VERIFICATION_URL, {
			method: 'POST',
			body: formData,
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded'
			}
		});

		// Parse the response
		const data = await response.json();
		console.log('reCAPTCHA verification response:', data);

		if (!data.success) {
			return {
				success: false,
				error: 'reCAPTCHA verification failed',
				errorCodes: data['error-codes']
			};
		}

		// For v3, verify the score meets our threshold
		const score = data.score;
		const action = data.action;

		// Determine the threshold to use
		const threshold =
			customThreshold ||
			(expectedAction && ACTION_SCORE_THRESHOLDS[expectedAction]) ||
			SCORE_THRESHOLD;
		console.log('expectedAction:', expectedAction);
		console.log('action:', action);
		// Verify the action if expectedAction is provided
		if (expectedAction && action !== expectedAction) {
			return {
				success: false,
				error: 'reCAPTCHA action verification failed',
				expected: expectedAction,
				received: action,
				score
			};
		}

		// Verify the score
		if (score < threshold) {
			return {
				success: false,
				error: 'reCAPTCHA score too low',
				score,
				threshold,
				action
			};
		}

		return {
			success: true,
			score,
			action,
			challengeTimestamp: data.challenge_ts
		};
	} catch (error) {
		console.error('Error verifying reCAPTCHA token:', error);
		return {
			success: false,
			error: 'Internal server error during reCAPTCHA verification'
		};
	}
}

/**
 * Higher-order function that wraps an API handler with reCAPTCHA verification
 *
 * @param {Function} handler - The original API request handler
 * @param {string} expectedAction - The expected action name for this endpoint
 * @param {number} customThreshold - Optional custom threshold for this endpoint
 * @returns {Function} - A new handler that verifies reCAPTCHA before calling the original handler
 */
export function withRecaptchaVerification(handler, expectedAction = null, customThreshold = null) {
	return async (request, ...args) => {
		try {
			// Get the request body as JSON
			const body = await request.json();

			// Check if reCAPTCHA token is present
			if (!body.recaptchaToken) {
				return new Response(
					JSON.stringify({
						success: false,
						error: 'reCAPTCHA verification required'
					}),
					{
						status: 400,
						headers: { 'Content-Type': 'application/json' }
					}
				);
			}

			// Verify the token
			const verification = await verifyRecaptchaToken(
				body.recaptchaToken,
				expectedAction,
				customThreshold
			);

			if (!verification.success) {
				return new Response(
					JSON.stringify({
						success: false,
						error: verification.error,
						details: verification
					}),
					{
						status: 400,
						headers: { 'Content-Type': 'application/json' }
					}
				);
			}

			// If verification passed, add the verification result to the request
			// and call the original handler
			return handler(
				// Create a new request with the same data plus verification result, minus the recaptchaToken
				new Request(request.url, {
					method: request.method,
					headers: request.headers,
					body: JSON.stringify({
						...body,
						recaptchaToken: undefined,
						recaptchaVerification: {
							score: verification.score,
							action: verification.action,
							timestamp: verification.challengeTimestamp
						}
					})
				}),
				...args
			);
		} catch (error) {
			console.error('Error in reCAPTCHA middleware:', error);
			return new Response(
				JSON.stringify({
					success: false,
					error: 'Internal server error during reCAPTCHA verification'
				}),
				{
					status: 500,
					headers: { 'Content-Type': 'application/json' }
				}
			);
		}
	};
}
