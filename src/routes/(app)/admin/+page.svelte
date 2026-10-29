<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import * as api from '$lib/api';
	import { debugMode as t } from '$lib/i18n-debug';
	import { logout } from '$lib/utils/auth';
	import { followupsStore } from '$lib/stores/followups';
	import FollowupCard from '$lib/components/followup/FollowupCard.svelte';
	import Loader from '$lib/components/common/Loader.svelte';

	let user = null;
	let questionnaireResults = [];
	let patients = [];
	let selectedPatientId = '';
	let allocateMessage = '';
	let patientCardsData = null;
	let loading = true;

	// Flatten all patient cards into a single array for display
	// Order: completed first, then active, then onboarded
	$: allPatientCards = patientCardsData
		? [...patientCardsData.completed, ...patientCardsData.active, ...patientCardsData.onboarded]
		: [];

	onMount(async () => {
		try {
			const userResponse = await api.get('/api/user');
			if (userResponse.ok) {
				user = await userResponse.json();

				// Fetch patients
				const patientsResponse = await api.get('/api/user?role=patient');
				if (patientsResponse.ok) {
					patients = await patientsResponse.json();
				}

				// Fetch patient cards data from real API
				const patientCardsResponse = await api.get('/api/followup?skipSync=false');
				if (patientCardsResponse.ok) {
					patientCardsData = await patientCardsResponse.json();
				}

				// Load followups (keeping for backward compatibility)
				await followupsStore.refresh();
			} else {
				// If unauthorized, redirect to login
				goto('/login');
			}
		} catch (error) {
			console.error('Error fetching data:', error);
			goto('/login');
		} finally {
			loading = false;
		}
	});

	function formatDate(dateString) {
		return new Date(dateString).toLocaleString();
	}

	async function handleLogout() {
		const success = await logout();
		if (success) {
			goto('/login');
		} else {
			console.error('Logout failed');
		}
	}

	function viewResults(resultId) {
		// Implement view results functionality
		console.log('Viewing results for:', resultId);
	}

	async function allocateTests() {
		if (!selectedPatientId) {
			alert($t('Admin.Home.select_patient_error'));
			return;
		}

		try {
			const response = await api.post('/api/allocated-tests', { userId: selectedPatientId });
			if (response.ok) {
				alert($t('Admin.Home.allocate_success'));
				selectedPatientId = '';
				// Reload followups
				await followupsStore.refresh();
			} else {
				const errorData = await response.json();
				alert($t('Admin.Home.allocate_error'));
			}
		} catch (error) {
			console.error('Error allocating tests:', error);
			alert($t('Admin.Home.allocate_unexpected_error'));
		}
	}

	async function handleRefresh() {
		// Refresh patient cards data from real API
		try {
			const patientCardsResponse = await api.get('/api/followup?skipSync=false');
			if (patientCardsResponse.ok) {
				patientCardsData = await patientCardsResponse.json();
			}
		} catch (error) {
			console.error('Error refreshing patient cards:', error);
		}

		// Also refresh followups store
		await followupsStore.refresh();
	}

	// Map API status to FollowupCard status variant
	function mapStatus(apiStatus) {
		const statusMap = {
			onboarded: 'new', // White background
			active: 'in_progress', // Light green #E8F9F5
			completed: 'completed' // Dark green #00A886
		};
		return statusMap[apiStatus] || 'new';
	}

	// Transform API patient data to FollowupCard format
	function transformPatient(patient) {
		return {
			_id: patient.patientId,
			fullName: patient.patientName,
			gender: patient.pronouns
		};
	}
</script>

<div class="w-full mx-auto p-10 z-10">
	{#if !loading}
		<!-- Title -->
		<h1 class="text-base font-bold mb-6">{$t('Admin.Home.active_patients')}</h1>
		<div class="w-full h-[2px] bg-[#00A886] mb-6"></div>

		<!-- Patient Cards -->
		<div class="grid grid-cols-5 xl:grid-cols-6 gap-4 mb-8">
			{#each allPatientCards as patient (patient.patientId)}
				<FollowupCard
					patient={transformPatient(patient)}
					lastFollowupDate={patient.date}
					assignmentLeft={0}
					followupId={patient.patientId}
					{user}
					status={mapStatus(patient.status)}
					on:refresh={handleRefresh}
				/>
			{/each}
		</div>
	{:else}
		<Loader />
	{/if}
</div>

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
