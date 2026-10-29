<script>
	import { createEventDispatcher } from 'svelte';
	import { getQuestionConfig as getAdultBioConfig } from '../config/adultBioConfig.js';
	import { getQuestionConfig as getTherapistMatchConfig } from '../config/therapistMatchConfig.js';
	import { getQuestionConfig as getSpecialTestConfig } from '../config/specialTestsConfig.js';
	import { TEST_CODES, INPUT_TYPES, SPECIAL_TYPES } from '../config/questionTypes.js';
	import { questionnaireStore } from '$lib/stores/questionnaire.js';
	import Button from '../../buttons/Button.svelte';
	import { TextInput, SelectInput, TextArea, CheckboxInput, CheckboxGroup } from './commons/base';
	import {
		BooleanWithDetails,
		SelectWithDetails,
		DynamicList,
		MultiOptionsInput
	} from './commons/enhanced';
	import {
		NameInput,
		AddressInput,
		DateWithAge,
		ContactInput,
		ChildrenList,
		MedicationList,
		EmailInput,
		PhoneNumberInput,
		CareerInput,
		HeaderInput,
		SocialInteractionsInput,
		CaregiverInfoInput,
		ReligionInput,
		HeightWeightInput
	} from './commons/compound';
	import { debugMode as t } from '$lib/i18n-debug';
	const dispatch = createEventDispatcher();

	export let type = INPUT_TYPES.TEXT;
	export let value = null;

	// Initialize value based on type
	$: {
		if (value === null) {
			if (type === INPUT_TYPES.CHECKBOX_GROUP) {
				value = [];
			} else {
				value = '';
			}
		}
	}
	export let label = '';
	export let placeholder = '';
	export let error = null;
	export let options = [];
	export let fields = [];
	export let scale = undefined;
	export let optionSets = [];
	export let conditional = null;
	export let required = false;
	export let questionNumber;
	export let currentQuestion;
	export let Input = null;
	export let loading = false;
	export let success = false;

	let enable = false;
	// Button state variables
	let isSubmitting = false; // For loading state
	let isSuccess = false; // For success state
	let isComplete = false; // For completion state
	// Parse value if it's a JSON string
	$: {
		if (typeof value === 'string' && value.trim()) {
			try {
				const parsed = JSON.parse(value);
				if (parsed !== null && typeof parsed === 'object') {
					value = parsed;
				}
			} catch (e) {
				// Keep original value if parsing fails
			}
		}
	}
	// Track questionnaire type
	$: isAdultBio = $questionnaireStore.currentQuestionnaire?.test_code === TEST_CODES.ADULT_BIO;
	$: isTherapistMatch =
		$questionnaireStore.currentQuestionnaire?.test_code === TEST_CODES.THERAPIST_MATCH;
	$: isSpecificPhobia =
		$questionnaireStore.currentQuestionnaire?.test_code === 'specific_phobia_test';
	$: isAnorexia = $questionnaireStore.currentQuestionnaire?.test_code === 'anorexia_test';

	// Get configuration based on questionnaire type
	$: if (currentQuestion?.id) {
		if (isAdultBio) {
			const config = getAdultBioConfig(currentQuestion.id);
			if (config) {
				type = config.input_type;
				options = config.options || [];
				fields = config.fields || [];
				scale = config.scale;
				placeholder = config.placeholder || '';
				conditional = config.conditional;
				required = config.required !== false; // Default to true for Adult Bio
			}
		} else if (isTherapistMatch) {
			const config = getTherapistMatchConfig(currentQuestion.id);
			if (config) {
				type = config.input_type;
				options = config.options || [];
				fields = config.fields || [];
				optionSets = config.optionSets || [];
				required = true;
			}
		} else if (isSpecificPhobia || isAnorexia) {
			const testCode = $questionnaireStore.currentQuestionnaire?.test_code;
			const config = getSpecialTestConfig(testCode, currentQuestion.id);
			if (config) {
				type = config.input_type;
				options = config.options || [];
				fields = config.fields || [];
				scale = config.scale;
				placeholder = config.placeholder || '';
				conditional = config.conditional;
				required = config.required !== false;
			}
		}
	}

	// Track if input is non-option based (text, textarea, number, etc.)
	$: isNonOptionInput =
		type === INPUT_TYPES.TEXT ||
		type === INPUT_TYPES.TEXTAREA ||
		type === INPUT_TYPES.NUMBER ||
		type === INPUT_TYPES.CHECKBOX ||
		type === INPUT_TYPES.CHECKBOX_GROUP ||
		type === SPECIAL_TYPES.NAME ||
		type === SPECIAL_TYPES.ADDRESS ||
		type === SPECIAL_TYPES.CONTACTS ||
		type === SPECIAL_TYPES.CHILDREN_LIST ||
		type === SPECIAL_TYPES.DATE_WITH_AGE ||
		type === INPUT_TYPES.BOOLEAN ||
		type === SPECIAL_TYPES.BOOLEAN_WITH_DETAILS ||
		type === SPECIAL_TYPES.MEDICATION_LIST ||
		type === SPECIAL_TYPES.EMAIL ||
		type === SPECIAL_TYPES.PHONENUMBER ||
		type === SPECIAL_TYPES.CAREER ||
		type === SPECIAL_TYPES.HEADER ||
		type === SPECIAL_TYPES.SOCIAL_INTERACTIONS ||
		type === SPECIAL_TYPES.CAREGIVER_INFO ||
		type === SPECIAL_TYPES.RELIGION ||
		type === 'bmi_calculator';

	let isValid = false;

	// Handle input from any component
	function handleInput({ detail }) {
		// Capture the complete value from the component
		const newValue = detail;
		isSubmitting = true;
		// Update our value with the received value
		value = newValue;

		console.log('SpecialInput received value:', {
			detail,
			newValue,
			type,
			isBoolean: type === INPUT_TYPES.BOOLEAN || type === SPECIAL_TYPES.BOOLEAN_WITH_DETAILS
		});

		// Keep track of changes but don't dispatch
		if (isNonOptionInput) {
			// For non-option inputs, wait for submit button
			return;
		}

		// For option inputs, dispatch immediately
		const stringValue = typeof newValue === 'object' ? JSON.stringify(newValue) : newValue;
		console.log('SpecialInput dispatching:', stringValue);
		Input = stringValue;
		dispatch('submit');
		setTimeout(() => {
			isSubmitting = false;
			isSuccess = true;

			// After success state, move to completion state
			setTimeout(() => {
				isSuccess = false;
				isComplete = true;

				// Reset to initial state after completion
				setTimeout(() => {
					isComplete = false;
				}, 1500);
			}, 1000);
		}, 1500);
	}

	// Handle conditional input
	function handleConditional({ detail }) {
		dispatch('conditional', detail);
	}

	// Handle submit button click
	function handleSubmit() {
		if (isValid && !isSubmitting) {
			isSubmitting = true;

			// BooleanWithDetails special case
			if (type === SPECIAL_TYPES.BOOLEAN_WITH_DETAILS && value && typeof value === 'object') {
				// Ensure we're sending a properly structured object for BooleanWithDetails
				console.log('SpecialInput submitting BooleanWithDetails:', value);
			}

			// Convert value to string if it's an object
			const stringValue = typeof value === 'object' ? JSON.stringify(value) : value;
			console.log('SpecialInput submitting:', { value, stringValue });
			Input = stringValue;

			// Dispatch submit event
			dispatch('submit');

			// After dispatching, simulate a successful submission
			setTimeout(() => {
				isSubmitting = false;
				isSuccess = true;

				// After success state, move to completion state
				setTimeout(() => {
					isSuccess = false;
					isComplete = true;

					// Reset to initial state after completion
					setTimeout(() => {
						isComplete = false;
					}, 1500);
				}, 1000);
			}, 1500);
		} else {
			console.log('Form not valid, cannot submit', { isValid, value });
		}
	}
</script>

<div
	class="flex flex-col space-y-4 w-full {isAdultBio || isTherapistMatch
		? 'max-w-[100rem]'
		: 'max-w-[34rem]'} mx-auto"
>
	<!-- Base Input Types -->
	{#if type === INPUT_TYPES.CHECKBOX_GROUP}
		<CheckboxGroup
			bind:value
			{label}
			{error}
			{required}
			bind:isValid
			{loading}
			{success}
			{options}
		/>
	{:else if type === INPUT_TYPES.CHECKBOX}
		<CheckboxInput bind:value {label} {error} {required} bind:isValid {loading} {success} />
	{:else if type === INPUT_TYPES.TEXT}
		<TextInput
			bind:value
			{label}
			placeholder={placeholder ? $t(placeholder) : ''}
			{error}
			{required}
			bind:isValid
		/>
	{:else if type === INPUT_TYPES.NUMBER}
		<TextInput
			bind:value
			{label}
			placeholder={placeholder ? $t(placeholder) : ''}
			{error}
			{required}
			bind:isValid
			type="number"
			min={scale?.min}
			max={scale?.max}
		/>
	{:else if type === INPUT_TYPES.TEXTAREA}
		<TextArea
			bind:value
			{label}
			placeholder={placeholder ? $t(placeholder) : ''}
			{error}
			{required}
			bind:isValid
		/>
	{:else if type === INPUT_TYPES.SELECT}
		<SelectInput
			bind:value
			{label}
			{options}
			{scale}
			{error}
			{required}
			bind:isValid
			loading={isSubmitting}
			success={isSuccess || isComplete}
			on:submit={handleInput}
		/>

		<!-- Enhanced Input Types -->
	{:else if type === INPUT_TYPES.BOOLEAN || type === SPECIAL_TYPES.BOOLEAN_WITH_DETAILS}
		<BooleanWithDetails
			bind:value
			{error}
			{conditional}
			{required}
			{questionNumber}
			bind:isValid
			on:conditional={handleConditional}
		/>
	{:else if type === INPUT_TYPES.SCALE}
		<SelectWithDetails
			bind:value
			{label}
			{options}
			{scale}
			{error}
			{conditional}
			{required}
			loading={isSubmitting}
			success={isSuccess || isComplete}
			on:submit={handleInput}
			on:conditional={handleConditional}
		/>

		<!-- Compound Input Types -->
	{:else if type === SPECIAL_TYPES.NAME}
		<NameInput bind:value {error} {required} bind:isValid includeMiddleName={false} />
	{:else if type === SPECIAL_TYPES.ADDRESS}
		<AddressInput bind:value {error} {required} bind:isValid international={false} />
	{:else if type === SPECIAL_TYPES.DATE_WITH_AGE}
		<DateWithAge
			bind:value
			{error}
			{required}
			bind:isValid
			allowAgeOverride={false}
			on:submit={handleInput}
		/>
	{:else if type === SPECIAL_TYPES.CONTACTS}
		<ContactInput bind:value {error} {required} bind:isValid includeEmail={false} />
	{:else if type === SPECIAL_TYPES.CHILDREN_LIST}
		<ChildrenList bind:value {error} {required} bind:isValid includeDetails={false} />
	{:else if type === SPECIAL_TYPES.MEDICATION_LIST}
		<MedicationList
			bind:value
			{error}
			{required}
			bind:isValid
			includeDoctor={true}
			includeNotes={true}
		/>
	{:else if type === SPECIAL_TYPES.EMAIL}
		<EmailInput bind:value {error} {required} bind:isValid />
	{:else if type === SPECIAL_TYPES.PHONENUMBER}
		<PhoneNumberInput bind:value {error} {required} bind:isValid />
	{:else if type === SPECIAL_TYPES.CAREER}
		<CareerInput bind:value {error} {required} bind:isValid />
	{:else if type === SPECIAL_TYPES.HEADER}
		<HeaderInput bind:value {error} {required} bind:isValid text={currentQuestion.text} />
	{:else if type === SPECIAL_TYPES.SOCIAL_INTERACTIONS}
		<SocialInteractionsInput bind:value {error} {required} bind:isValid />
	{:else if type === SPECIAL_TYPES.CAREGIVER_INFO}
		<CaregiverInfoInput bind:value {error} {required} bind:isValid />
	{:else if type === SPECIAL_TYPES.RELIGION}
		<ReligionInput bind:value {error} {required} bind:isValid {options} />
	{:else if type === SPECIAL_TYPES.MULTI_OPTIONS}
		<MultiOptionsInput
			bind:value
			{optionSets}
			{error}
			{required}
			bind:isValid
			on:submit={handleInput}
		/>
	{:else if type === 'bmi_calculator'}
		<HeightWeightInput bind:value {error} {required} {fields} bind:isValid />
	{/if}
	{#if isNonOptionInput}
		<div class="mt-4 self-end">
			<Button
				label={type === SPECIAL_TYPES.HEADER
					? $t('Questionnaire.Button.continue')
					: $t('Questionnaire.Button.submit')}
				disabled={!isValid || isSubmitting || isSuccess || isComplete}
				onClick={handleSubmit}
				size="large"
				loading={isSubmitting}
				loadingText={$t('Questionnaire.Button.submitting')}
				success={isSuccess || isComplete}
				successText={$t('Questionnaire.Button.saved')}
			/>
		</div>
	{:else if isSubmitting}
		<div class=" right-3 top-1/2 -translate-y-1/2 flex items-center">
			<svg
				class="animate-spin"
				width="20"
				height="20"
				viewBox="0 0 24 24"
				fill="none"
				stroke="#005B41"
				stroke-width="3"
			>
				<path
					class="opacity-25"
					d="M12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2Z"
				/>
				<path
					class="opacity-75 animate-trim"
					d="M12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2Z"
					stroke-dasharray="60"
					stroke-linecap="round"
				/>
			</svg>
		</div>
	{:else if isSuccess || isComplete}
		<div class=" right-3 top-1/2 -translate-y-1/2 flex items-center">
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#005B41" stroke-width="3">
				<path
					class="animate-check"
					d="M20 6L9 17L4 12"
					stroke-dasharray="30"
					stroke-dashoffset="30"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
		</div>
	{/if}
</div>

<style>
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@keyframes trim {
		0% {
			stroke-dashoffset: 60;
		}
		50% {
			stroke-dashoffset: 30;
		}
		100% {
			stroke-dashoffset: 60;
		}
	}

	@keyframes check {
		to {
			stroke-dashoffset: 0;
		}
	}

	.animate-spin {
		animation: spin 1s linear infinite;
	}

	.animate-trim {
		animation: trim 1.5s ease-in-out infinite;
	}

	.animate-check {
		animation: check 0.5s ease-in-out forwards;
	}
</style>
