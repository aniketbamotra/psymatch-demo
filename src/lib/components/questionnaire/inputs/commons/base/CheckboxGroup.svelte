<script>
	import { createEventDispatcher } from 'svelte';
	import { debugMode as t } from '$lib/i18n-debug';
	const dispatch = createEventDispatcher();

	export let value = [];
	export let label = '';
	export let error = null;
	export let loading = false;
	export let success = false;
	export let required = false;
	export let isValid = false;
	export let options = [];

	// Base styles
	const baseStyles = {
		checkbox: 'form-checkbox h-4 w-4 text-Success border-gray-300 focus:ring-Success',
		label: 'text-black text-sm font-normal leading-none',
		container:
			'self-stretch rounded-[0.5625rem] justify-start items-start gap-2 grid grid-cols-2 lg:grid-cols-3 flex-wrap gap-y-10 gap-x-5',
		group: 'self-stretch flex-col justify-start w-full items-start gap-3 flex',
		optionContainer: 'flex items-center space-x-2 cursor-pointer'
	};

	// Handle checkbox change
	function handleChange(option, e) {
		if (e.target.checked) {
			value = [...value, option];
		} else {
			value = value.filter((v) => v !== option);
		}
		dispatch('submit', { value });
	}

	// Check validation
	$: {
		isValid = required ? value.length > 0 : true;
	}
</script>

<div class={baseStyles.group}>
	{#if label}
		<label class={baseStyles.label}>{label}</label>
	{/if}
	<div class={baseStyles.container}>
		{#each options as option}
			<label class={baseStyles.optionContainer}>
				<input
					type="checkbox"
					class={baseStyles.checkbox}
					checked={value.includes(option)}
					on:change={(e) => handleChange(option, e)}
					disabled={loading || success}
				/>

				<span class={baseStyles.label}>{$t(option)}</span>
			</label>
		{/each}
	</div>
	{#if error}
		<p class="text-red-500 text-sm">{error}</p>
	{/if}
</div>
