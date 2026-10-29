<script>
	import { createEventDispatcher, onMount } from 'svelte';
	import { TextInput, TextArea } from '../base';
	import { debugMode as t } from '$lib/i18n-debug';
	const dispatch = createEventDispatcher();

	// Initialize with a structured object format
	export let value = {
		answer: null,
		details: {}
	};
	export let label = '';
	export let error = null;
	export let loading = false;
	export let success = false;
	export let questionNumber;
	export let conditional = null;
	export let required = false;
	export let isValid = false;

	// Track validation states for each part of the input
	let isAnswerValid = false;
	let detailsValidation = {};
	let showDetails = false;

	// Initialize value with defaults and handle any non-standard input
	onMount(() => {
		// Initialize value structure
		if (!value || typeof value !== 'object') {
			value = {
				answer: typeof value === 'string' ? value : null,
				details: {}
			};
		} else if (!value.details) {
			value = { ...value, details: {} };
		}

		// Pre-initialize all possible field IDs with empty values if they don't exist
		if (conditional) {
			if (conditional.type) {
				// Single field type
				if (!value.details.details) {
					value.details.details = '';
				}
			} else if (conditional.fields && Array.isArray(conditional.fields)) {
				// Multiple fields
				conditional.fields.forEach((field) => {
					if (!value.details[field.id]) {
						value.details[field.id] = '';
					}
				});
			}
		}

		updateShowDetails();
		validateAll();
	});

	// Update whether to show details based on the answer
	function updateShowDetails() {
		if (!conditional || !value.answer) {
			showDetails = false;
			return;
		}

		if (typeof conditional.showIf === 'boolean') {
			showDetails = value.answer === 'true' && conditional.showIf;
		} else if (Array.isArray(conditional.showIf)) {
			showDetails = conditional.showIf.includes(value.answer);
		} else {
			showDetails = false;
		}
	}

	// Handle Yes/No selection
	function handleSelection(e) {
		const answer = e.target.value;

		// Clear details if hiding conditional fields
		if (
			answer === 'false' ||
			(conditional &&
				((typeof conditional.showIf === 'boolean' && answer !== 'true') ||
					(Array.isArray(conditional.showIf) && !conditional.showIf.includes(answer))))
		) {
			// Prepare an empty details object with all fields initialized
			let emptyDetails = {};
			if (conditional) {
				if (conditional.type) {
					emptyDetails.details = '';
				} else if (conditional.fields && Array.isArray(conditional.fields)) {
					conditional.fields.forEach((field) => {
						emptyDetails[field.id] = '';
					});
				}
			}

			value = { answer, details: emptyDetails };
		} else {
			value = { ...value, answer };
		}

		updateShowDetails();
		validateAll();
		dispatch('submit', value);
	}

	// Handle input changes and validation with reactivity
	$: if (value?.details) {
		validateAll();
		dispatch('submit', value);
	}

	// Validate all fields
	function validateAll() {
		// Basic validation for Yes/No selection
		isAnswerValid = required ? value.answer !== null : true;

		// "No" is always valid regardless of details
		if (value.answer === 'false') {
			isValid = isAnswerValid;
			return;
		}

		// If Yes is selected and details are required, validate them
		if (showDetails && value.answer === 'true') {
			if (conditional?.type) {
				// Single detail field
				detailsValidation = {
					details: required ? !!value.details?.details?.trim() : true
				};
			} else if (conditional?.fields) {
				// Multiple detail fields
				detailsValidation = conditional.fields.reduce((acc, field) => {
					acc[field.id] = !field.required || !!value.details?.[field.id]?.trim();
					return acc;
				}, {});
			}

			// Check if all details are valid
			const allDetailsValid = Object.values(detailsValidation).every((v) => v);

			// Overall validity
			isValid = isAnswerValid && allDetailsValid;
		} else {
			// No details required
			isValid = isAnswerValid;
		}

		// Add console logs for debugging
		console.log('BooleanWithDetails validation:', {
			isValid,
			value,
			showDetails,
			detailsValidation
		});
	}

	// Watch for value changes and update display status
	$: {
		console.log('Value changed:', value);
		if (value == '') {
			value = {
				answer: null,
				details: {}
			};
		}
		if (value) {
			updateShowDetails();
		}
	}
</script>

<div class="flex flex-col space-y-4">
	<!-- Yes/No Selection -->
	<div class="flex items-center space-x-4">
		<label class="flex items-center space-x-2 cursor-pointer">
			<input
				type="radio"
				name={`boolean_${questionNumber}`}
				value="true"
				checked={value.answer === 'true'}
				on:change={handleSelection}
				class="form-radio h-4 w-4 text-Success_Dark border-gray-300 focus:ring-Success_Dark"
				disabled={loading || success}
			/>
			<span class="text-sm">{$t('Questionnaire.Fields.Commons.yes')}</span>
		</label>
		<label class="flex items-center space-x-2 cursor-pointer">
			<input
				type="radio"
				name={`boolean_${questionNumber}`}
				value="false"
				checked={value.answer === 'false'}
				on:change={handleSelection}
				class="form-radio h-4 w-4 text-Success_Dark border-gray-300 focus:ring-Success_Dark"
				disabled={loading || success}
			/>
			<span class="text-sm">{$t('Questionnaire.Fields.Commons.no')}</span>
		</label>
	</div>

	<!-- Conditional Details Fields -->
	{#if showDetails}
		<div class="ml-4 mt-2">
			{#if conditional?.type}
				<!-- Single conditional field -->
				{#if conditional.type === 'textarea'}
					<TextArea
						label={$t('Questionnaire.Fields.Commons.details')}
						placeholder={$t(conditional.placeholder)}
						bind:value={value.details.details}
						isValid={detailsValidation?.details || false}
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
						placeholder={$t(conditional.placeholder)}
						bind:value={value.details.details}
						isValid={detailsValidation?.details || false}
						{loading}
						{success}
						{required}
					/>
				{/if}
			{:else if conditional?.fields}
				<!-- Multiple conditional fields -->
				{#each conditional.fields as field}
					<div class="mt-4">
						{#if field.type === 'textarea'}
							<TextArea
								label={$t(field.label)}
								placeholder={$t(field.placeholder)}
								bind:value={value.details[field.id]}
								isValid={detailsValidation?.[field.id] || false}
								{loading}
								{success}
								required={field.required}
								minRows={3}
								maxRows={6}
							/>
						{:else}
							<TextInput
								label={$t(field.label)}
								type={field.type || 'text'}
								placeholder={$t(field.placeholder)}
								bind:value={value.details[field.id]}
								isValid={detailsValidation?.[field.id] || false}
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
