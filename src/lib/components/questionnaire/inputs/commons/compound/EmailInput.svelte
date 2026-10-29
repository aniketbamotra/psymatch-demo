<script>
	import { createEventDispatcher } from 'svelte';
	import { TextInput } from '../base';
	import { debugMode as t } from '$lib/i18n-debug';
	const dispatch = createEventDispatcher();

	export let value = {
		primaryEmail: '',
		otherEmail1: '',
		otherEmail2: ''
	};
	export let error = null;
	export let loading = false;
	export let success = false;
	export let required = false;
	export let isValid = false;

	let isValidPrimary = false;
	let isValidOther1 = true; // Optional fields start as valid
	let isValidOther2 = true; // Optional fields start as valid

	// Field-level validation errors
	let fieldErrors = {
		primaryEmail: null,
		otherEmail1: null,
		otherEmail2: null
	};

	// Email validation pattern
	const emailPattern = /.*?@?[^@]*\.+.*/;

	// Initialize value with defaults
	value = {
		primaryEmail: value?.primaryEmail || '',
		otherEmail1: value?.otherEmail1 || '',
		otherEmail2: value?.otherEmail2 || ''
	};

	// Check if all required fields are valid
	$: {
		if (emailPattern.test(value.primaryEmail)) {
			isValid = true;
		} else {
			isValid = false;
		}
	}

	// Validate other emails only if they have content
</script>

<div class="flex flex-col space-y-4 max-w-2xl">
	<TextInput
		label={$t('Questionnaire.Fields.Email.primary_label')}
		placeholder={$t('Questionnaire.Fields.Email.placeholder')}
		bind:value={value.primaryEmail}
		error={fieldErrors.primaryEmail}
		bind:isValid={isValidPrimary}
		{loading}
		{success}
		{required}
		type="email"
		pattern={emailPattern}
		patternError={$t('Questionnaire.Fields.Email.validation_error')}
	/>

	<TextInput
		label={$t('Questionnaire.Fields.Email.other_label_1')}
		placeholder={$t('Questionnaire.Fields.Email.optional_placeholder')}
		bind:value={value.otherEmail1}
		error={fieldErrors.otherEmail1}
		bind:isValid={isValidOther1}
		{loading}
		{success}
		type="email"
		pattern={emailPattern}
		patternError={$t('Questionnaire.Fields.Email.validation_error')}
	/>

	<TextInput
		label={$t('Questionnaire.Fields.Email.other_label_2')}
		placeholder={$t('Questionnaire.Fields.Email.optional_placeholder')}
		bind:value={value.otherEmail2}
		error={fieldErrors.otherEmail2}
		bind:isValid={isValidOther2}
		{loading}
		{success}
		type="email"
		pattern={emailPattern}
		patternError={$t('Questionnaire.Fields.Email.validation_error')}
	/>

	{#if error}
		<p class="text-red-500 text-sm">{error}</p>
	{/if}
</div>
