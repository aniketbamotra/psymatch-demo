<script>
	import { createEventDispatcher } from 'svelte';
	import { SelectInput, TextInput, TextArea } from '../base';
	import { debugMode as t } from '$lib/i18n-debug';
	const dispatch = createEventDispatcher();

	export let value = '';
	export let label = '';
	export let error = null;
	export let options = [];
	export let scale = undefined;
	export let loading = false;
	export let success = false;
	export let conditional = null;
	export let required = false;

	// Track if all required fields are filled
	let allFieldsFilled = false;

	// Track states
	let tempValue = value;
	let tempDetails = {};
	let showDetails = false;

	// Handle select change
	function handleChange({ detail }) {
		tempValue = detail.value;
		// Check if we should show conditional fields
		showDetails =
			conditional && Array.isArray(conditional.showIf) && conditional.showIf.includes(tempValue);

		// Clear details if hiding conditional fields
		if (!showDetails) {
			tempDetails = {};
		}
	}

	// Handle detail field input
	function handleDetailInput(fieldId, fieldValue) {
		tempDetails = { ...tempDetails, [fieldId]: fieldValue };
	}

	// Handle submit
	function handleSubmit() {
		value = tempValue;

		// Validate required fields
		if (required && showDetails) {
			if (conditional.type) {
				allFieldsFilled = !!tempDetails.details?.trim();
			} else if (conditional.fields) {
				allFieldsFilled = conditional.fields.every(
					(field) => !field.required || !!tempDetails[field.id]?.trim()
				);
			}

			if (!allFieldsFilled) {
				error = 'Please fill in all required fields';
				return;
			}
		}

		// Include details if they're shown and valid
		if (showDetails && Object.keys(tempDetails).length > 0) {
			dispatch('submit', { value: tempValue, details: tempDetails });
		} else {
			dispatch('submit', { value: tempValue });
		}
	}

	// Reset to initial state
	function reset() {
		tempValue = '';
		tempDetails = {};
		showDetails = false;
		value = '';
		dispatch('reset');
	}

	// Update temp values when props change
	$: {
		if (value !== tempValue) {
			tempValue = value;
		}
	}
</script>

<div class="flex flex-col space-y-4">
	<SelectInput
		{value}
		{label}
		{options}
		{scale}
		{loading}
		{success}
		{required}
		on:submit={handleChange}
	/>

	{#if showDetails}
		<div class="ml-4 mt-2">
			{#if conditional.type}
				<!-- Single conditional field -->
				{#if conditional.type === 'textarea'}
					<TextArea
						label={$t('Questionnaire.Fields.Commons.details')}
						placeholder={conditional.placeholder}
						value={tempDetails.details || ''}
						on:submit={({ detail }) => handleDetailInput('details', detail.value)}
						{loading}
						{success}
						{required}
						minRows={3}
						maxRows={6}
					/>
				{:else}
					<TextInput
						label={$t('Questionnaire.Fields.Commons.details')}
						type={conditional.type}
						placeholder={conditional.placeholder}
						value={tempDetails.details || ''}
						on:submit={({ detail }) => handleDetailInput('details', detail.value)}
						{loading}
						{success}
						{required}
					/>
				{/if}
			{:else if conditional.fields}
				<!-- Multiple conditional fields -->
				{#each conditional.fields as field}
					<div class="mt-4">
						{#if field.type === 'textarea'}
							<TextArea
								label={field.label}
								placeholder={field.placeholder}
								value={tempDetails[field.id] || ''}
								on:submit={({ detail }) => handleDetailInput(field.id, detail.value)}
								{loading}
								{success}
								required={field.required}
								minRows={3}
								maxRows={6}
							/>
						{:else}
							<TextInput
								label={field.label}
								type={field.type || 'text'}
								placeholder={field.placeholder}
								value={tempDetails[field.id] || ''}
								on:submit={({ detail }) => handleDetailInput(field.id, detail.value)}
								{loading}
								{success}
								required={field.required}
								min={field.min}
								max={field.max}
							/>
						{/if}
					</div>
				{/each}
			{/if}
		</div>
	{/if}

	{#if error}
		<p class="text-red-500 text-sm">{error}</p>
	{/if}
</div>
