<script>
	import { createEventDispatcher, onMount } from 'svelte';
	import DigitInputBox from './DigitInputBox.svelte';

	export let value = '';
	export let isValid = false;
	export let error = null;
	export let loading = false;
	export let success = false;
	export let required = false;
	export let length = 10;

	const dispatch = createEventDispatcher();

	// Initialize array of digit values
	let digits = Array(length).fill('');
	let inputRefs = Array(length);
	let internalUpdate = false;

	// Update digits when value changes from outside
	$: {
		if (!internalUpdate && value && typeof value === 'string') {
			// Fill the digits array with the characters from value
			const valueDigits = value.replace(/\D/g, '').split('');
			digits = Array(length)
				.fill('')
				.map((_, i) => valueDigits[i] || '');
		}
	}

	// Update validation status based on digits content
	$: {
		// Validate: all digits are filled for required fields
		if (required) {
			isValid = digits.every((d) => /^\d$/.test(d));
		} else {
			// For non-required fields: valid if empty or all digits are filled
			isValid = digits.every((d) => d === '') || digits.every((d) => /^\d$/.test(d));
		}
	}

	// Function to update the value based on the current digits
	function updateValue() {
		internalUpdate = true;
		const newValue = digits.join('');
		if (value !== newValue) {
			value = newValue;
			dispatch('change', { value: newValue });
		}
		internalUpdate = false;
	}

	// Focus on the next input after entering a digit
	function handleNext(e) {
		const nextIndex = e.detail.index + 1;
		if (
			nextIndex < length &&
			inputRefs[nextIndex] &&
			typeof inputRefs[nextIndex].focus === 'function'
		) {
			inputRefs[nextIndex].focus();
		}
	}

	// Focus on the previous input when backspace is pressed on an empty input
	function handlePrev(e) {
		const prevIndex = e.detail.index - 1;
		if (
			prevIndex >= 0 &&
			inputRefs[prevIndex] &&
			typeof inputRefs[prevIndex].focus === 'function'
		) {
			inputRefs[prevIndex].focus();
		}
	}

	// Update the digit value when input changes
	function handleInput(e) {
		const { index, value } = e.detail;
		digits[index] = value;
		digits = [...digits]; // Create a new array to trigger reactivity
		updateValue();
	}

	// Handle paste event
	function handlePaste(e) {
		const { index, digits: pastedDigits } = e.detail;

		// Distribute pasted digits across input boxes
		for (let i = 0; i < pastedDigits.length && i + index < length; i++) {
			digits[i + index] = pastedDigits[i];
		}

		// Update digits array to trigger reactivity
		digits = [...digits];
		updateValue();

		// Focus on the appropriate box after paste
		const focusIndex = Math.min(index + pastedDigits.length, length - 1);
		if (focusIndex < length) {
			inputRefs[focusIndex].focus();
		}
	}

	// Public method to focus the first input box
	export function focus() {
		if (inputRefs[0]) {
			inputRefs[0].focus();
		}
	}

	// Auto-focus the first input when the component mounts
	onMount(() => {
		// Wait a tick to ensure references are properly set up
		setTimeout(() => {
			if (inputRefs[0] && typeof inputRefs[0].focus === 'function' && !value) {
				inputRefs[0].focus();
			}
		}, 0);
	});
</script>

<div class="digit-input-group lg:gap-[0.25rem] gap-[0.2rem]" class:error={!!error} class:success>
	{#each digits as digit, i}
		<DigitInputBox
			bind:this={inputRefs[i]}
			bind:value={digits[i]}
			{loading}
			isDisabled={loading}
			index={i}
			on:next={handleNext}
			on:prev={handlePrev}
			on:input={handleInput}
			on:paste={handlePaste}
		/>
	{/each}

	{#if error}
		<div class="error-message">{error}</div>
	{/if}
</div>

<style>
	.digit-input-group {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		width: 100%;
	}

	.error .digit-input {
		border-color: #ef4444;
	}

	.success .digit-input {
		border-color: #10b981;
	}

	.error-message {
		color: #ef4444;
		font-size: 0.75rem;
		margin-top: 0.25rem;
		width: 100%;
	}
</style>
