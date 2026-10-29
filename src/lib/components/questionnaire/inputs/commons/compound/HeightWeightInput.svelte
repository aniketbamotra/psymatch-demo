<script>
	import { createEventDispatcher, onMount } from 'svelte';
	import { TextInput } from '../../commons/base';
	import SelectInput from '../../commons/base/SelectInput.svelte';
	import { debugMode as t } from '$lib/i18n-debug';

	export let value = {
		weight: '',
		weightUnit: 'kg',
		height: '',
		heightUnit: 'cm',
		feet: '',
		inches: '',
		standardWeight: 0,
		standardHeight: 0,
		bmi: 0
	};
	export let error = null;
	export let required = false;
	export let fields = [];

	const dispatch = createEventDispatcher();
	export let isValid = false;

	// Initialize value with defaults or existing values
	value = {
		weight: value?.weight || '',
		weightUnit: value?.weightUnit || 'lbs',
		height: value?.height || '',
		heightUnit: value?.heightUnit || 'ft',
		feet: value?.feet || '',
		inches: value?.inches || '',
		standardWeight: value?.standardWeight || 0,
		standardHeight: value?.standardHeight || 0,
		bmi: value?.bmi || 0
	};

	// Update the value whenever any input changes
	function updateValue() {
		console.log('Updating value:', value);
		// Convert to standard units (kg and meters) for BMI calculation
		let weightInKg = parseFloat(value.weight);
		let heightInMeters;
		value.weight = weightInKg || '';
		// For feet/inches, combine them into a single value
		if (value.heightUnit === 'ft') {
			// Convert feet and inches to meters
			const feet = parseFloat(value.feet) || 0;
			const inches = parseFloat(value.inches) || 0;

			// Total height in inches (1 foot = 12 inches)
			const totalInches = feet * 12 + inches;

			// Convert inches to meters (1 inch = 0.0254 meters)
			heightInMeters = totalInches * 0.0254;

			// Store the height in the main height field as well (for compatibility)
			value.height = feet + inches / 12;
		} else {
			// For cm, use the regular height field
			heightInMeters = parseFloat(value.height);

			if (value.heightUnit === 'cm' && !isNaN(heightInMeters)) {
				heightInMeters = heightInMeters / 100; // Convert cm to meters
			}
		}

		if (!isNaN(weightInKg) && !isNaN(heightInMeters) && weightInKg > 0 && heightInMeters > 0) {
			if (value.weightUnit === 'lbs') {
				weightInKg = weightInKg * 0.453592; // Convert lbs to kg
			}

			// Calculate BMI
			const bmi = weightInKg / (heightInMeters * heightInMeters);

			// Update standard values and BMI
			value.standardWeight = weightInKg;
			value.standardHeight = heightInMeters;
			value.bmi = parseFloat(bmi.toFixed(2)); // Round to 2 decimal places
		}

		validateForm();
	}

	function validateForm() {
		console.log('Validating form:', value);
		if (value.heightUnit === 'ft') {
			// For feet/inches: weight and feet are required and must be > 0
			// inches field is optional and can be 0 or empty
			const hasWeight = value.weight && parseFloat(value.weight) > 0;
			const hasFeet = value.feet && parseFloat(value.feet) > 0;
			console.log('hasWeight:', hasWeight, 'hasFeet:', hasFeet);
			isValid = hasWeight && hasFeet;
		} else {
			// For cm: weight and height are required and must be > 0
			console.log('weight:', value.weight, 'height:', value.height);
			isValid =
				value.weight &&
				value.height &&
				parseFloat(value.weight) > 0 &&
				parseFloat(value.height) > 0;
		}
		dispatch('validate', isValid);
	}

	// // Add reactive statements to revalidate whenever relevant values change
	// $: if (value.heightUnit === 'ft') {
	// 	// For imperial units, watch weight, feet values
	// 	if (value.weight || value.feet) {
	// 		validateForm();
	// 	}
	// } else {
	// 	// For metric units, watch weight, height values
	// 	if (value.weight || value.height) {
	// 		validateForm();
	// 	}
	// }

	// Also watch unit changes to trigger validation
	$: if (value.heightUnit || value.weightUnit) {
		validateForm();
	}

	// Run validation when the component is first mounted
	onMount(() => {
		validateForm();
	});

	function handleWeightChange(e) {
		value.weight = e.target.value;
		updateValue();
	}

	function handleHeightChange(e) {
		value.height = e.target.value;
		updateValue();
	}

	function handleFeetChange(e) {
		value.feet = e.target.value;
		updateValue();
	}

	function handleInchesChange(e) {
		value.inches = e.target.value;
		updateValue();
	}

	function handleWeightUnitChange(e) {
		value.weightUnit = e.detail;
		updateValue();
	}
	$: if (value) {
		updateValue();
	}
	function handleHeightUnitChange(e) {
		value.heightUnit = e.detail;
		// Reset height values when switching units
		if (e.detail === 'ft') {
			if (value.height && !isNaN(parseFloat(value.height))) {
				// Convert cm to feet and inches if we're switching from cm
				if (value.heightUnit === 'cm') {
					const heightInMeters = parseFloat(value.height) / 100;
					const heightInInches = heightInMeters * 39.3701;
					value.feet = Math.floor(heightInInches / 12).toString();
					value.inches = Math.round(heightInInches % 12).toString();
				} else {
					// Parse decimal feet (e.g. 5.8) into feet and inches
					const heightVal = parseFloat(value.height);
					const wholeFeet = Math.floor(heightVal);
					const fracInches = Math.round((heightVal - wholeFeet) * 12);
					value.feet = wholeFeet.toString();
					value.inches = fracInches.toString();
				}
			}
			value.height = '';
		} else {
			// Convert feet and inches to cm if we're switching to cm
			if (value.heightUnit === 'ft' && value.feet) {
				const feet = parseFloat(value.feet) || 0;
				const inches = parseFloat(value.inches) || 0;
				const totalInches = feet * 12 + inches;
				value.height = Math.round(totalInches * 2.54).toString(); // Convert to cm
			}
			value.feet = '';
			value.inches = '';
		}
		updateValue();
	}
</script>

<div class="flex flex-col space-y-4 w-full">
	<div class="text-sm font-medium mb-2">{$t('Questionnaire.Fields.HeightWeight.header')}</div>

	<div class="grid grid-cols-3 gap-4">
		<div class="col-span-2">
			<TextInput
				label={$t('Questionnaire.Fields.HeightWeight.weight_label')}
				bind:value={value.weight}
				placeholder={$t('Questionnaire.Fields.HeightWeight.weight_placeholder')}
				{error}
				{required}
				type="number"
				min="1"
				on:input={handleWeightChange}
			/>
		</div>
		<div class="col-span-1">
			<SelectInput
				label={$t('Questionnaire.Fields.HeightWeight.unit_label')}
				value={value.weightUnit}
				options={['kg', 'lbs']}
				{error}
				{required}
				on:submit={handleWeightUnitChange}
			/>
		</div>
	</div>

	{#if value.heightUnit === 'ft'}
		<div class="grid grid-cols-3 gap-4">
			<div class="col-span-1">
				<TextInput
					label={$t('Questionnaire.Fields.HeightWeight.feet_label')}
					bind:value={value.feet}
					placeholder={$t('Questionnaire.Fields.HeightWeight.feet_placeholder')}
					{error}
					{required}
					type="number"
					min="1"
					max="9"
					on:input={handleFeetChange}
				/>
			</div>
			<div class="col-span-1">
				<TextInput
					label={$t('Questionnaire.Fields.HeightWeight.inches_label')}
					bind:value={value.inches}
					placeholder={$t('Questionnaire.Fields.HeightWeight.inches_placeholder')}
					{error}
					{required}
					type="number"
					min="0"
					max="11"
					on:input={handleInchesChange}
				/>
			</div>
			<div class="col-span-1">
				<SelectInput
					label={$t('Questionnaire.Fields.HeightWeight.unit_label')}
					value={value.heightUnit}
					options={['cm', 'ft']}
					{error}
					{required}
					on:submit={handleHeightUnitChange}
				/>
			</div>
		</div>
	{:else}
		<div class="grid grid-cols-3 gap-4">
			<div class="col-span-2">
				<TextInput
					label={$t('Questionnaire.Fields.HeightWeight.height_label')}
					bind:value={value.height}
					placeholder={$t('Questionnaire.Fields.HeightWeight.height_placeholder')}
					{error}
					{required}
					type="number"
					min="1"
					on:input={handleHeightChange}
				/>
			</div>
			<div class="col-span-1">
				<SelectInput
					label={$t('Questionnaire.Fields.Commons.unit')}
					value={value.heightUnit}
					options={['cm', 'ft']}
					{error}
					{required}
					on:submit={handleHeightUnitChange}
				/>
			</div>
		</div>
	{/if}
</div>
