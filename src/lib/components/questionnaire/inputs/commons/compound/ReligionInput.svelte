<script>
	import { createEventDispatcher } from 'svelte';
	import { SelectInput, TextInput } from '../base';
	import { debugMode as t } from '$lib/i18n-debug';
	const dispatch = createEventDispatcher();

	export let value = {
		religiosity: '',
		religionName: ''
	};
	export let error = null;
	export let loading = false;
	export let success = false;
	export let required = false;
	export let isValid = false;

	$: options = [
		$t('Questionnaire.Fields.Religion.options.atheist'),
		$t('Questionnaire.Fields.Religion.options.agnostic'),
		$t('Questionnaire.Fields.Religion.options.not_religious'),
		$t('Questionnaire.Fields.Religion.options.somewhat_religious'),
		$t('Questionnaire.Fields.Religion.options.highly_religious')
	];

	$: console.log('ReligionInput value:', value);
	let isValidReligiosity = false;
	let isValidReligionName = true; // Initially true, will be properly validated when needed

	// Field-level validation errors
	let fieldErrors = {
		religiosity: null,
		religionName: null
	};

	// Initialize value with defaults
	value = {
		religiosity: value?.religiosity || '',
		religionName: value?.religionName || ''
	};

	// Whether to show religion name field
	$: showReligionName = !!value.religiosity;

	// Update validation for religion name when religiosity changes
	$: {
		if (showReligionName) {
			// detail box is now optional
			isValidReligionName = true;
		} else {
			isValidReligionName = true; // Not required if not shown
		}
	}
	$: console.log('showReligionName:', showReligionName);
	// Check if all required fields are valid
	$: {
		if (required) {
			isValid = isValidReligiosity && isValidReligionName;
		} else {
			isValid = true;
		}
	}

	// Handle religiosity change
</script>

<div class="flex flex-col space-y-4 max-w-2xl">
	<SelectInput
		label={$t('Questionnaire.Fields.Religion.religiosity_label')}
		bind:value={value.religiosity}
		{options}
		error={fieldErrors.religiosity}
		bind:isValid={isValidReligiosity}
		{loading}
		{success}
		{required}
	/>

	{#if showReligionName}
		<TextInput
			label={$t('Questionnaire.Fields.Religion.religion_name_label')}
			placeholder={$t('Questionnaire.Fields.Religion.religion_name_placeholder')}
			bind:value={value.religionName}
			error={fieldErrors.religionName}
			bind:isValid={isValidReligionName}
			{loading}
			{success}
			required={false}
		/>
	{/if}

	{#if error}
		<p class="text-red-500 text-sm">{error}</p>
	{/if}
</div>
