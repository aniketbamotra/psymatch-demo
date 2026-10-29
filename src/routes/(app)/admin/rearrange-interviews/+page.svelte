<script>
	import RearrangeCard from '$lib/components/interviews/RearrangeCard.svelte';
	import Button from '$lib/components/buttons/Button.svelte';
	import Check from '$lib/components/feather/check.svelte';
	import X from '$lib/components/feather/x.svelte';
	import { flip } from 'svelte/animate';
	import { writable } from 'svelte/store';
	import { onMount } from 'svelte';
	import * as api from '$lib/api';
	import { debugMode as t } from '$lib/i18n-debug';

	let questionnaires = writable([]);
	let originalQuestionnaires = [];
	let loading = true;
	let error = null;
	let saving = false;
	let saved = false;
	let hasChanges = false;

	onMount(async () => {
		try {
			// Fetch questionnaire order from API
			const response = await api.get('/api/questionnaire-order');
			if (response.ok) {
				const data = await response.json();
				// Map API response to component structure
				const mappedData = data.orderedQuestionnaires.map((q) => ({
					id: q.test_code,
					name: q.test_name,
					testCode: q.test_code,
					locked: q.isLocked
				}));
				questionnaires.set(mappedData);
				originalQuestionnaires = JSON.parse(JSON.stringify(mappedData));
			} else {
				error = $t('Admin.RearrangeInterviews.error_load');
			}
		} catch (err) {
			console.error('Error loading questionnaires:', err);
			error = $t('Admin.RearrangeInterviews.error_load');
		} finally {
			loading = false;
		}
	});

	function handleMoveUp(index, filteredItems) {
		if (index > 0) {
			const items = $questionnaires;
			const currentItem = filteredItems[index];
			const previousItem = filteredItems[index - 1];
			const currentIdx = items.findIndex((i) => i.id === currentItem.id);
			const prevIdx = items.findIndex((i) => i.id === previousItem.id);
			[items[currentIdx], items[prevIdx]] = [items[prevIdx], items[currentIdx]];
			questionnaires.set(items);
			checkForChanges();
		}
	}

	function handleMoveDown(index, filteredItems) {
		if (index < filteredItems.length - 1) {
			const items = $questionnaires;
			const currentItem = filteredItems[index];
			const nextItem = filteredItems[index + 1];
			const currentIdx = items.findIndex((i) => i.id === currentItem.id);
			const nextIdx = items.findIndex((i) => i.id === nextItem.id);
			[items[currentIdx], items[nextIdx]] = [items[nextIdx], items[currentIdx]];
			questionnaires.set(items);
			checkForChanges();
		}
	}

	function handleDrop(e, sourceIndex, targetIndex) {
		const items = $questionnaires;
		const sourceItem = items[sourceIndex];
		items.splice(sourceIndex, 1);
		items.splice(targetIndex, 0, sourceItem);
		questionnaires.set(items);
		checkForChanges();
	}

	function checkForChanges() {
		hasChanges = JSON.stringify($questionnaires) !== JSON.stringify(originalQuestionnaires);
	}

	async function handleConfirm() {
		saving = true;
		saved = false;
		try {
			// Extract test codes in current order
			const orderedTestCodes = $questionnaires.map((q) => q.id);

			const response = await api.patch('/api/questionnaire-order', {
				orderedTestCodes
			});

			if (response.ok) {
				const data = await response.json();
				console.log('Order saved successfully:', data);
				// Update original for comparison
				originalQuestionnaires = JSON.parse(JSON.stringify($questionnaires));
				error = null;
				saved = true;
				saving = false;

				// Auto-clear success message and hide button after 1 second
				setTimeout(() => {
					saved = false;
					hasChanges = false;
				}, 1000);
			} else {
				saving = false;
				const data = await response.json();
				error = data.error || 'Failed to save questionnaire order';
				console.error('Error response:', data);
			}
		} catch (err) {
			saving = false;
			console.error('Error saving order:', err);
			error = 'Error saving questionnaire order';
		}
	}

	function handleCancel() {
		// Restore original order
		questionnaires.set(JSON.parse(JSON.stringify(originalQuestionnaires)));
		hasChanges = false;
		error = null;
	}

	// Separate locked and unlocked questionnaires
	$: lockedQuestionnaires = $questionnaires.filter((q) => q.locked === true);
	$: unlockedQuestionnaires = $questionnaires.filter((q) => q.locked === false);
</script>

<div class="w-full bg-gray-50 min-h-screen">
	<!-- Header Section -->
	<div class=" px-6 lg:px-6 py-6 max-w-7xl mx-auto">
		<h1 class="text-md font-bold text-Success mb-1">{$t('Admin.RearrangeInterviews.title')}</h1>
		<div class="h-0.5 bg-Success mt-2"></div>
	</div>

	<!-- Main Content -->
	<div class="p-6 lg:p-8 w-full">
		<div class="max-w-6xl mx-auto">
			<!-- Error Message -->
			{#if error}
				<div class="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
					<p class="text-red-700 font-medium">{error}</p>
				</div>
			{/if}

			<!-- Loading State -->
			{#if loading}
				<div class="flex justify-center items-center py-12">
					<p class="text-gray-600">{$t('Admin.RearrangeInterviews.loading')}</p>
				</div>
			{:else}
				<!-- Locked Section -->
				{#if lockedQuestionnaires.length > 0}
					<div class="mb-3">
						<div class="space-y-3">
							{#each lockedQuestionnaires as questionnaire, index (questionnaire.id)}
								<RearrangeCard
									itemName={questionnaire.name}
									testCode={questionnaire.testCode}
									position={index + 1}
									totalCount={lockedQuestionnaires.length}
									locked={true}
									draggable={false}
								/>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Unlocked Section -->
				{#if unlockedQuestionnaires.length > 0}
					<div>
						<div class="space-y-3">
							{#each unlockedQuestionnaires as questionnaire, index (questionnaire.id)}
								{@const globalIndex = $questionnaires.findIndex((q) => q.id === questionnaire.id)}
								<div animate:flip={{ duration: 300 }}>
									<RearrangeCard
										itemName={questionnaire.name}
										testCode={questionnaire.testCode}
										position={globalIndex + 1}
										totalCount={$questionnaires.length}
										locked={false}
										draggable={true}
										on:moveUp={() => handleMoveUp(globalIndex, $questionnaires)}
										on:moveDown={() => handleMoveDown(globalIndex, $questionnaires)}
										on:drop={(e) => handleDrop(e, e.detail.from - 1, e.detail.to - 1)}
									/>
								</div>
							{/each}
						</div>
					</div>
				{/if}
			{/if}
		</div>
	</div>

	<!-- Fixed Bottom Action Bar -->
	{#if hasChanges}
		<div
			class="fixed bottom-0 left-0 right-0 w-fit mx-auto bg-white border-t border-gray-200 p-5 rounded-[10px] shadow-lg flex justify-center gap-2"
		>
			<Button
				label={$t('Admin.RearrangeInterviews.confirm_changes')}
				onClick={handleConfirm}
				disabled={!hasChanges || saving}
				loading={saving}
				success={saved}
				successText={$t('Admin.RearrangeInterviews.changes_saved')}
				icon={true}
				iconOnSide="left"
			>
				<Check slot="icon" size={20} />
			</Button>
			<Button
				label={$t('Admin.RearrangeInterviews.cancel_changes')}
				outline={true}
				onClick={handleCancel}
				disabled={!hasChanges}
				icon={true}
				iconOnSide="left"
			>
				<X slot="icon" size={20} />
			</Button>
		</div>
	{/if}
</div>
