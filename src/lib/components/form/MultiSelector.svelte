<script>
	import Pill from './Pill.svelte';
	export let options = [];
	export let selected = [];
	export let field1 = '';
	export let field2 = '';
	export let form = '';
	export let reverse = false;
	// When true, stack the Available panel above the Selected panel (vertical)
	// instead of side-by-side — fits a narrow column better.
	export let stacked = false;

	console.log('MultiSelector Props:', { options, selected, field1, field2, form, reverse });

	function equals(o1, o2) {
		if (o1 === o2) return true;
		if (o1 && o2 && typeof o1 === 'object' && typeof o2 === 'object') {
			if (o1.id && o2.id && o1.id === o2.id) return true;
			if (o1._id && o2._id && o1._id === o2._id) return true;
		}
		return false;
	}

	$: {
		console.log('MultiSelector Reactive Update:', { options, selected, availableOptions });
	}

	$: availableOptions = options.filter((opt) => !selected.some((s) => equals(opt, s)));

	function handleSelect(option) {
		selected = [...selected, option];
	}

	function handleDeselect(option) {
		if (option.isSent) return; // Cannot deselect sent options
		selected = selected.filter((opt) => !equals(opt, option));
	}

	function clearSelected() {
		// Only clear items that are NOT sent
		selected = selected.filter((opt) => opt.isSent);
	}

	function addAllNotDownloaded() {
		// Add all options that don't have status 'downloaded'
		const notDownloaded = options.filter((opt) => opt.status !== 'downloaded');
		selected = [...notDownloaded];
	}
</script>

<div
	class="{stacked ? 'flex flex-col' : 'grid grid-cols-2'} gap-2 justify-stretch h-full w-full {reverse
		? 'direction-rtl'
		: ''}"
>
	<!-- Available panel (top when stacked; left normally, right when reversed) -->
	<div class="flex flex-col flex-1 min-h-0 scroll-black overflow-hidden {reverse ? 'order-2' : 'order-1'}">
		<div class="flex items-center gap-2 mb-2">
			<p class="text-sm">{field1}</p>
			<slot name="field1-icon"></slot>
		</div>
		<div
			class="flex bg-[#eef2f1] flex-wrap gap-2 p-2 content-start rounded-lg overflow-y-scroll flex-grow"
		>
			{#each availableOptions as option}
				<Pill {option} on:select={() => handleSelect(option)} />
			{/each}
		</div>
	</div>

	<!-- Selected panel (bottom when stacked; right normally, left when reversed) -->
	<div class="flex flex-col flex-1 min-h-0 scroll-black overflow-hidden {reverse ? 'order-1' : 'order-2'}">
		<div class="flex justify-between items-center mb-2">
			<p class="text-sm">{field2}</p>
			<button
				class="text-sm block underline decoration-dotted text-Success"
				on:click={clearSelected}>clear ×</button
			>
		</div>

		<div
			class="flex bg-[#eef2f1] flex-wrap {selected.length === 0 && form === 'print-report'
				? 'content-center'
				: 'content-start'} gap-2 p-2 rounded-lg overflow-y-scroll flex-grow"
		>
			{#if selected.length === 0 && form === 'print-report'}
				<!-- Show button when nothing is selected -->
				<div class="w-full flex items-center justify-center">
					<button
						on:click={addAllNotDownloaded}
						class="border-2 border-[#00A886] text-[#00A886] rounded-lg px-6 py-3 text-sm font-medium hover:bg-[#E8F9F5] transition-colors"
					>
						Add all not-downloaded reports
					</button>
				</div>
			{:else}
				{#each selected.sort((a, b) => (a.isSent === b.isSent ? 0 : a.isSent ? 1 : -1)) as option}
					<Pill {option} selected on:deselect={() => handleDeselect(option)} />
				{/each}
			{/if}
		</div>
	</div>
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
