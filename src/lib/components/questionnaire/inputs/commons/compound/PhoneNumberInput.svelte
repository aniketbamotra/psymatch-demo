<script>
	import { createEventDispatcher } from 'svelte';
	import { CountryCodeSelector } from '../base';
	import DigitInputGroup from '../base/DigitInputGroup.svelte';
	import { debugMode as t } from '$lib/i18n-debug';
	const dispatch = createEventDispatcher();

	export let value = {
		primaryPhone: '',
		primaryPhoneCountryCode: '+1', // Default to Canada
		otherPhone: '',
		otherPhoneCountryCode: '+1' // Default to Canada
	};
	export let error = null;
	export let loading = false;
	export let success = false;
	export let required = false;
	export let isValid = false;

	let isValidPrimary = false;
	let isValidOther = true; // Optional field starts as valid
	let isValidPrimaryCountryCode = true; // Default to valid with Canada selected
	let isValidOtherCountryCode = true; // Default to valid with Canada selected

	// Track raw digit input (without formatting)
	let primaryDigits = '';
	let otherDigits = '';

	// Field-level validation errors
	let fieldErrors = {
		primaryPhone: null,
		otherPhone: null
	};

	// Phone number validation pattern (10 digits for mobile numbers)
	const phonePattern = /^\d{10}$/;

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

	// Initialize values and handle existing data
	$: {
		if (value) {
			// Extract digits from existing values if present
			primaryDigits = value?.primaryPhone ? getDigitsOnly(value.primaryPhone) : '';
			otherDigits = value?.otherPhone ? getDigitsOnly(value.otherPhone) : '';

			// Set defaults for country codes
			value = {
				...value,
				primaryPhoneCountryCode: value?.primaryPhoneCountryCode || '+1',
				otherPhoneCountryCode: value?.otherPhoneCountryCode || '+1'
			};
		}
	}

	// Update country code when changed
	function updatePrimaryCountryCode(event) {
		value.primaryPhoneCountryCode = event.detail.value;
	}

	function updateOtherCountryCode(event) {
		value.otherPhoneCountryCode = event.detail.value;
	}

	// Update phone number when digit input group changes
	function updatePrimaryPhone(event) {
		primaryDigits = event.detail.value;

		// Format the phone number (XXX-XXX-XXXX) and store in the value object
		value = {
			...value,
			primaryPhone: formatPhoneNumber(primaryDigits)
		};
	}

	function updateOtherPhone(event) {
		otherDigits = event.detail.value;

		// Format the phone number (XXX-XXX-XXXX) and store in the value object
		value = {
			...value,
			otherPhone: formatPhoneNumber(otherDigits)
		};
	}

	// Check if all required fields are valid
	$: {
		if (isValidPrimary && isValidPrimaryCountryCode) {
			isValid = true;
		} else {
			isValid = false;
		}
	}

	// Get full phone number with country code
	$: fullPrimaryPhone = value.primaryPhoneCountryCode + value.primaryPhone;
	$: fullOtherPhone = value.otherPhoneCountryCode + value.otherPhone;
</script>

<div class="flex flex-col gap-6 max-w-2xl">
	<div class="order-2">
		<label class="text-black text-sm font-normal leading-none mb-3 block"
			>{$t('Questionnaire.Fields.Phone.other_label')}</label
		>
		<div class="flex flex-col sm:flex-row gap-2">
			<!-- <div style="width: 120px;">
        <CountryCodeSelector 
          bind:value={value.otherPhoneCountryCode} 
          bind:isValid={isValidOtherCountryCode}
          on:change={updateOtherCountryCode}
          {loading}
          {success}
        />
      </div> -->
			<div class="flex-1">
				<DigitInputGroup
					bind:value={otherDigits}
					error={fieldErrors.otherPhone}
					bind:isValid={isValidOther}
					on:change={updateOtherPhone}
					{loading}
					{success}
					length={10}
				/>
				<div class="text-xs text-gray-500 mt-1">
					{otherDigits ? formatPhoneNumber(otherDigits) : 'XXX-XXX-XXXX'}
				</div>
			</div>
		</div>
	</div>

	<div class="order-1">
		<label class="text-black text-sm font-normal leading-none mb-3 block"
			>{$t('Questionnaire.Fields.Phone.primary_label')}</label
		>
		<div class="flex flex-col sm:flex-row gap-2">
			<!-- <div style="width: 120px;">
        <CountryCodeSelector 
          bind:value={value.primaryPhoneCountryCode} 
          bind:isValid={isValidPrimaryCountryCode}
          on:change={updatePrimaryCountryCode}
          {loading}
          {success}
          {required}
        />
      </div> -->
			<div class="flex-1">
				<DigitInputGroup
					bind:value={primaryDigits}
					error={fieldErrors.primaryPhone}
					bind:isValid={isValidPrimary}
					on:change={updatePrimaryPhone}
					{loading}
					{success}
					{required}
					length={10}
				/>
				<div class="text-xs text-gray-500 mt-1">
					{primaryDigits ? formatPhoneNumber(primaryDigits) : 'XXX-XXX-XXXX'}
				</div>
			</div>
		</div>
	</div>
	{#if error}
		<p class="text-red-500 text-sm">{error}</p>
	{/if}
</div>
