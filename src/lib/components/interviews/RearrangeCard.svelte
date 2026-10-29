<script>
	import { createEventDispatcher } from 'svelte';
	import { fade, scale } from 'svelte/transition';
	import ChevronUp from '$lib/components/feather/chevron-up.svelte';
	import ChevronDown from '$lib/components/feather/chevron-down.svelte';

	export let itemName = 'Item Name';
	export let testCode = 'Test Code';
	export let position = 1;
	export let totalCount = 1;
	export let locked = false;
	export let draggable = true;

	const dispatch = createEventDispatcher();

	function handleMoveUp() {
		if (position > 1) {
			dispatch('moveUp', { position });
		}
	}

	function handleMoveDown() {
		if (position < totalCount) {
			dispatch('moveDown', { position });
		}
	}

	function handleDragStart(e) {
		e.dataTransfer.effectAllowed = 'move';
		e.dataTransfer.setData('text/plain', position);
		dispatch('dragStart', { position });
	}

	function handleDragOver(e) {
		if (!locked && draggable) {
			e.preventDefault();
			e.dataTransfer.dropEffect = 'move';
		}
	}

	function handleDrop(e) {
		e.preventDefault();
		const sourcePosistion = parseInt(e.dataTransfer.getData('text/plain'));
		if (sourcePosistion !== position) {
			dispatch('drop', { from: sourcePosistion, to: position });
		}
	}

	// Determine if up/down buttons should be disabled
	$: canMoveUp = !locked && position > 1;
	$: canMoveDown = !locked && position < totalCount;
</script>

<div
	class="relative rounded-[10px] border border-gray-200 py-3 px-5 shadow-sm transition-all duration-300 {locked
		? 'bg-[#D4D4D4]'
		: 'bg-white'}"
	draggable={draggable && !locked}
	on:dragstart={handleDragStart}
	on:dragover={handleDragOver}
	on:drop={handleDrop}
	role="region"
	aria-label={`${itemName} - Position ${position} of ${totalCount}`}
	transition:scale={{ duration: 200 }}
>
	<!-- Locked Variant -->
	{#if locked}
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-3 flex-1">
				<!-- Lock Icon -->
				<div
					class="flex items-center gap-4 w-40 justify-center rounded-[10px] bg-[#ECEDF2] py-2 px-3"
				>
					<span class="text-md font-medium text-black">Locked</span>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 24 24"
						fill="none"
						stroke="#8b8e8c"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="h-4 w-4"
					>
						<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
						<path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
					</svg>
				</div>

				<!-- Content -->
				<div class="flex-1 flex justify-between text-black border-l border-[#ECEDF2] pl-3">
					<p class="text-md">{itemName}</p>
					<p class="text-md">{testCode}</p>
				</div>
			</div>
		</div>
	{:else}
		<!-- Unlocked Variant -->
		<div class="flex items-center">
			<!-- Arrow Buttons and Position -->
			<div class="flex items-center gap-4 justify-center rounded-[10px] pr-3 flex-shrink-0">
				<!-- Up Arrow Button -->
				<button
					on:click={handleMoveUp}
					disabled={!canMoveUp}
					class={`flex h-8 w-8 rounded-full text-white items-center justify-center transition-colors ${
						canMoveUp ? 'bg-black cursor-pointer' : 'bg-gray-400 cursor-not-allowed'
					}`}
					aria-label="Move up"
					title={canMoveUp ? 'Move up' : 'Cannot move up (already at top)'}
				>
					<ChevronUp />
				</button>

				<!-- Position Number -->
				<span class="text-md font-medium bg-[#ECEDF2] py-2 px-8 rounded-[10px] text-black"
					>{position}</span
				>

				<!-- Down Arrow Button -->
				<button
					on:click={handleMoveDown}
					disabled={!canMoveDown}
					class={`flex h-8 w-8 text-white rounded-full items-center justify-center transition-colors ${
						canMoveDown ? 'bg-black cursor-pointer' : 'bg-gray-400 cursor-not-allowed'
					}`}
					aria-label="Move down"
					title={canMoveDown ? 'Move down' : 'Cannot move down (already at bottom)'}
				>
					<ChevronDown />
				</button>
			</div>

			<!-- Content -->
			<div class="flex-1 flex justify-between text-black border-l border-[#ECEDF2] pl-3">
				<p class="text-md">{itemName}</p>
				<p class="text-md">{testCode}</p>
			</div>
		</div>
	{/if}
</div>

<style>
	:global(div) {
		transition:
			transform 0.3s ease-out,
			opacity 0.3s ease-out;
	}

	@keyframes slideIn {
		from {
			opacity: 0;
			transform: translateY(15px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@keyframes slideInUp {
		from {
			opacity: 0;
			transform: translateY(20px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
