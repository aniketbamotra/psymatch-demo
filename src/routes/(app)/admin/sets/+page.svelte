<script>
	import { onMount } from 'svelte';
	import { setsStore, filteredSets } from '$lib/stores/sets.js';
	import { createSortStore } from '$lib/stores/sort.js';
	import PageHeader from '$lib/components/common/PageHeader.svelte';
	import Button from '$lib/components/buttons/Button.svelte';
	import SetModal from '$lib/components/popups/SetModal.svelte';
	import * as api from '$lib/api';
	import { debugMode as t } from '$lib/i18n-debug';
	import { navState } from '$lib/stores';

	let loading = true;
	let error = '';
	let refreshing = false;

	let showModal = false;
	/** @type {{ _id: string, set_name: string, status: string, interviews: any[] } | null} */
	let editSet = null;

	let actionLoading = false;
	let actionError = '';
	let actionSuccess = '';

	const sort = createSortStore(filteredSets, 'set_name');

	$: sets = $setsStore.sets;
	$: selectedIds = $setsStore.selectedIds;
	$: allVisibleSelected =
		$filteredSets.length > 0 && $filteredSets.every((s) => selectedIds.includes(s._id));
	$: someSelected = selectedIds.length > 0;

	onMount(async () => {
		navState.set('Sets');
		await loadSets();
	});

	async function loadSets() {
		try {
			error = '';
			const response = await api.get('/api/set/read');
			if (response.ok) {
				const data = await response.json();
				setsStore.setSets(data.sets || []);
			} else {
				const data = await response.json();
				error = data.error || $t('Admin.Sets.error_load');
			}
		} catch (err) {
			error = $t('Admin.Sets.error_load');
			console.error('Error fetching sets:', err);
		} finally {
			loading = false;
			refreshing = false;
		}
	}

	async function handleRefresh() {
		refreshing = true;
		setsStore.clearSelection();
		actionError = '';
		actionSuccess = '';
		await loadSets();
	}

	function toggleSelectAll() {
		if (allVisibleSelected) {
			setsStore.clearSelection();
		} else {
			setsStore.selectAll($filteredSets.map((s) => s._id));
		}
	}

	function toggleRow(id) {
		setsStore.toggleSelection(id);
	}

	function openCreate() {
		editSet = null;
		showModal = true;
	}

	async function openEdit(set) {
		// Fetch full set with populated interviews from single-set endpoint
		try {
			const res = await api.get(`/api/set/read/${set._id}`);
			if (res.ok) {
				editSet = await res.json();
			} else {
				editSet = set;
			}
		} catch {
			editSet = set;
		}
		showModal = true;
	}

	function closeModal() {
		showModal = false;
		editSet = null;
	}

	async function handleSaved(e) {
		let complete;
		if (e.detail && typeof e.detail.complete === 'function') {
			complete = e.detail.complete;
		}

		await loadSets();

		actionSuccess = $t('Admin.Sets.status_updated');
		clearActionFeedback();

		if (complete) complete();
	}

	async function handleChangeStatus() {
		if (!someSelected) {
			actionError = $t('Admin.Sets.no_selection');
			clearActionFeedback();
			return;
		}
		if (!confirm($t('Admin.Sets.confirm_status_change'))) return;

		actionLoading = true;
		actionError = '';
		actionSuccess = '';

		try {
			const updates = selectedIds.map((id) => {
				const set = sets.find((s) => s._id === id);
				return { set_id: id, status: set?.status === 'active' ? 'disabled' : 'active' };
			});

			const response = await api.patch('/api/set/edit-status', { updates });

			if (response.ok) {
				const data = await response.json();
				setsStore.updateStatuses(data.updated);
				setsStore.clearSelection();
				actionSuccess = $t('Admin.Sets.status_updated');
				clearActionFeedback();
			} else {
				const data = await response.json();
				actionError = data.error || 'Failed to update status';
			}
		} catch (err) {
			actionError = 'Failed to update status';
			console.error('Error changing status:', err);
		} finally {
			actionLoading = false;
		}
	}

	async function handleDelete() {
		if (!someSelected) {
			actionError = $t('Admin.Sets.no_selection');
			clearActionFeedback();
			return;
		}
		if (!confirm($t('Admin.Sets.confirm_delete'))) return;

		actionLoading = true;
		actionError = '';
		actionSuccess = '';

		const idsToDelete = [...selectedIds];
		const failures = [];

		for (const id of idsToDelete) {
			try {
				const response = await fetch('/api/set/delete', {
					method: 'DELETE',
					credentials: 'include',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ set_id: id })
				});
				if (response.ok) {
					setsStore.removeSet(id);
				} else {
					const data = await response.json();
					failures.push(data.error || id);
				}
			} catch (err) {
				failures.push(id);
				console.error('Delete error for', id, err);
			}
		}

		if (failures.length === 0) {
			actionSuccess = $t('Admin.Sets.delete_success');
			clearActionFeedback();
		} else {
			actionError = `Failed to delete ${failures.length} set(s)`;
		}

		actionLoading = false;
	}

	function clearActionFeedback() {
		setTimeout(() => {
			actionSuccess = '';
			actionError = '';
		}, 3000);
	}

	function getStatusClass(status) {
		return status === 'active' ? 'bg-Success text-white' : 'bg-Gray_Dark text-white';
	}
</script>

<div class="py-6 px-[82px] z-10 relative">
	<!-- Page Header -->
	<PageHeader
		title="{$t('Admin.Sets.title')} ({sets.length})"
		subtitle={$t('Admin.Sets.subtitle')}
		{refreshing}
		on:refresh={handleRefresh}
	>
		<Button
			outline
			label={$t('Admin.Sets.change_status_button')}
			size="small"
			disabled={!someSelected || actionLoading}
			onClick={handleChangeStatus}
		/>
		<Button
			variant="danger"
			label={$t('Admin.Sets.delete_button')}
			size="small"
			disabled={!someSelected || actionLoading}
			onClick={handleDelete}
		/>
		<Button label={$t('Admin.Sets.create_button')} size="small" onClick={openCreate} />
	</PageHeader>

	<!-- Action feedback -->
	{#if actionSuccess}
		<div class="mb-4 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
			<p class="text-sm text-green-800">{actionSuccess}</p>
		</div>
	{/if}
	{#if actionError}
		<div class="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
			<p class="text-sm text-red-800">{actionError}</p>
		</div>
	{/if}

	<!-- Loading state -->
	{#if loading}
		<div class="flex justify-center items-center h-64">
			<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-Success"></div>
		</div>

		<!-- Error state -->
	{:else if error}
		<div class="bg-red-50 p-4 rounded-lg">
			<div class="flex gap-3 items-start">
				<svg
					class="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5"
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
				<p class="text-sm font-medium text-red-800">{error}</p>
			</div>
		</div>

		<!-- Table -->
	{:else}
		<div class="bg-white rounded-lg shadow overflow-hidden">
			<table class="min-w-full">
				<thead class="bg-Lightest_gray">
					<tr>
						<!-- Select all checkbox -->
						<th class="w-10 pl-4 pr-5 py-3">
							<input
								type="checkbox"
								checked={allVisibleSelected}
								on:change={toggleSelectAll}
								class="h-4 w-4 rounded text-Success focus:ring-Success border-Gray_Dark"
							/>
						</th>
						<th class="pr-5 py-3 text-left text-base font-normal text-gray-600">
							<button
								on:click={() => sort.toggle('set_name')}
								class="flex items-center justify-between w-full hover:text-black transition-colors"
							>
								<span class="flex items-center gap-5">
									<span class="w-px h-4 bg-Success inline-block"></span>
									{$t('Admin.Sets.table.set_names')}
								</span>
								<svg
									width="18"
									height="18"
									viewBox="0 0 18 18"
									fill="none"
									class="flex-shrink-0 {$sort.key === 'set_name'
										? 'text-Success'
										: 'text-Gray_Dark opacity-50'}"
								>
									<circle cx="9" cy="9" r="8.5" stroke="currentColor" />
									{#if $sort.key === 'set_name' && $sort.dir === -1}
										<path
											d="M6 10.5L9 7.5L12 10.5"
											stroke="currentColor"
											stroke-width="1.5"
											stroke-linecap="round"
											stroke-linejoin="round"
										/>
									{:else}
										<path
											d="M6 7.5L9 10.5L12 7.5"
											stroke="currentColor"
											stroke-width="1.5"
											stroke-linecap="round"
											stroke-linejoin="round"
										/>
									{/if}
								</svg>
							</button>
						</th>
						<th class="pr-5 py-3 text-left text-base font-normal text-gray-600">
							<button
								on:click={() => sort.toggle('interviewCount')}
								class="flex items-center justify-between w-full hover:text-black transition-colors"
							>
								<span class="flex items-center gap-5">
									<span class="w-px h-4 bg-Success inline-block"></span>
									{$t('Admin.Sets.table.interviews')}
								</span>
								<svg
									width="18"
									height="18"
									viewBox="0 0 18 18"
									fill="none"
									class="flex-shrink-0 {$sort.key === 'interviewCount'
										? 'text-Success'
										: 'text-Gray_Dark opacity-50'}"
								>
									<circle cx="9" cy="9" r="8.5" stroke="currentColor" />
									{#if $sort.key === 'interviewCount' && $sort.dir === -1}
										<path
											d="M6 10.5L9 7.5L12 10.5"
											stroke="currentColor"
											stroke-width="1.5"
											stroke-linecap="round"
											stroke-linejoin="round"
										/>
									{:else}
										<path
											d="M6 7.5L9 10.5L12 7.5"
											stroke="currentColor"
											stroke-width="1.5"
											stroke-linecap="round"
											stroke-linejoin="round"
										/>
									{/if}
								</svg>
							</button>
						</th>
						<th class="pr-5 py-3 text-left text-base font-normal text-gray-600">
							<button
								on:click={() => sort.toggle('sent')}
								class="flex items-center justify-between w-full hover:text-black transition-colors"
							>
								<span class="flex items-center gap-5">
									<span class="w-px h-4 bg-Success inline-block"></span>
									{$t('Admin.Sets.table.sent')}
								</span>
								<svg
									width="18"
									height="18"
									viewBox="0 0 18 18"
									fill="none"
									class="flex-shrink-0 {$sort.key === 'sent'
										? 'text-Success'
										: 'text-Gray_Dark opacity-50'}"
								>
									<circle cx="9" cy="9" r="8.5" stroke="currentColor" />
									{#if $sort.key === 'sent' && $sort.dir === -1}
										<path
											d="M6 10.5L9 7.5L12 10.5"
											stroke="currentColor"
											stroke-width="1.5"
											stroke-linecap="round"
											stroke-linejoin="round"
										/>
									{:else}
										<path
											d="M6 7.5L9 10.5L12 7.5"
											stroke="currentColor"
											stroke-width="1.5"
											stroke-linecap="round"
											stroke-linejoin="round"
										/>
									{/if}
								</svg>
							</button>
						</th>
						<th class="pr-5 py-3 text-left text-base font-normal text-gray-600">
							<span class="flex items-center gap-5">
								<span class="w-px h-4 bg-Success inline-block"></span>
								{$t('Admin.Sets.table.status')}
							</span>
						</th>
					</tr>
				</thead>
				<tbody class="bg-white divide-y divide-Gray_Light">
					{#if $sort.sorted.length === 0}
						<tr>
							<td colspan="5" class="px-6 py-12 text-center text-Gray_Dark text-base">
								{$t('Admin.Sets.no_sets')}
							</td>
						</tr>
					{:else}
						{#each $sort.sorted as set (set._id)}
							<tr
								class="hover:bg-Lightest_gray transition-colors {selectedIds.includes(set._id)
									? 'bg-green-50'
									: ''}"
							>
								<!-- Row checkbox -->
								<td class="w-10 pl-4 pr-5 py-4">
									<input
										type="checkbox"
										checked={selectedIds.includes(set._id)}
										on:change={() => toggleRow(set._id)}
										class="h-4 w-4 rounded text-Success focus:ring-Success border-Gray_Dark"
									/>
								</td>

								<!-- Set Name (clickable → edit) -->
								<td class="pl-[21px] pr-5 py-4 whitespace-nowrap">
									<button
										class="text-Success hover:text-Success_Dark text-base underline-offset-2 hover:underline transition-colors"
										on:click={() => openEdit(set)}
									>
										{set.set_name}
									</button>
								</td>

								<!-- Interview count -->
								<td class="pl-[21px] pr-5 py-4 whitespace-nowrap">
									<button
										class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-Success bg-opacity-10 text-Success text-base hover:bg-opacity-20 transition-colors"
										on:click={() => openEdit(set)}
										title="View interviews"
									>
										{set.interviewCount ?? 0}
									</button>
								</td>

								<!-- Sent -->
								<td class="pl-[21px] pr-5 py-4 whitespace-nowrap text-base text-gray-700">
									{set.sent ?? 0}
								</td>

								<!-- Status badge -->
								<td class="pl-[21px] pr-5 py-4 whitespace-nowrap">
									<span
										class="inline-flex px-3 rounded-full text-base {getStatusClass(set.status)}"
									>
										{set.status === 'active'
											? $t('Admin.Sets.status.active')
											: $t('Admin.Sets.status.disabled')}
									</span>
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<!-- Create / Edit modal -->
<SetModal show={showModal} {editSet} on:close={closeModal} on:saved={handleSaved} />

<style>
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	.animate-spin {
		animation: spin 0.8s linear infinite;
	}
</style>
