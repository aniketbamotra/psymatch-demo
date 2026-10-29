<script>
	import { navState, selectedPatient } from '$lib/stores';
	import Cross from './Cross.svelte';
	import Button from '../buttons/Button.svelte';
	import * as api from '$lib/api';
	import { debugMode as t } from '$lib/i18n-debug';

	let searchTerm = '';
	let searchResults = [];
	let loading = false;
	let error = '';
	let searchTimeout;

	function closeModal() {
		searchTerm = '';
		searchResults = [];
		$navState = 'Home';
	}

	async function handleSearch() {
		try {
			loading = true;
			error = '';

			const response = await api.get(`/api/user?query=${encodeURIComponent(searchTerm)}`);

			if (response.ok) {
				const data = await response.json();
				console.log('Search results:', data);
				searchResults = data;
				if (searchResults.length === 0) {
					error = 'No patients found matching your search';
				}
			} else {
				const errorData = await response.json().catch(() => ({}));
				error = errorData.error || 'Failed to search patients';
				searchResults = [];
			}
		} catch (err) {
			error = err.message || 'Failed to search patients';
			searchResults = [];
		} finally {
			loading = false;
		}
	}

	function handlePrintClick(patient) {
		if (!patient._id) {
			console.error('Patient has no _id:', patient);
			error = 'Invalid patient data';
			return;
		}

		console.log('Setting selected patient ID:', patient._id);
		$selectedPatient = patient._id;

		if (typeof window !== 'undefined') {
			window.localStorage.setItem('selectedPatientId', patient._id);
			console.log(
				'Stored patient ID in localStorage:',
				window.localStorage.getItem('selectedPatientId')
			);
		}

		$navState = 'PrintReport';
	}

	// Debounced search function
	function debouncedSearch() {
		clearTimeout(searchTimeout);
		if (searchTerm.length > 0) {
			searchTimeout = setTimeout(() => {
				handleSearch();
			}, 500); // 500ms delay
		} else {
			searchResults = [];
		}
	}

	$: if (searchTerm) {
		debouncedSearch();
	}
</script>

<div class="flex">
	<h3 class="text-xl flex-grow font-semibold leading-relaxed">
		{$t('Popups.SearchPatient.title')}
	</h3>
	<button on:click={closeModal}>
		<Cross />
	</button>
</div>

<div class="flex flex-col gap-6">
	<div class="self-stretch flex-col justify-start items-start gap-3 flex">
		<div class="self-stretch text-black text-sm font-normal leading-none">
			{$t('Popups.SearchPatient.search_placeholder')}
		</div>
		<input
			type="text"
			class="w-full p-2 border rounded-md bg-white"
			placeholder={$t('Popups.SearchPatient.search_input_placeholder')}
			bind:value={searchTerm}
		/>
	</div>

	{#if loading}
		<p class="text-gray-600">{$t('Popups.SearchPatient.searching')}</p>
	{:else if error}
		<p class="text-red-500">{error}</p>
	{:else if searchResults.length > 0}
		<div class="overflow-x-auto">
			<table class="min-w-full divide-y divide-gray-200">
				<thead class="bg-gray-50">
					<tr>
						<th
							class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
							>{$t('Popups.SearchPatient.table.name')}</th
						>
						<th
							class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
							>{$t('Popups.SearchPatient.table.email')}</th
						>
						<th
							class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
							>{$t('Popups.SearchPatient.table.phone')}</th
						>
						<th
							class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
							>{$t('Popups.SearchPatient.table.user_id')}</th
						>
						<th
							class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
							>{$t('Popups.SearchPatient.table.actions')}</th
						>
					</tr>
				</thead>
				<tbody class="bg-white divide-y divide-gray-200">
					{#each searchResults as patient}
						<tr>
							<td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900"
								>{patient.fullName}</td
							>
							<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{patient.email}</td>
							<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500"
								>{patient.phone || '-'}</td
							>
							<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500"
								>{patient.fileMakerId || '-'}</td
							>
							<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
								<Button onClick={() => handlePrintClick(patient)}
									>{$t('Popups.SearchPatient.next')}</Button
								>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
