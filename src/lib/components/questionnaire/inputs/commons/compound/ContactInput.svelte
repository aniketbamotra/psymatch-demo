<script>
	import { createEventDispatcher } from 'svelte';
	import { TextInput } from '../base';
	import DigitInputGroup from '../base/DigitInputGroup.svelte';
	import { debugMode as t } from '$lib/i18n-debug';
	const dispatch = createEventDispatcher();

	export let value = {
		name: '',
		relationship: '',
		phone: '',
		email: '',
		notes: ''
	};
	export let error = null;
	export let loading = false;
	export let success = false;
	export let required = false;
	export let includeEmail = false;
	export let isValid = false;

	let isValid1 = false;
	let isValid2 = false;
	let isValid3 = false;
	let isValid4 = false;

	// Track raw digit input (without formatting)
	let phoneDigits = '';

	// Field-level validation errors
	let fieldErrors = {
		name: null,
		relationship: null,
		phone: null,
		email: null,
		notes: null
	};

	// Validation patterns
	const phonePattern = /^\d{10}$/;
	const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
	const namePattern = /^[a-zA-Z\s'-]+$/;

	// Format a 10-digit number as XXX-XXX-XXXX
	function formatPhoneNumber(digits) {
		if (!digits) return '';

		// Remove any non-digit characters
		const numbersOnly = digits.replace(/\D/g, '');

		if (numbersOnly.length < 4) {
			return numbersOnly;
		} else if (numbersOnly.length < 7) {
			return `${numbersOnly.slice(0, 3)}-${numbersOnly.slice(3)}`;
		} else {
			return `${numbersOnly.slice(0, 3)}-${numbersOnly.slice(3, 6)}-${numbersOnly.slice(6, 10)}`;
		}
	}

	// Remove formatting and get raw digits
	function getDigitsOnly(formattedNumber) {
		return formattedNumber?.replace(/\D/g, '') || '';
	}

	// Initialize value with defaults
	$: {
		value = {
			name: value?.name || '',
			relationship: value?.relationship || '',
			phone: value?.phone || '',
			email: value?.email || '',
			notes: value?.notes || ''
		};

		// Extract digits from existing phone value if present
		phoneDigits = getDigitsOnly(value.phone);
	}

	// Update phone when digit input changes
	function updatePhone(event) {
		phoneDigits = event.detail.value;

		// Format the phone number (XXX-XXX-XXXX) and store in the value object
		value = {
			...value,
			phone: formatPhoneNumber(phoneDigits)
		};
	}

	// Check if all required fields are valid
	$: {
		if (required) {
			if (includeEmail) {
				isValid = isValid1 && isValid2 && isValid3 && isValid4;
			} else {
				isValid = isValid1 && isValid2 && isValid3;
			}
		} else {
			isValid = true;
		}
	}
</script>

<div class="flex flex-col space-y-4 max-w-2xl">
	<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
		<TextInput
			label={$t('Questionnaire.Fields.Contact.name_label')}
			placeholder={$t('Questionnaire.Fields.Contact.name_placeholder')}
			bind:value={value.name}
			error={fieldErrors.name}
			bind:isValid={isValid1}
			{loading}
			{success}
			{required}
			pattern={namePattern}
			patternError={$t('Questionnaire.Fields.Contact.name_validation_error')}
		/>

		<TextInput
			label={$t('Questionnaire.Fields.Contact.relationship_label')}
			placeholder={$t('Questionnaire.Fields.Contact.relationship_placeholder')}
			bind:value={value.relationship}
			error={fieldErrors.relationship}
			bind:isValid={isValid2}
			{loading}
			{success}
			{required}
		/>
	</div>

	<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
		<div class="col-span-2">
			<label class="text-black text-sm font-normal leading-none mb-3 block"
				>{$t('Questionnaire.Fields.Contact.phone_label')}</label
			>
			<div class="flex-1">
				<DigitInputGroup
					bind:value={phoneDigits}
					error={fieldErrors.phone}
					bind:isValid={isValid3}
					on:change={updatePhone}
					{loading}
					{success}
					{required}
					length={10}
				/>
				<div class="text-xs text-gray-500 mt-1">
					{phoneDigits ? formatPhoneNumber(phoneDigits) : 'XXX-XXX-XXXX'}
				</div>
			</div>
		</div>

		{#if includeEmail}
			<TextInput
				label={$t('Questionnaire.Fields.Contact.email_label')}
				placeholder={$t('Questionnaire.Fields.Contact.email_placeholder')}
				bind:value={value.email}
				error={fieldErrors.email}
				bind:isValid={isValid4}
				{loading}
				{success}
				type="email"
				pattern={emailPattern}
				patternError={$t('Questionnaire.Fields.Contact.email_validation_error')}
			/>
		{/if}
	</div>

	<TextInput
		label={$t('Questionnaire.Fields.Contact.notes_label')}
		placeholder={$t('Questionnaire.Fields.Contact.notes_placeholder')}
		bind:value={value.notes}
		error={fieldErrors.notes}
		{loading}
		{success}
	/>

	{#if error}
		<p class="text-red-500 text-sm">{error}</p>
	{/if}
</div>
