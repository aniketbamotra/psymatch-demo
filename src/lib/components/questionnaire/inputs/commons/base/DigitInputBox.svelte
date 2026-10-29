<script>
	import { createEventDispatcher } from 'svelte';

	export let value = '';
	export let index = 0;
	export let isDisabled = false;
	export let maxLength = 1;

	// Reference to the actual DOM input element
	let inputElement;

	const dispatch = createEventDispatcher();

	// Public method to focus the input element
	export function focus() {
		if (inputElement) {
			inputElement.focus();
		}
	}

	// Handle input changes
	function handleInput(e) {
		// Get the current value from the input
		const inputValue = e.target.value;

		// Keep only the last digit if more than one character is entered
		if (inputValue.length > maxLength) {
			const lastChar = inputValue.slice(-1);
			if (/^\d$/.test(lastChar)) {
				value = lastChar;
				dispatch('input', { index, value: lastChar });
				dispatch('next', { index });
			} else {
				e.target.value = value; // Revert to previous valid value
			}
			return;
		}

		// Validate: only allow digits
		if (inputValue && !/^\d$/.test(inputValue)) {
			e.target.value = value; // Revert to previous valid value
			return;
		}

		// Update the value
		value = inputValue;

		// Notify parent component
		dispatch('input', { index, value: inputValue });

		// Move to next input if a valid digit was entered
		if (inputValue && /^\d$/.test(inputValue)) {
			dispatch('next', { index });
		}
	}

	// Handle key presses
	function handleKeydown(e) {
		switch (e.key) {
			case 'Backspace':
				if (!value) {
					// If current box is empty and backspace is pressed, focus previous box
					dispatch('prev', { index });
				}
				break;
			case 'ArrowLeft':
				// Move to previous input
				dispatch('prev', { index });
				break;
			case 'ArrowRight':
				// Move to next input
				dispatch('next', { index });
				break;
			case 'Delete':
				// Clear current box
				value = '';
				dispatch('input', { index, value: '' });
				break;
			default:
				// For other keys, let the default behavior happen
				break;
		}
	}

	// Handle focus event
	function handleFocus(e) {
		dispatch('focus', { index });
	}

	// Handle paste event
	function handlePaste(e) {
		e.preventDefault();
		const pasteData = (e.clipboardData || window.clipboardData).getData('text');
		const digits = pasteData.replace(/\D/g, ''); // Extract only digits

		if (digits) {
			dispatch('paste', { index, digits });
		}
	}
</script>

<input
	bind:this={inputElement}
	type="text"
	inputmode="numeric"
	maxlength={maxLength}
	bind:value
	on:input={handleInput}
	on:keydown={handleKeydown}
	on:focus={handleFocus}
	on:paste={handlePaste}
	disabled={isDisabled}
	class="digit-input h-[2.5rem] lg:w-[2.5rem] w-[1.7rem] p-0"
	autocomplete="off"
/>

<style>
	.digit-input {
		text-align: center;
		border: 1px solid #ccc;
		border-radius: 0.25rem;
		font-size: 1rem;
		transition:
			border-color 0.15s ease-in-out,
			box-shadow 0.15s ease-in-out;
	}

	.digit-input:focus {
		outline: none;
		border-color: #4f46e5;
		box-shadow: 0 0 0 0.2rem rgba(79, 70, 229, 0.25);
	}

	.digit-input:disabled {
		background-color: #f3f4f6;
		cursor: not-allowed;
	}
</style>
