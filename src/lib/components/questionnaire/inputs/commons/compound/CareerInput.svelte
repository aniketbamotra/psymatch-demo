<script>
	import { createEventDispatcher } from 'svelte';
	import { TextInput, SelectInput } from '../base';
	import { debugMode as t } from '$lib/i18n-debug';
	const dispatch = createEventDispatcher();

	export let value = {
		trainedOccupation: '',
		currentOccupation: '',
		workSatisfaction: ''
	};
	export let error = null;
	export let loading = false;
	export let success = false;
	export let required = false;
	export let isValid = false;

	let isValidTrained = false;
	let isValidCurrent = false;
	let isValidSatisfaction = false;

	// Field-level validation errors
	let fieldErrors = {
		trainedOccupation: null,
		currentOccupation: null,
		workSatisfaction: null
	};

	// Initialize value with defaults
	value = {
		trainedOccupation: value?.trainedOccupation || '',
		currentOccupation: value?.currentOccupation || '',
		workSatisfaction: value?.workSatisfaction || ''
	};

	// Satisfaction scale options
	$: satisfactionScale = [
		{ num: 1, text: $t('Questionnaire.Fields.Career.satisfaction_scale.very_dissatisfied') },
		{ num: 2, text: $t('Questionnaire.Fields.Career.satisfaction_scale.dissatisfied') },
		{ num: 3, text: $t('Questionnaire.Fields.Career.satisfaction_scale.neutral') },
		{ num: 4, text: $t('Questionnaire.Fields.Career.satisfaction_scale.satisfied') },
		{ num: 5, text: $t('Questionnaire.Fields.Career.satisfaction_scale.very_satisfied') }
	];

	// Check if all required fields are valid
	$: {
		if (required) {
			isValid = isValidTrained && isValidCurrent && isValidSatisfaction;
		} else {
			isValid = true;
		}
	}
</script>

<div class="flex flex-col space-y-4 max-w-2xl">
	<TextInput
		label={$t('Questionnaire.Fields.Career.trained_occupation_label')}
		placeholder={$t('Questionnaire.Fields.Career.trained_occupation_placeholder')}
		bind:value={value.trainedOccupation}
		error={fieldErrors.trainedOccupation}
		bind:isValid={isValidTrained}
		{loading}
		{success}
		{required}
	/>

	<TextInput
		label={$t('Questionnaire.Fields.Career.current_occupation_label')}
		placeholder={$t('Questionnaire.Fields.Career.current_occupation_placeholder')}
		bind:value={value.currentOccupation}
		error={fieldErrors.currentOccupation}
		bind:isValid={isValidCurrent}
		{loading}
		{success}
		{required}
	/>

	<SelectInput
		label={$t('Questionnaire.Fields.Career.work_satisfaction_label')}
		bind:value={value.workSatisfaction}
		error={fieldErrors.workSatisfaction}
		bind:isValid={isValidSatisfaction}
		{loading}
		{success}
		{required}
		scale={satisfactionScale}
	/>

	{#if error}
		<p class="text-red-500 text-sm">{error}</p>
	{/if}
</div>
