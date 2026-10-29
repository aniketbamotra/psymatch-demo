<script>
	import { onMount, createEventDispatcher, onDestroy } from 'svelte';
	import { debugMode as t } from '$lib/i18n-debug';
	import { DEMO_MODE } from '$lib/demo/mode.js';

	const dispatch = createEventDispatcher();

	export let siteKey = '6Le4_QsrAAAAAHEYV-XhPpQ8Y4VmI2B_79IK4Sfg';

	// The server skips verification in demo mode; this just satisfies the forms.
	const DEMO_TOKEN = 'demo-mode';
	export let action = 'homepage'; // action name for reCAPTCHA v3

	let scriptLoaded = false;
	let scriptElement = null;
	let tokenRefreshInterval;
	let currentToken = '';

	// Load the reCAPTCHA v3 script
	function loadReCaptchaScript() {
		// Check if the script is already loaded
		if (document.querySelector('script[src*="recaptcha/api.js"]') || scriptLoaded) {
			if (window.grecaptcha && window.grecaptcha.ready) {
				executeReCaptcha();
			}
			return;
		}

		// Create and append the script to the document
		const script = document.createElement('script');
		script.src = `https://www.google.com/recaptcha/api.js?render=${siteKey}`;
		script.async = true;
		script.defer = true;

		script.onload = () => {
			scriptLoaded = true;
			window.grecaptcha.ready(() => {
				executeReCaptcha();
				dispatch('ready');
			});
		};

		script.onerror = (error) => {
			console.error('Error loading reCAPTCHA script:', error);
			dispatch('error', { error: $t('Common.ReCaptcha.load_error') });
		};

		document.head.appendChild(script);
		scriptElement = script;
	}

	// Execute reCAPTCHA to get a token
	function executeReCaptcha() {
		if (!window.grecaptcha) {
			console.error('grecaptcha not available');
			return;
		}

		window.grecaptcha
			.execute(siteKey, { action })
			.then((token) => {
				currentToken = token;
				dispatch('verify', { token, action });
			})
			.catch((error) => {
				console.error('reCAPTCHA execution error:', error);
				dispatch('error', { error: $t('Common.ReCaptcha.execution_error') });
			});
	}

	// Public method to get the current token
	export function getResponse() {
		return DEMO_MODE ? DEMO_TOKEN : currentToken;
	}

	// Public method to force a new token
	export function execute() {
		if (DEMO_MODE) return;
		if (window.grecaptcha && window.grecaptcha.ready) {
			window.grecaptcha.ready(executeReCaptcha);
		}
	}

	onMount(() => {
		if (DEMO_MODE) {
			dispatch('verify', { token: DEMO_TOKEN, action });
			return;
		}
		loadReCaptchaScript();

		// Set up token refresh (tokens expire after 2 minutes)
		tokenRefreshInterval = setInterval(() => {
			if (window.grecaptcha && window.grecaptcha.ready) {
				window.grecaptcha.ready(executeReCaptcha);
			}
		}, 110000); // Refresh slightly before 2 minutes to ensure we always have a valid token
	});

	onDestroy(() => {
		// Clean up interval
		if (tokenRefreshInterval) {
			clearInterval(tokenRefreshInterval);
		}

		// Clean up script element if we created it
		if (scriptElement && scriptElement.parentNode) {
			scriptElement.parentNode.removeChild(scriptElement);
		}
	});
</script>

<!-- No visible content - reCAPTCHA v3 runs invisibly -->
