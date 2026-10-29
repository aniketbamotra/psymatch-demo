<script>
	import { createEventDispatcher } from 'svelte';
	import { TextInput } from '../base';
	import { debugMode as t } from '$lib/i18n-debug';
	const dispatch = createEventDispatcher();

	export let value = {
		line1: '',
		line2: '',
		city: '',
		province: '',
		postalCode: '',
		country: ''
	};
	export let error = null;
	export let loading = false;
	export let success = false;
	export let required = false;
	export let international = false;
	export let isValid = false;

	let isValid1 = false;
	let isValid2 = false;
	let isValid3 = false;
	let isValid4 = false;
	let isValid5 = false;

	// Field-level validation errors
	let fieldErrors = {
		line1: null,
		line2: null,
		city: null,
		province: null,
		postalCode: null,
		country: null
	};

	// Validation patterns
	const postalCodePattern = /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/;
	const zipCodePattern = /^\d{5}(-\d{4})?$/;
	const cityPattern = /^[a-zA-Z\s'-]+$/;

	// Initialize value with defaults
	value = {
		line1: value?.line1 || '',
		line2: value?.line2 || '',
		city: value?.city || '',
		province: value?.province || '',
		postalCode: value?.postalCode || '',
		country: value?.country || ''
	};

	// Check if all required fields are valid
	$: {
		if (required) {
			if (international) {
				isValid = isValid1 && isValid2 && isValid3 && isValid4 && isValid5;
			} else {
				isValid = isValid1 && isValid2 && isValid3 && isValid4;
			}
		} else {
			isValid = true;
		}
	}
</script>

<div class="space-y-4 max-w-2xl">
	<TextInput
		label={$t('Questionnaire.Fields.Address.line1_label')}
		placeholder={$t('Questionnaire.Fields.Address.line1_placeholder')}
		bind:value={value.line1}
		error={fieldErrors.line1}
		bind:isValid={isValid1}
		{loading}
		{success}
		{required}
	/>

	<TextInput
		label={$t('Questionnaire.Fields.Address.line2_label')}
		placeholder={$t('Questionnaire.Fields.Address.line2_placeholder')}
		bind:value={value.line2}
		error={fieldErrors.line2}
		{loading}
		{success}
	/>

	<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
		<TextInput
			label={$t('Questionnaire.Fields.Address.city_label')}
			placeholder={$t('Questionnaire.Fields.Address.city_placeholder')}
			bind:value={value.city}
			error={fieldErrors.city}
			bind:isValid={isValid2}
			{loading}
			{success}
			{required}
			pattern={cityPattern}
			patternError={$t('Questionnaire.Fields.Address.city_validation_error')}
		/>

		<TextInput
			label={international
				? $t('Questionnaire.Fields.Address.state_province_label')
				: $t('Questionnaire.Fields.Address.province_label')}
			placeholder={international
				? $t('Questionnaire.Fields.Address.state_province_placeholder')
				: $t('Questionnaire.Fields.Address.province_placeholder')}
			bind:value={value.province}
			error={fieldErrors.province}
			bind:isValid={isValid3}
			{loading}
			{success}
			{required}
		/>
	</div>

	<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
		<TextInput
			label={international
				? $t('Questionnaire.Fields.Address.postal_zip_label')
				: $t('Questionnaire.Fields.Address.postal_code_label')}
			placeholder={international
				? $t('Questionnaire.Fields.Address.postal_zip_placeholder')
				: $t('Questionnaire.Fields.Address.postal_code_placeholder')}
			bind:value={value.postalCode}
			error={fieldErrors.postalCode}
			bind:isValid={isValid4}
			{loading}
			{success}
			{required}
			pattern={international ? null : postalCodePattern}
			patternError={international
				? $t('Questionnaire.Fields.Address.zip_code_validation_error')
				: $t('Questionnaire.Fields.Address.postal_code_validation_error')}
		/>

		{#if international}
			<TextInput
				label={$t('Questionnaire.Fields.Address.country_label')}
				placeholder={$t('Questionnaire.Fields.Address.country_placeholder')}
				bind:value={value.country}
				error={fieldErrors.country}
				bind:isValid={isValid5}
				{loading}
				{success}
				{required}
			/>
		{/if}
	</div>

	{#if error}
		<p class="text-red-500 text-sm">{error}</p>
	{/if}
</div>
