<script>
	import { createEventDispatcher } from 'svelte';
	const dispatch = createEventDispatcher();

	export let value = '';
	export let error = null;
	export let loading = false;
	export let success = false;
	export let required = false;
	export let isValid = false;

	// Format date for display
	function formatDate(date) {
		if (!date) return '';
		const d = new Date(date);
		if (isNaN(d.getTime())) return '';
		return d.toISOString().split('T')[0];
	}

	// Handle date input
	function handleDateInput(e) {
		const newDate = e.target.value;
		value = newDate;
	}

	// Validate date
	function validateDate(date) {
		if (!date) return null;
		const birthDate = new Date(date);
		const today = new Date();
		if (isNaN(birthDate.getTime())) return 'Invalid date';
		if (birthDate > today) return 'Date cannot be in the future';
		return null;
	}

	// Track validation error
	let dateError = null;

	$: {
		dateError = required && !value ? 'Date of birth is required' : validateDate(value);
		isValid = required ? !!value && !dateError : true;
	}

	// Base styles
	const baseStyles = {
		input:
			'grow shrink basis-0 text-black text-base font-light leading-snug px-5 py-3 bg-High-fed-white rounded-[0.5625rem] outline-none border-none focus:ring-0',
		label: 'text-black text-sm font-normal leading-none',
		container: 'self-stretch rounded-[0.5625rem] justify-start items-center gap-2 inline-flex',
		group: 'self-stretch flex-col justify-start w-full items-start gap-3 flex'
	};
</script>

<div class={baseStyles.group}>
	<label class={baseStyles.label}>Date of Birth</label>
	<div class={baseStyles.container}>
		<input
			type="date"
			class={baseStyles.input}
			value={formatDate(value)}
			max={new Date().toISOString().split('T')[0]}
			on:input={handleDateInput}
			disabled={loading || success}
			{required}
		/>
	</div>
</div>

{#if error}
	<p class="text-red-500 text-sm">{error}</p>
{/if}
