<script>
	import '../app.css';
	import { injectSpeedInsights } from '@vercel/speed-insights/sveltekit';
	import { onMount } from 'svelte';
	import { registerSW } from '$lib/pwa';
	import '$lib/i18n';
	import { page } from '$app/stores';
	import { locale } from 'svelte-i18n';

	import { isLoading } from '$lib/i18n';
	import { DEMO_MODE } from '$lib/demo/mode.js';

	injectSpeedInsights();

	$: user = $page.data.user;
	$: if (user?.userType === 'patient') {
		locale.set(user.patientProfile?.preferredLanguage || 'en');
	} else {
		locale.set('en');
	}

	onMount(() => {
		registerSW();
	});
</script>

{#if $isLoading}
	<div class="flex items-center justify-center h-screen w-screen bg-white">
		<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-Success"></div>
	</div>
{:else}
	<slot />
{/if}

{#if DEMO_MODE}
	<div
		class="pointer-events-none fixed bottom-2 left-2 z-50 rounded-full bg-black/75 px-3 py-1 text-xs text-white"
	>
		Demo · synthetic data
	</div>
{/if}
