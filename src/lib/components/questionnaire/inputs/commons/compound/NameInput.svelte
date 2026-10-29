<script>
	import { createEventDispatcher } from 'svelte';
	import { TextInput } from '../base';
	import { locale } from 'svelte-i18n';
	import { debugMode as t } from '$lib/i18n-debug';
	const dispatch = createEventDispatcher();

	export let value = { firstName: '', middleName: '', lastName: '' };
	export let error = null;
	export let loading = false;
	export let success = false;
	export let required = false;
	export let includeMiddleName = false;
	export let isValid = false;
	let isValid1 = false;
	let isValid2 = false;
	let isValid3 = false;
	// Field-level validation errors
	let fieldErrors = {
		firstName: null,
		middleName: null,
		lastName: null
	};

	// Name validation pattern
	const namePattern = /^[a-zA-Z\s]+$/;
	$: namePatternError = $t('Questionnaire.Fields.Name.validation_error');

	// Validate a name field
	function validateName(field, value) {
		if (required && !value?.trim()) {
			return `${field} ${$t('Questionnaire.Fields.Name.required_error')}`;
		}
		if (value?.trim() && !namePattern.test(value)) {
			return namePatternError;
		}
		return null;
	}

	// Track temporary values and validation state
	value = { firstName: value?.firstName || '', lastName: value?.lastName || '' };
	let allFieldsValid = false;

	console.log('value', value);
	// Check if all required fields are valid

	// Update temp values when props change
	$: {
		if (isValid1 && isValid3) {
			isValid = true;
		}
	}
</script>

<div class="grid grid-cols-1 md:grid-cols-{includeMiddleName ? 3 : 2} gap-4">
	<TextInput
		label={$t('Questionnaire.Fields.Name.first_name_label')}
		placeholder={$t('Questionnaire.Fields.Name.first_name_placeholder')}
		bind:value={value.firstName}
		error={fieldErrors.firstName}
		bind:isValid={isValid1}
		{loading}
		{success}
		{required}
		pattern={namePattern}
		patternError={namePatternError}
	/>

	{#if includeMiddleName}
		<TextInput
			label={$t('Questionnaire.Fields.Name.middle_name_label')}
			placeholder={$t('Questionnaire.Fields.Name.middle_name_placeholder')}
			bind:value={value.middleName}
			error={fieldErrors.middleName}
			bind:isValid={isValid2}
			{loading}
			{success}
			pattern={namePattern}
			patternError={namePatternError}
		/>
	{/if}

	<TextInput
		label={$t('Questionnaire.Fields.Name.last_name_label')}
		placeholder={$t('Questionnaire.Fields.Name.last_name_placeholder')}
		bind:value={value.lastName}
		error={fieldErrors.lastName}
		bind:isValid={isValid3}
		{loading}
		{success}
		{required}
		pattern={namePattern}
		patternError={namePatternError}
	/>
	{#if error}
		<p class="text-red-500 text-sm col-span-{includeMiddleName ? 3 : 2}">{error}</p>
	{/if}
</div>
