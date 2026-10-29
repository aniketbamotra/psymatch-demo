<script>
	import { createEventDispatcher } from 'svelte';

	export let title = '';
	export let subtitle = '';
	export let showSearch = false;
	export let searchPlaceholder = 'Search…';
	export let searchValue = '';
	export let refreshing = false;

	const dispatch = createEventDispatcher();

	function handleSearch(e) {
		searchValue = e.target.value;
		dispatch('search', { value: searchValue });
	}

	function handleRefresh() {
		if (!refreshing) {
			dispatch('refresh');
		}
	}
</script>

<div class="flex items-center gap-4 mb-6">
	<!-- Title + subtitle -->
	<div class="flex-shrink-0">
		<h1 class="text-base font-semibold text-Success pb-0.5 leading-tight">
			{title}
		</h1>
		{#if subtitle}
			<p class="text-sm text-Black mt-1">{subtitle}</p>
		{/if}
	</div>

	<!-- Middle spacer / search bar -->
	<div class="flex-1 flex items-center gap-2 min-w-0">
		<div class="flex-1 h-[1.5px] bg-Success"></div>

		{#if showSearch}
			<div class="relative flex items-center">
				<input
					type="text"
					placeholder={searchPlaceholder}
					value={searchValue}
					on:input={handleSearch}
					class="w-56 pl-3 pr-8 py-1.5 text-sm border border-Gray_Light rounded-md focus:outline-none focus:ring-1 focus:ring-Success focus:border-Success bg-white"
				/>
				<svg
					class="absolute right-2.5 text-Gray_Dark pointer-events-none"
					width="14"
					height="14"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<circle cx="11" cy="11" r="8" />
					<line x1="21" y1="21" x2="16.65" y2="16.65" />
				</svg>
			</div>
		{/if}

		<!-- Refresh button -->
		<button
			on:click={handleRefresh}
			class="flex items-center justify-center w-8 h-8 border text-Success hover:text-white border-Success rounded-md bg-transparent hover:bg-Success transition-colors {refreshing
				? 'cursor-wait'
				: ''}"
			aria-label="Refresh"
		>
			<svg
				class=" {refreshing ? 'animate-spin' : ''}"
				width="14"
				height="14"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<polyline points="23 4 23 10 17 10" />
				<polyline points="1 20 1 14 7 14" />
				<path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
			</svg>
		</button>
	</div>

	<!-- Action buttons slot -->
	<div class="flex items-center gap-2 flex-shrink-0">
		<slot />
	</div>
</div>

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
