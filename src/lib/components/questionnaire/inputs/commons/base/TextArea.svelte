<script>
	import { createEventDispatcher } from 'svelte';
	const dispatch = createEventDispatcher();

	export let value = '';
	export let label = '';
	export let placeholder = '';
	export let error = null;
	export let loading = false;
	export let success = false;
	export let required = false;
	export let minRows = 3;
	export let maxRows = 10;
	export let maxLength = undefined;
	export let showCharCount = false;
	export let isValid = false;

	let charCount = 0;

	// Base styles
	const baseStyles = {
		textarea:
			'grow shrink basis-0 text-black text-base font-light leading-snug px-5 py-3 bg-High-fed-white rounded-[0.5625rem] outline-none border-none focus:ring-0',
		label: 'text-black text-sm font-normal leading-none',
		container: 'self-stretch rounded-[0.5625rem] justify-start items-center gap-2 inline-flex',
		group: 'self-stretch flex-col justify-start w-full items-start gap-3 flex'
	};

	// Handle input change
	function handleInput(e) {
		// Auto-resize based on content
		const textarea = e.target;
		textarea.style.height = 'auto';
		const newHeight = Math.min(Math.max(textarea.scrollHeight, minRows * 24), maxRows * 24);
		textarea.style.height = `${newHeight}px`;

		// Update character count
		charCount = value.length;
	}

	// Check validation
	$: {
		if (required) {
			isValid = value?.trim().length > 0;
		} else {
			isValid = true;
		}

		// Update character count on value change
		charCount = value?.length || 0;
	}
</script>

<div class={baseStyles.group}>
	{#if label}
		<label class={baseStyles.label}>{label}</label>
	{/if}
	<div class={baseStyles.container}>
		<div class="w-full flex flex-col">
			<textarea
				class={baseStyles.textarea}
				{placeholder}
				bind:value
				on:input={handleInput}
				disabled={loading || success}
				style="min-height: {minRows * 24}px; max-height: {maxRows * 24}px"
				maxlength={maxLength}
			/>
			{#if showCharCount}
				<div class="text-right text-sm text-gray-500 mt-1">
					{charCount}{#if maxLength}
						/ {maxLength}{/if}
				</div>
			{/if}
		</div>
	</div>
	{#if error}
		<p class="text-red-500 text-sm">{error}</p>
	{/if}
</div>
