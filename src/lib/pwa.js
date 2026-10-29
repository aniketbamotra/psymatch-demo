import { dev } from '$app/environment';
import { deferredPrompt } from './stores/pwaInstall';
import { get } from 'svelte/store';
import { t } from '$lib/i18n';

// Handle beforeinstallprompt event
if (typeof window !== 'undefined') {
	window.addEventListener('beforeinstallprompt', (e) => {
		// Prevent Chrome 67 and earlier from automatically showing the prompt
		e.preventDefault();
		// Store the event for later use
		deferredPrompt.set(e);
	});

	// Reset deferredPrompt when PWA is installed
	window.addEventListener('appinstalled', () => {
		deferredPrompt.set(null);
		console.log('PWA was installed');
	});
}

// Function to show install prompt
export async function showInstallPrompt() {
	let promptEvent;
	deferredPrompt.subscribe((value) => (promptEvent = value))();

	if (promptEvent) {
		// Show the prompt
		promptEvent.prompt();

		// Wait for the user to respond to the prompt
		const choiceResult = await promptEvent.userChoice;

		// Reset the deferred prompt variable
		deferredPrompt.set(null);

		return choiceResult.outcome === 'accepted';
	}

	return false;
}

// Utility function to register service worker
export async function registerSW() {
	if ('serviceWorker' in navigator && !dev) {
		try {
			const registration = await navigator.serviceWorker.register('/workbox-service-worker.js');

			// Handle updates
			registration.addEventListener('updatefound', () => {
				const newWorker = registration.installing;
				if (newWorker) {
					newWorker.addEventListener('statechange', () => {
						if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
							// New content is available, trigger a page reload
							if (confirm(get(t)('PWA.update_confirm'))) {
								window.location.reload();
							}
						}
					});
				}
			});

			console.log('Service Worker registered');
		} catch (error) {
			console.error('Service Worker registration failed:', error);
		}
	}
}
