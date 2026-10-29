<script>
	import { createEventDispatcher, onMount } from 'svelte';
	import { navState } from '$lib/stores';
	import Button from '../buttons/Button.svelte';

	const dispatch = createEventDispatcher();
	import Cross from './Cross.svelte';
	import MultiSelector from '../form/MultiSelector.svelte';
	import * as api from '$lib/api';
	import { debugMode as t } from '$lib/i18n-debug';
	import { getLocalizedText } from '$lib/utils/language';

	export let selectedPatient = null;
	export let currentStep = 1;

	// Helper to ensure title is always a string
	function formatTitle(title) {
		if (!title) return 'Untitled';
		if (typeof title === 'string') return title;
		if (typeof title === 'object') {
			return title.en || Object.values(title)[0] || 'Untitled';
		}
		return String(title);
	}

	let searchTerm = '';
	let searchResults = [];

	// The full catalogue of tests
	let allTests = [];

	// The subset tests that haven't been allocated to this user
	let unallocatedTests = [];

	let loading = false;
	let loadingTests = false;
	let error = '';
	let searchTimeout;
	let selectedTests = [];
	let allocateLoading = false;
	let allocateSuccess = false;

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

	let predefinedSets = [];
	let loadingSets = true;
	let selectedSetIds = [];

	onMount(async () => {
		if (selectedPatient && currentStep === 2) {
			await handleSelectPatient(selectedPatient);
		}

		try {
			loadingSets = true;
			const res = await api.get('/api/set/read?mode=assign');
			if (res.ok) {
				const data = await res.json();
				predefinedSets = data.sets ?? [];
			}
		} catch (err) {
			console.error('Error fetching predefined sets:', err);
		} finally {
			loadingSets = false;
		}
	});

	function isSetSelected(set) {
		if (!set.interviews?.length) return false;
		const available = set.interviews.filter((iv) =>
			unallocatedTests.some((ut) => ut._id.toString() === iv._id.toString())
		);
		if (available.length === 0) return false;
		return available.every((iv) => selectedTests.some((q) => q.id === iv._id.toString()));
	}

	function isSetPartial(set) {
		if (!set.interviews?.length) return false;
		const available = set.interviews.filter((iv) =>
			unallocatedTests.some((ut) => ut._id.toString() === iv._id.toString())
		);
		if (available.length === 0) return false;
		const count = available.filter((iv) =>
			selectedTests.some((q) => q.id === iv._id.toString())
		).length;
		return count > 0 && count < available.length;
	}

	function toggleSet(set) {
		const setId = set._id.toString();
		const available = set.interviews.filter((iv) =>
			unallocatedTests.some((ut) => ut._id.toString() === iv._id.toString())
		);
		if (available.length === 0) return;

		if (selectedSetIds.includes(setId)) {
			const setInterviewIds = available.map((iv) => iv._id.toString());
			const otherSelectedSets = predefinedSets.filter(
				(s) => selectedSetIds.includes(s._id.toString()) && s._id.toString() !== setId
			);

			const keepIds = new Set();
			otherSelectedSets.forEach((s) => {
				if (s.interviews) {
					s.interviews.forEach((iv) => keepIds.add(iv._id.toString()));
				}
			});

			selectedTests = selectedTests.filter(
				(q) => !setInterviewIds.includes(q.id) || keepIds.has(q.id)
			);
		} else {
			const toAdd = available
				.filter((iv) => !selectedTests.some((q) => q.id === iv._id.toString()))
				.map((iv) => {
					const ut = unallocatedTests.find((u) => u._id.toString() === iv._id.toString());
					return { id: ut._id.toString(), title: formatTitle(ut.title) };
				});
			selectedTests = [...selectedTests, ...toAdd];
		}
	}

	$: selectedSetIds = predefinedSets
		.filter((set) => {
			if (!set?.interviews?.length) return false;
			const available = set.interviews.filter((iv) =>
				unallocatedTests.some((ut) => ut._id.toString() === iv._id.toString())
			);
			if (available.length === 0) return false;
			return available.every((iv) => selectedTests.some((q) => q.id === iv._id.toString()));
		})
		.map((s) => s._id.toString());

	async function handleSelectPatient(patient) {
		try {
			loadingTests = true;
			error = '';
			if (!selectedPatient) {
				selectedPatient = patient;
			}

			// 1. Fetch unallocated tests specifically for this patient
			const ulResponse = await api.get(`/api/unallocated-tests/${patient._id}`);
			if (ulResponse.ok) {
				const ulData = await ulResponse.json();
				unallocatedTests = Array.isArray(ulData) ? ulData : [];
			} else {
				throw new Error('Failed to load unallocated tests');
			}

			// 2. Fetch the entire available questionnaire catalog
			const allResponse = await api.get('/api/available-questionnaires');
			if (allResponse.ok) {
				const allData = await allResponse.json();
				allTests = Array.isArray(allData) ? allData : [];
			} else {
				throw new Error('Failed to load available questionnaires');
			}

			// 3. Populate selectedTests with the tests that are already allocated
			const sentTests = allTests
				.filter((test) => !unallocatedTests.some((ut) => ut._id.toString() === test._id.toString()))
				.map((test) => ({
					id: test._id.toString(),
					title: formatTitle(test.title),
					isSent: true
				}));
			selectedTests = [...sentTests];

			currentStep = 2; // Move to assignment step whether they have unallocated or not, so they can see "Sent" ones
		} catch (err) {
			console.error('Error loading tests:', err);
			error = err.message || 'Failed to load tests';
			unallocatedTests = [];
			allTests = [];
		} finally {
			loadingTests = false;
		}
	}

	async function handleAllocateTests() {
		if (!selectedTests.length) {
			error = 'Please select at least one test';
			return;
		}

		try {
			error = '';
			allocateLoading = true;
			allocateSuccess = false;

			// Allocate tests
			const allocateResponse = await api.post('/api/allocated-tests', {
				userId: selectedPatient._id,
				questionnaireIds: selectedTests.map((test) => test.id)
			});

			if (!allocateResponse.ok) {
				const errorData = await allocateResponse.json().catch(() => ({}));
				throw new Error(errorData.error || 'Failed to allocate tests');
			}

			// Send notification email
			const notifyResponse = await api.post('/api/notify/new-tests', {
				email: selectedPatient.email,
				fullName: selectedPatient.fullName,
				testCount: selectedTests.length,
				preferredLanguage: selectedPatient.patientProfile?.preferredLanguage || selectedPatient.preferredLanguage
			});

			if (!notifyResponse.ok) {
				console.error('Failed to send notification email');
			}
			allocateLoading = false;
			allocateSuccess = true;

			// Wait for 3 seconds to show success state
			await new Promise((resolve) => setTimeout(resolve, 3000));

			// Reset and close
			closeModal();
		} catch (err) {
			console.error('Error allocating tests:', err);
			error = err.message || 'Failed to allocate tests';
		} finally {
			const event = new CustomEvent('followup-completed');
			window.dispatchEvent(event);
			allocateLoading = false;
		}
	}

	function closeModal() {
		searchTerm = '';
		searchResults = [];
		unallocatedTests = [];
		selectedPatient = null;
		selectedTests = [];
		currentStep = 1;
		allocateLoading = false;
		allocateSuccess = false;
		dispatch('close');
		$navState = 'Home';
	}

	function handleBack() {
		currentStep = 1;
		selectedTests = [];
		error = '';
	}
</script>

<div class="flex">
	<h3 class="text-xl flex-grow font-semibold leading-relaxed">
		{$t('Popups.DiagnosticTest.title')}
	</h3>
	<button on:click={closeModal}>
		<Cross />
	</button>
</div>

<div class="flex flex-col gap-6 overflow-y-scroll">
	{#if currentStep === 1}
		<div class="self-stretch flex-col justify-start items-start gap-3 flex">
			<div class="self-stretch text-black text-sm font-normal leading-none">
				{$t('Popups.DiagnosticTest.search_placeholder')}
			</div>
			<input
				type="text"
				class="w-full p-2 border rounded-md bg-white"
				placeholder={$t('Popups.DiagnosticTest.search_input_placeholder')}
				bind:value={searchTerm}
			/>
		</div>

		{#if loading}
			<p class="text-gray-600">{$t('Popups.DiagnosticTest.searching')}</p>
		{:else if error}
			<p class="text-red-500">{error}</p>
		{:else if searchResults.length > 0}
			<div class="overflow-x-auto">
				<table class="min-w-full divide-y divide-gray-200">
					<thead class="bg-gray-50">
						<tr>
							<th
								class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
								>{$t('Popups.DiagnosticTest.table.name')}</th
							>
							<th
								class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
								>{$t('Popups.DiagnosticTest.table.email')}</th
							>
							<th
								class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
								>{$t('Popups.DiagnosticTest.table.phone')}</th
							>
							<th
								class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
								>{$t('Popups.DiagnosticTest.table.user_id')}</th
							>
							<th
								class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
								>{$t('Popups.DiagnosticTest.table.actions')}</th
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
									<Button onClick={() => handleSelectPatient(patient)}
										>{$t('Popups.DiagnosticTest.next')}</Button
									>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	{:else if currentStep === 2}
		<div class="flex flex-col gap-6">
			<div class="flex justify-between items-center">
				<h3 class="text-lg font-medium">
					{$t('Popups.DiagnosticTest.available_interviews')}
					{selectedPatient.fullName}
				</h3>
			</div>

			{#if loadingTests}
				<p class="text-gray-600">{$t('Popups.DiagnosticTest.loading_interviews')}</p>
			{:else if error}
				<p class="text-red-500">{error}</p>
			{:else if allTests.length === 0}
				<p class="text-gray-600">{$t('Popups.DiagnosticTest.no_interviews')}</p>
			{:else}
				<div class="h-[300px]">
					<MultiSelector
						form="diagnostic-test"
						options={unallocatedTests.map((test) => ({
							id: test._id.toString(),
							title: formatTitle(test.title)
						}))}
						bind:selected={selectedTests}
						field1=""
						field2="Selected Interviews"
					/>
				</div>

				<!-- Predefined Sets -->
				<div class="space-y-2">
					<p class="text-sm">Predefined Sets</p>
					{#if loadingSets}
						<p class="text-gray-600 text-sm">Loading sets…</p>
					{:else if predefinedSets.length === 0}
						<p class="text-gray-500 text-sm">No predefined sets available</p>
					{:else}
						<div class="bg-[#eef2f1] rounded-lg p-3 flex flex-wrap gap-2">
							{#each predefinedSets as set (set._id)}
								{@const selected = selectedSetIds.includes(set._id.toString())}
								{@const partial = !selected && isSetPartial(set)}
								{@const allSent =
									set.interviews?.length > 0 &&
									set.interviews.every((iv) =>
										selectedTests.some((st) => st.id === iv._id.toString() && st.isSent)
									)}
								<button
									on:click={() => {
										if (!allSent) toggleSet(set);
									}}
									class="rounded-full px-4 py-1 text-sm flex items-center gap-1 transition-colors
										{allSent
										? 'bg-[#E5E7EB] text-gray-500 italic cursor-not-allowed opacity-70'
										: selected
											? 'bg-[#E8F9F5] text-[#00A886]'
											: partial
												? 'bg-white text-gray-500 ring-1 ring-[#00A886] ring-inset'
												: 'bg-white text-gray-700 hover:bg-gray-50'}"
								>
									{set.set_name}
									{allSent ? '(Sent)' : ''}
									{#if !allSent}
										{#if selected}
											<span class="font-bold text-xs ml-0.5">−</span>
										{:else}
											<span class="font-bold text-xs ml-0.5">+</span>
										{/if}
									{/if}
								</button>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

			<div class="flex justify-between mt-4">
				<Button outline onClick={handleBack}
					>{$t('Popups.DiagnosticTest.back')}</Button
				>
				<Button
					onClick={handleAllocateTests}
					disabled={selectedTests.length === 0}
					loading={allocateLoading}
					loadingText={$t('Popups.DiagnosticTest.emailing')}
					success={allocateSuccess}
					successText={$t('Popups.DiagnosticTest.email_sent')}
				>
					{$t('Popups.DiagnosticTest.allocate_button')}
				</Button>
			</div>
		</div>
	{/if}
</div>
