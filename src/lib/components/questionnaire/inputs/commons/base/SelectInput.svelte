<script>
	import { createEventDispatcher } from 'svelte';
	import { debugMode as t } from '$lib/i18n-debug';
	const dispatch = createEventDispatcher();

	export let value = '';
	export let label = '';
	export let error = null;
	export let options = [];
	export let scale = undefined;
	export let loading = false;
	export let success = false;
	export let required = false;
	export let isValid = false;
	$: console.log('success', success);
	// Process scale options if provided
	$: scaleOptions =
		scale?.map((opt) => ({
			value: opt.num.toString(),
			text: opt.text
		})) || [];

	// Determine if using scale or regular options
	$: useScale = scale !== undefined;
	$: displayOptions = useScale ? scaleOptions : options;

	// Base styles
	const baseStyles = {
		select:
			'w-full text-black text-base leading-snug px-5 py-3 bg-High-fed-white rounded-[0.5625rem] outline-none border-none focus:ring-0',
		label: 'text-black text-sm font-normal leading-none',
		container:
			'self-stretch rounded-[0.5625rem] justify-start items-center gap-2 inline-flex relative',
		group: 'self-stretch flex-col justify-start w-full items-start gap-3 flex'
	};

	// Handle select change
	function handleChange(e) {
		const selectedValue = e.target.value;
		// Only proceed if value is not null (null is our marker for resetting)
		if (selectedValue !== null) {
			console.log('selectedValue:', selectedValue);
			value = selectedValue;
			dispatch('submit', selectedValue);
		}
	}

	// Reset select value to null when clicked
	function handleSelectClick() {
		// Store the current value for comparison
		const currentValue = value;
		// Temporarily set to null to force change event
		value = null;
		// Immediately restore to trigger handleChange even for same value
	}

	// Validate selection
	$: {
		isValid = required ? !!value : true;
		console.log('value:', value);
	}
</script>

<div class={baseStyles.group}>
	{#if label}
		<label class={baseStyles.label}>{label}</label>
	{/if}
	<div class={baseStyles.container}>
		<select
			class={baseStyles.select}
			bind:value
			on:change={handleChange}
			on:focus={handleSelectClick}
			disabled={loading || success}
			{required}
		>
			<option value="">Select...</option>
			{#each displayOptions as option}
				{#if useScale}
					<option class="text-black" value={option.value}>{option.value} - {$t(option.text)}</option
					>
				{:else if typeof option === 'object' && option !== null && 'value' in option && 'label' in option}
					<option class="text-black" value={option.value}>{$t(option.label)}</option>
				{:else}
					<option class="text-black" value={option}>{$t(option)}</option>
				{/if}
			{/each}
		</select>
	</div>
	{#if error}
		<p class="text-red-500 text-sm">{error}</p>
	{/if}
</div>

<style>
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@keyframes trim {
		0% {
			stroke-dashoffset: 60;
		}
		50% {
			stroke-dashoffset: 30;
		}
		100% {
			stroke-dashoffset: 60;
		}
	}

	@keyframes check {
		to {
			stroke-dashoffset: 0;
		}
	}

	.animate-spin {
		animation: spin 1s linear infinite;
	}

	.animate-trim {
		animation: trim 1.5s ease-in-out infinite;
	}

	.animate-check {
		animation: check 0.5s ease-in-out forwards;
	}
</style>
