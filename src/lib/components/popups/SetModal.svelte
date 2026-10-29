<script>
	import { createEventDispatcher } from 'svelte';
	import * as api from '$lib/api';
	import { debugMode as t } from '$lib/i18n-debug';
	import { fly } from 'svelte/transition';
	import MultiSelector from '$lib/components/form/MultiSelector.svelte';

	export let show = false;
	/** @type {{ _id: string, set_name: string, status: string, interviews: any[] } | null} */
	export let editSet = null;

	const dispatch = createEventDispatcher();

	let setName = '';
	let selectedStatus = 'active';
	/** @type {any[]} */
	let selectedInterviews = [];
	/** @type {any[]} */
	let availableInterviews = [];

	let loading = false;
	let loadingInterviews = false;
	let error = '';
	let editingName = false;

	$: isEdit = editSet !== null;

	$: if (show) {
		resetForm();
		loadInterviews();
	}

	function resetForm() {
		error = '';
		editingName = false;
		selectedInterviews = [];
		if (editSet) {
			setName = editSet.set_name;
			selectedStatus = editSet.status;
		} else {
			setName = 'New Set';
			selectedStatus = 'active';
		}
	}

	async function loadInterviews() {
		try {
			loadingInterviews = true;
			const response = await api.get('/api/available-questionnaires');

			if (response.ok) {
				availableInterviews = await response.json();
				// After loading, pre-select interviews that belong to the set being edited
				if (editSet) {
					const editIds = (editSet.interviews || []).map((i) =>
						(typeof i === 'object' ? i._id : i).toString()
					);
					selectedInterviews = availableInterviews.filter((i) =>
						editIds.includes(i._id.toString())
					);
				}
			}
		} catch (err) {
			console.error('Error loading interviews:', err);
		} finally {
			console.log('availableInterviews', availableInterviews);
			console.log('selectedInterviews', selectedInterviews);
			loadingInterviews = false;
		}
	}

	function toggleStatus() {
		selectedStatus = selectedStatus === 'active' ? 'disabled' : 'active';
	}

	async function handleSave() {
		if (loading) return;
		error = '';

		if (!setName.trim()) {
			error = $t('Admin.Sets.modal.error_name_required');
			return;
		}

		try {
			loading = true;
			const interviewIds = selectedInterviews.map((i) => i._id);

			let response;
			if (isEdit) {
				response = await api.patch('/api/set/edit', {
					set_id: editSet._id,
					set_name: setName.trim(),
					interviews: interviewIds
				});

				if (response.ok && editSet.status !== selectedStatus) {
					const statusResponse = await api.patch('/api/set/edit-status', {
						updates: [{ set_id: editSet._id, status: selectedStatus }]
					});
					if (!statusResponse.ok) {
						response = statusResponse;
					}
				}
			} else {
				response = await api.post('/api/set/create', {
					set_name: setName.trim(),
					status: selectedStatus,
					interviews: interviewIds
				});
			}

			if (response.ok) {
				const result = await response.json();
				dispatch('saved', {
					result,
					complete: () => {
						loading = false;
						handleClose();
					}
				});
			} else {
				const data = await response.json();
				error =
					response.status === 409
						? $t('Admin.Sets.modal.error_duplicate')
						: data.error || $t('Admin.Sets.modal.error_generic');
			}
		} catch (err) {
			error = $t('Admin.Sets.modal.error_generic');
			console.error('Error saving set:', err);
		}
		if (error) {
			loading = false;
		}
	}

	function handleClose() {
		dispatch('close');
	}

	function handleNameKeydown(e) {
		if (e.key === 'Enter' || e.key === 'Escape') {
			editingName = false;
			e.currentTarget.blur();
		}
	}

	/** Svelte use: action to focus an element on mount */
	function focusOnMount(node) {
		node.focus();
	}
</script>

{#if show}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 bg-black bg-opacity-20 backdrop-blur-[2px] z-40"
		on:click={handleClose}
		role="presentation"
	></div>

	<!-- Bottom sheet panel — slides up from bottom, left-offset by navbar width -->
	<div
		class="fixed bottom-0 left-[16rem] right-0 z-50 flex justify-center"
		transition:fly={{ y: 80, duration: 280, opacity: 0 }}
	>
		<div
			class="bg-white rounded-t-2xl shadow-Main_Shadow_L flex flex-col max-h-[500px] w-full max-w-[800px]"
		>
			<!-- ── Header ─────────────────────────────────────────── -->
			<div class="px-8 pt-7 pb-4">
				<!-- Row 1: title + close -->
				<div class="flex items-center justify-between gap-4 mb-2">
					<!-- Editable set name -->
					<div class="flex items-center gap-2 min-w-0 flex-1">
						{#if editingName}
							<input
								type="text"
								bind:value={setName}
								use:focusOnMount
								on:blur={() => (editingName = false)}
								on:keydown={handleNameKeydown}
								class="text-xl font-semibold text-black bg-transparent border-b-2 border-Success outline-none leading-tight min-w-0 w-full"
							/>
						{:else}
							<h2 class="text-xl font-semibold text-black leading-tight truncate">{setName}</h2>
							<button
								on:click={() => (editingName = true)}
								class="flex-shrink-0 text-Success hover:text-Success_Dark transition-colors"
								aria-label="Edit set name"
							>
								<svg
									width="18"
									height="18"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
									<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
								</svg>
							</button>
						{/if}
					</div>
					<!-- Close button -->
					<button
						on:click={handleClose}
						class="flex-shrink-0 text-gray-400 hover:text-black transition-colors"
						aria-label="Close"
					>
						<svg
							width="22"
							height="22"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<line x1="18" y1="6" x2="6" y2="18" />
							<line x1="6" y1="6" x2="18" y2="18" />
						</svg>
					</button>
				</div>

				<!-- Row 2: active toggle + no of times sent -->
				<div class="flex items-center justify-between gap-4">
					<div class="flex items-center gap-3">
						<span class="text-sm text-Gray_Dark">Disable</span>
						<button
							on:click={toggleStatus}
							class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none {selectedStatus ===
							'active'
								? 'bg-Success'
								: 'bg-gray-300'}"
							role="switch"
							aria-checked={selectedStatus === 'active'}
						>
							<span
								class="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform {selectedStatus ===
								'active'
									? 'translate-x-6'
									: 'translate-x-1'}"
							></span>
						</button>
						<span class="text-sm text-Gray_Dark">Active</span>
					</div>
				</div>
			</div>

			<!-- Error banner -->
			{#if error}
				<div class="mx-8 mb-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
					<p class="text-sm text-red-800">{error}</p>
				</div>
			{/if}

			<!-- ── Two-column interview body ───────────────────────────── -->
			<div class="px-8 pb-4 overflow-hidden flex-1 min-h-0">
				{#if loadingInterviews}
					<div class="flex items-center justify-center h-20 gap-2 text-Gray_Dark text-sm">
						<div class="animate-spin rounded-full h-4 w-4 border-b-2 border-Success"></div>
						<span>Loading…</span>
					</div>
				{:else}
					<MultiSelector
						options={availableInterviews}
						bind:selected={selectedInterviews}
						field1="Available interviews"
						field2="Interviews in the set"
					/>
				{/if}
			</div>

			<!-- ── Footer ──────────────────────────────────────────────── -->
			<div class="flex items-center justify-between px-8 py-5 border-t border-Gray_Light">
				<button
					on:click={handleClose}
					class="flex items-center gap-2 px-6 py-3 rounded-xl border border-black text-black text-sm font-medium hover:bg-gray-50 transition-colors"
				>
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<line x1="19" y1="12" x2="5" y2="12" />
						<polyline points="12 19 5 12 12 5" />
					</svg>
					Close without saving
				</button>

				<button
					on:click={handleSave}
					disabled={loading}
					class="px-8 py-3 rounded-xl text-sm font-medium transition-colors {loading
						? 'bg-Gray_Dark text-white cursor-wait'
						: 'bg-Success hover:bg-Success_Dark text-white'}"
				>
					{#if loading}
						Saving…
					{:else}
						Save Changes
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	* {
		scrollbar-width: thin;
		scrollbar-color: rgb(88, 88, 88) #ffffff00;
	}
	*::-webkit-scrollbar {
		width: 5px;
	}
	*::-webkit-scrollbar-track {
		background: transparent;
	}
	*::-webkit-scrollbar-thumb {
		background-color: rgb(180, 180, 180);
		border-radius: 100px;
	}
</style>
