<script>
	import { createEventDispatcher } from 'svelte';
	import { TextInput, TextArea } from '../base';
	import { debugMode as t } from '$lib/i18n-debug';
	const dispatch = createEventDispatcher();

	export let value = {
		primaryCaregiverOccupation: '',
		primaryCaregiverRelationship: '',
		secondaryCaregiverOccupation: '',
		secondaryCaregiverRelationship: ''
	};
	export let error = null;
	export let loading = false;
	export let success = false;
	export let required = false;
	export let isValid = false;

	let isValidPrimaryOccupation = false;
	let isValidPrimaryRelationship = false;
	let isValidSecondaryOccupation = false;
	let isValidSecondaryRelationship = false;

	// Field-level validation errors
	let fieldErrors = {
		primaryCaregiverOccupation: null,
		primaryCaregiverRelationship: null,
		secondaryCaregiverOccupation: null,
		secondaryCaregiverRelationship: null
	};

	// Initialize value with defaults
	value = {
		primaryCaregiverOccupation: value?.primaryCaregiverOccupation || '',
		primaryCaregiverRelationship: value?.primaryCaregiverRelationship || '',
		secondaryCaregiverOccupation: value?.secondaryCaregiverOccupation || '',
		secondaryCaregiverRelationship: value?.secondaryCaregiverRelationship || ''
	};

	// Check if all required fields are valid
	$: {
		if (required) {
			// Only primary caregiver fields are required
			isValid = isValidPrimaryOccupation && isValidPrimaryRelationship;
		} else {
			isValid = true;
		}
	}
</script>

<div class="flex flex-col space-y-6 max-w-2xl">
	<div class="border-b pb-4 mb-2">
		<h3 class="text-lg font-medium text-gray-800 mb-4">
			{$t('Questionnaire.Fields.Caregiver.primary_header')}
		</h3>

		<TextInput
			label={$t('Questionnaire.Fields.Caregiver.primary_occupation_label')}
			placeholder={$t('Questionnaire.Fields.Caregiver.primary_occupation_placeholder')}
			bind:value={value.primaryCaregiverOccupation}
			error={fieldErrors.primaryCaregiverOccupation}
			bind:isValid={isValidPrimaryOccupation}
			{loading}
			{success}
			{required}
		/>

		<div class="mt-4">
			<TextArea
				label={$t('Questionnaire.Fields.Caregiver.primary_relationship_label')}
				placeholder={$t('Questionnaire.Fields.Caregiver.primary_relationship_placeholder')}
				bind:value={value.primaryCaregiverRelationship}
				error={fieldErrors.primaryCaregiverRelationship}
				bind:isValid={isValidPrimaryRelationship}
				{loading}
				{success}
				{required}
			/>
		</div>
	</div>

	<div class="pt-2">
		<h3 class="text-lg font-medium text-gray-800 mb-4">
			{$t('Questionnaire.Fields.Caregiver.secondary_header')}
		</h3>

		<TextInput
			label={$t('Questionnaire.Fields.Caregiver.secondary_occupation_label')}
			placeholder={$t('Questionnaire.Fields.Caregiver.secondary_occupation_placeholder')}
			bind:value={value.secondaryCaregiverOccupation}
			error={fieldErrors.secondaryCaregiverOccupation}
			bind:isValid={isValidSecondaryOccupation}
			{loading}
			{success}
			required={false}
		/>

		<div class="mt-4">
			<TextArea
				label={$t('Questionnaire.Fields.Caregiver.secondary_relationship_label')}
				placeholder={$t('Questionnaire.Fields.Caregiver.secondary_relationship_placeholder')}
				bind:value={value.secondaryCaregiverRelationship}
				error={fieldErrors.secondaryCaregiverRelationship}
				bind:isValid={isValidSecondaryRelationship}
				{loading}
				{success}
				required={false}
			/>
		</div>
	</div>

	{#if error}
		<p class="text-red-500 text-sm">{error}</p>
	{/if}
</div>
