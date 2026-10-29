<script>
	import Navbar from '$lib/components/nav/Navbar.svelte';
	import { navState, questionnaire, showRedactionProfile } from '$lib/stores';
	import Modal from '$lib/components/popups/Modal.svelte';
	import RedactionProfile from '$lib/components/popups/RedactionProfile.svelte';
	import TOSModal from '$lib/components/popups/TOSModal.svelte';
	import { showTOSModal } from '$lib/stores/tosModal';
	import { pushState } from '$app/navigation';
	import '$lib/i18n'; // Initialize i18n
	import { locale } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	export let data;

	function showModal() {
		pushState('/patient', {
			showModal: true
		});
	}

	$: currentRoute = $navState;
	$: showTOSModal.set(!!data?.needsTOS);

	// Sync the i18n locale to the signed-in patient's preferred language so the
	// app chrome (modal, nav, etc.) matches the MD content they see. Guard with
	// inequality so we don't trip the reactive loop.
	$: if (
		browser &&
		data?.user?.preferredLanguage &&
		data.user.preferredLanguage !== $locale
	) {
		locale.set(data.user.preferredLanguage);
	}

	onMount(() => {
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

{#if $navState === 'Updates' || $navState === 'Settings' || $navState === 'Patient Intake' || $navState === 'Interview Admin' || $navState === 'Reports' || $navState === 'PrintReport' || $navState === 'PatientDetails' || $navState === 'Add Admin'}
	<Modal />
{/if}
{#if $showRedactionProfile}
	<RedactionProfile />
{/if}
{#if $showTOSModal && data?.legalBundle}
	<TOSModal bundle={data.legalBundle} preferredLanguage={data?.user?.preferredLanguage || 'en'} />
{/if}
<div class="flex flex-col lg:flex-row min-h-[100dvh] relative bg-[#ECEDF2]">
	<Navbar />
	<div class="relative w-full flex flex-col">
		<slot />
		<div
			class="fixed bg-Success mx-32 h-[15rem] rounded-full blur-[4rem] lg:blur-[6rem] lg:-top-[30%] -top-[30%] left-[5rem] lg:left-[10%] right-[5rem] lg:right-[0] -z-0"
		></div>
	</div>
</div>
