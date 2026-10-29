import { goto } from '$app/navigation';
import { allocatedTests } from '$lib/stores/allocatedTests';
import { updateTestProgress } from './testProgress';
import { locale } from '$lib/i18n';
import { get } from 'svelte/store';

export async function login(email, password, keepSignedIn, recaptchaToken) {
	console.log('Login function called with:', { email, keepSignedIn });
	try {
		console.log('Preparing to send POST request to /api/auth');
		const response = await fetch('/api/auth', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ email, password, keepSignedIn, recaptchaToken }),
			credentials: 'include' // This ensures cookies are sent with the request
		});

		console.log('Response received:', {
			status: response.status,
			statusText: response.statusText,
			url: response.url
		});

		if (response.ok) {
			const data = await response.json();
			console.log('Login successful, received data:', data);

			if (data.language) {
				locale.set(data.language);
			}

			// If user is a patient, fetch their allocated tests before returning
			if (data.role === 'patient') {
				const testsResponse = await fetch('/api/allocated-tests', {
					credentials: 'include'
				});
				if (testsResponse.ok) {
					const testsData = await testsResponse.json();
					// Update progress for all tests before updating store
					const updatedTests = await Promise.all(testsData.map((test) => updateTestProgress(test)));
					allocatedTests.set(updatedTests);
				}
			}
			return { success: true, role: data.role };
		} else {
			const errorData = await response.json();
			console.error('Login failed:', errorData);
			return { success: false, error: errorData.error };
		}
	} catch (error) {
		console.error('Login error:', error);
		return { success: false, error: 'An unexpected error occurred' };
	}
}

export async function logout() {
	try {
		// Clear session from database
		const response = await fetch('/api/auth', {
			method: 'DELETE',
			credentials: 'include'
		});

		if (response.ok) {
			// Clear session cookie from browser
			document.cookie = 'session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';

			// Clear any stored data
			allocatedTests.set([]);

			// Capture current locale before resetting
			const currentLocale = get(locale);

			// Set locale cookie so login page preserves language
			if (currentLocale === 'fr') {
				document.cookie = `locale=fr; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
			}

			// Reset language map to default English
			locale.set('en');

			// Redirect to login with locale
			goto(currentLocale === 'fr' ? '/login/fr' : '/login');
			return true;
		}
	} catch (error) {
		console.error('Logout error:', error);
	}
	return false;
}

export async function getUserFromSession(fetch) {
	try {
		const response = await fetch('/api/user', {
			credentials: 'include' // This ensures cookies are sent with the request
		});
		if (response.ok) {
			const user = await response.json();
			return user;
		}
	} catch (error) {
		console.error('Error getting user from session:', error);
	}
	return null;
}
