<script>
	import { debugMode as t } from '$lib/i18n-debug';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { locale } from 'svelte-i18n';

	onMount(() => {
		const match = document.cookie.match(/(?:^|;\s*)locale=(\w+)/);
		locale.set(match?.[1] === 'fr' ? 'fr' : 'en');
		if (browser) {
			window.addEventListener('keydown', (e) => {
				if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'D') {
					const current = localStorage.getItem('i18n_debug') === 'true';
					localStorage.setItem('i18n_debug', (!current).toString());
					window.location.reload();
				}
			});
		}
	});
</script>

<div
	class="w-full max-h-[100dvh] h-[100dvh] overflow-hidden bg-High-fed-white justify-start items-end grid lg:grid-cols-2 bg-Somke_BG"
>
	<img
		class="w-full hidden lg:block self-stretch object-cover z-10"
		src="/images/patient-login-image.jpg"
		alt={$t('Auth.Layout.image_alt')}
	/>
	<div
		class="relative self-stretch flex-col justify-center w-screen lg:w-full items-start inline-flex"
	>
		<div
			class="absolute w-screen lg:w-full -top-[50%] lg:-top-[30%] h-[50%] bg-[radial-gradient(at_center,#00A886,#00A88603)] rounded-full z-0 blur-3xl"
		></div>
		<slot />
	</div>
</div>
