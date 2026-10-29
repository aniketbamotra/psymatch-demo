<script>
	import { onMount } from 'svelte';
	import { patientsStore } from '$lib/stores/patients.js';
	import { goto } from '$app/navigation';
	import Search from '$lib/components/feather/search.svelte';
	import X from '$lib/components/feather/x.svelte';
	import { debugMode as t } from '$lib/i18n-debug';

	let searchInput = '';
	let loading = true;
	let error = '';
	let deletingPatientId = null;
	let showSearchInput = false;

	onMount(async () => {
		try {
			const response = await fetch('/api/user?role=patient');
			if (response.ok) {
				const patients = await response.json();
				console.log('Raw patients data:', patients);
				console.log('Sample patient profile:', patients[0]?.patientProfile);
				console.log('First patient with dateOfReg and lastActivity:', patients[0]);
				patientsStore.setPatients(patients);
			} else {
				const errorData = await response.json();
				error = errorData.error || 'Failed to fetch patients';
				console.error('Failed to fetch patients:', errorData);
			}
		} catch (error) {
			console.error('Error fetching patients:', error);
		} finally {
			loading = false;
			console.log('Patients:', $patientsStore.patients);
		}
	});

	async function handleSearch(event) {
		const query = event.target.value;
		searchInput = query;
		patientsStore.setSearchQuery(query);
	}

	function viewPatient(patientId) {
		goto(`/admin/view-patients/${patientId}`);
	}

	function toggleSearch() {
		showSearchInput = !showSearchInput;
		if (!showSearchInput) {
			searchInput = '';
			patientsStore.setSearchQuery('');
		}
	}

	function formatDate(dateString) {
		if (!dateString) return 'N/A';
		const date = new Date(dateString);
		return date.toLocaleDateString('en-GB', {
			year: 'numeric',
			month: '2-digit',
			day: '2-digit'
		});
	}

	async function removePatient(patientId) {
		if (!confirm($t('Admin.ViewPatients.confirm_remove'))) {
			return;
		}

		try {
			error = '';
			deletingPatientId = patientId;

			const response = await fetch(`/api/user/${patientId}`, {
				method: 'DELETE'
			});

			const data = await response.json();
			if (response.ok) {
				patientsStore.removePatient(patientId);
			} else {
				error = data.error || 'Failed to remove patient';
			}
		} catch (err) {
			error = 'Error removing patient';
			console.error('Error removing patient:', err);
		} finally {
			deletingPatientId = null;
		}
	}
</script>

<div class="p-6 z-10">
	<div class="flex justify-between items-center bg-gray-100 rounded-t-xl">
		<h1 class=" text-lg font-bold my-4 ms-3">{$t('Admin.ViewPatients.title')}</h1>
		<div class="relative">
			{#if showSearchInput}
				<input
					type="text"
					placeholder={$t('Admin.ViewPatients.search_placeholder')}
					class="w-96 px-4 py-2 mr-4 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
					bind:value={searchInput}
					on:input={handleSearch}
				/>
			{:else}
				<button
					on:click={toggleSearch}
					class="bg-[#00A886] hover:bg-[#008c72] text-white px-6 py-5 rounded-r-lg rounded-b-none flex items-center gap-2 transition-colors"
				>
					<Search size={24} color="white" />
					<span>{$t('Admin.ViewPatients.search_placeholder')}</span>
				</button>
			{/if}
		</div>
	</div>

	{#if loading}
		<div class="flex justify-center items-center h-64 z-10">
			<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
		</div>
	{:else if error}
		<div class="bg-red-50 p-4 rounded-lg mb-6 z-10">
			<div class="flex">
				<div class="flex-shrink-0">
					<svg
						class="h-5 w-5 text-red-400"
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 20 20"
						fill="currentColor"
					>
						<path
							fill-rule="evenodd"
							d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
							clip-rule="evenodd"
						/>
					</svg>
				</div>
				<div class="ml-3">
					<p class="text-sm font-medium text-red-800">{error}</p>
				</div>
			</div>
		</div>
	{:else}
		<div class="bg-white shadow overflow-hidden z-10">
			<table class="min-w-full">
				<thead class="bg-gray-100">
					<tr>
						<th class="px-3 py-4 text-left text-sm font-medium text-gray-900 tracking-wider">
							{$t('Admin.ViewPatients.table.name')}
						</th>
						<th class="px-3 py-4 text-left text-sm font-medium text-gray-900 tracking-wider">
							{$t('Admin.ViewPatients.table.email')}
						</th>
						<th class="px-3 py-4 text-left text-sm font-medium text-gray-900 tracking-wider">
							{$t('Admin.ViewPatients.table.date_of_reg')}
						</th>
						<th class="px-3 py-4 text-left text-sm font-medium text-gray-900 tracking-wider">
							{$t('Admin.ViewPatients.table.last_activity')}
						</th>
						<th class="px-3 py-4 text-left text-sm font-medium text-gray-900 tracking-wider">
							{$t('Admin.ViewPatients.table.phone')}
						</th>
						<th class="px-3 py-4 text-left text-sm font-medium text-gray-900 tracking-wider">
							{$t('Admin.ViewPatients.table.inspect')}
						</th>
						<th class="px-3 py-4 text-center text-sm font-medium text-gray-900 tracking-wider w-16">
						</th>
					</tr>
				</thead>
				<tbody class="bg-white divide-y divide-gray-200">
					{#each $patientsStore.filteredPatients as patient}
						<tr>
							<td class="px-3 py-4 whitespace-nowrap">
								{patient.fullName}
								{#if patient?.gender}
									<p class="text-gray-500 text-[12px] font-normal mt-1">{patient.gender}</p>
								{/if}
							</td>
							<td class="px-3 py-4 whitespace-nowrap">
								{patient.email}
							</td>
							<td class="px-3 py-4 whitespace-nowrap">
								{formatDate(patient.dateOfReg)}
							</td>
							<td class="px-3 py-4 whitespace-nowrap">
								{formatDate(patient.lastActivity)}
							</td>
							<td class="px-3 py-4 whitespace-nowrap">
								{#if patient?.patientProfile?.phoneNumber}
									{patient.patientProfile.phoneNumber}
								{:else}
									<span class="text-gray-400">{$t('Admin.ViewPatients.table.not_provided')}</span>
								{/if}
							</td>
							<td class="px-3 py-4 whitespace-nowrap">
								<button
									class="text-green-600 hover:text-green-900"
									on:click={() => viewPatient(patient._id)}
								>
									{$t('Admin.ViewPatients.table.view')}
								</button>
							</td>
							<td class="px-3 py-4 whitespace-nowrap text-center">
								{#if deletingPatientId === patient._id}
									<div
										class="inline-flex animate-spin rounded-full h-4 w-4 border-b-2 border-red-500"
									></div>
								{:else}
									<button
										class="text-red-600 hover:text-red-700 transition-colors"
										on:click={() => removePatient(patient._id)}
										aria-label="Remove patient"
									>
										<X size={20} color="#DC2626" />
									</button>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
