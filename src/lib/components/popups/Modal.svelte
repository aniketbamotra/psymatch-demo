<script>
	import { navState } from '$lib/stores';
	import { currentPatientFollowup } from '$lib/stores/currentPatientFollowup';
	import Updates from './Updates.svelte';
	import ProfileSettings from './ProfileSetting.svelte';
	import Intake from './Intake.svelte';
	import DiagnosticTest from './DiagnosticTest.svelte';
	import SearchPatient from './SearchPatient.svelte';
	import PrintReport from './PrintReport.svelte';
	import PatientDetailsPopup from './PatientDetailsPopup.svelte';
	import AddAdmin from './AddAdmin.svelte';

	let currentPatientData;
	currentPatientFollowup.subscribe((value) => {
		console.log('Modal - Patient Data Updated:', value);
		currentPatientData = value;
	});

	// Listen for followup completion
	if (typeof window !== 'undefined') {
		window.addEventListener('followup-completed', () => {
			// Refresh the page or update the UI as needed
			window.location.reload();
		});
	}

	$: currentRoute = $navState;
	$: {
		console.log('Modal - Current Route:', currentRoute);
	}
	$: showModal = [
		'Updates',
		'Settings',
		'Patient Intake',
		'Interview Admin',
		'Reports',
		'PrintReport',
		'PatientDetails',
		'Add Admin'
	].includes(currentRoute);
	$: {
		console.log('Modal - Show Modal:', showModal);
		console.log('Modal - Route Check:', currentRoute === 'SearchPatient');
	}
</script>

{#if showModal}
	<div
		class="z-50 left-[10rem] fixed max-h-screen flex justify-center top-0 items-center bottom-0 right-0"
	>
		<div
			class="flex bg-white flex-col p-7 gap-5 w-[90%] min-w-[60rem] min-h-[30rem] rounded-2xl max-h-[80dvh] {currentRoute ===
			'Patient Intake'
				? 'overflow-y-scroll'
				: ''} "
		>
			{#if currentRoute === 'Updates'}
				<Updates />
			{:else if currentRoute === 'Settings'}
				<ProfileSettings />
			{:else if currentRoute === 'Patient Intake'}
				<Intake />
			{:else if currentRoute === 'Interview Admin'}
				<DiagnosticTest />
			{:else if currentRoute === 'Reports'}
				<SearchPatient />
			{:else if currentRoute === 'PrintReport'}
				<PrintReport />
			{:else if currentRoute === 'PatientDetails' && currentPatientData?.patient}
				<PatientDetailsPopup />
			{:else if currentRoute === 'Add Admin'}
				<AddAdmin show={true} />
			{/if}
		</div>
	</div>
	<div
		class="fixed w-screen h-screen bg-white left-0 top-0 z-20 bg-opacity-10 backdrop-blur-sm"
	></div>
{/if}

<style>
	/* Works on Firefox */
	* {
		scrollbar-width: thin;
		scrollbar-color: rgb(88, 88, 88) #ffffff00;
	}

	/* Works on Chrome, Edge, and Safari */
	*::-webkit-scrollbar {
		width: 8px;
	}

	*::-webkit-scrollbar-track {
		background: #ffffff00;
	}

	*::-webkit-scrollbar-thumb {
		background-color: rgb(88, 88, 88);
		border-radius: 100px;
	}
</style>
