<script>
	import { createEventDispatcher } from 'svelte';
	const dispatch = createEventDispatcher();

	export let value = '';
	export let label = '';
	export let placeholder = '';
	export let error = null;
	export let id = '';
	export let loading = false;
	export let success = false;
	export let readonly = false;
	export let required = false;
	export let type = 'text';
	export let min = undefined;
	export let max = undefined;
	export let pattern = undefined;
	export let inputmode = undefined;
	export let isValid = false;
	// Track temporary input value

	// Base styles
	const baseStyles = {
		input:
			'w-full text-black text-base font-light leading-snug px-5 py-3 bg-High-fed-white rounded-[0.5625rem] outline-none border-none focus:ring-0',
		label: 'text-black text-sm font-normal leading-none',
		container: 'self-stretch rounded-[0.5625rem] justify-start items-center gap-2 inline-flex',
		group: 'self-stretch flex-col justify-start w-full items-start gap-3 flex'
	};
	$: {
		if (type === 'number') {
			const num = parseFloat(value);
			if (!isNaN(num)) {
				if (min !== undefined && num < min) value = min.toString();
				if (max !== undefined && num > max) value = max.toString();
				isValid = true;
			}
		}
		if (type === 'text') {
			if (value) {
				isValid = true;
			}
		}
		if (!value) {
			isValid = false;
		}
	}

	// Handle submit (e.g. on enter key)
	function handleSubmit() {
		if (value?.trim() || !required) {
			dispatch('submit', { value: value });
		}
	}
	// Reset to initial state
	function reset() {
		value = '';
		value = '';
		dispatch('reset');
	}

	// Update temp value when prop changes
</script>

<div class={baseStyles.group}>
	{#if label}
		<label class={baseStyles.label} for={id}>{label}</label>
	{/if}
	<div class={baseStyles.container}>
		<input
			{id}
			type="text"
			class={baseStyles.input}
			{placeholder}
			bind:value
			{readonly}
			{min}
			{max}
			{pattern}
			{inputmode}
			disabled={loading || success}
		/>
	</div>
	{#if error}
		<p class="text-red-500 text-sm">{error}</p>
	{/if}
</div>
