<script>
	import { createEventDispatcher } from 'svelte';
	import { debugMode as t } from '$lib/i18n-debug';
	const dispatch = createEventDispatcher();

	export let value = false;
	export let label = '';
	export let error = null;
	export let loading = false;
	export let success = false;
	export let required = false;
	export let isValid = false;

	// Base styles
	const baseStyles = {
		checkbox: 'form-checkbox h-4 w-4 text-cyan-400 border-gray-300 focus:ring-cyan-400',
		label: 'text-black text-sm font-normal leading-none',
		container: 'self-stretch rounded-[0.5625rem] justify-start items-center gap-2 inline-flex',
		group: 'self-stretch flex-col justify-start w-full items-start gap-3 flex'
	};

	// Handle checkbox change
	function handleChange(e) {
		value = e.target.checked;
		dispatch('submit', { value });
	}

	// Check validation
	$: {
		isValid = required ? value === true : true;
	}
</script>

<div class={baseStyles.group}>
	<div class={baseStyles.container}>
		<label class="flex items-center space-x-2 cursor-pointer">
			<input
				type="checkbox"
				class={baseStyles.checkbox}
				checked={value}
				on:change={handleChange}
				disabled={loading || success}
			/>

			<span class={baseStyles.label}>{$t(label)}</span>
		</label>
	</div>
	{#if error}
		<p class="text-red-500 text-sm">{error}</p>
	{/if}
</div>
