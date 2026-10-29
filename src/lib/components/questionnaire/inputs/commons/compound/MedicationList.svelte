<script>
	import { createEventDispatcher } from 'svelte';
	import { DynamicList } from '../enhanced';
	import { TextInput } from '../base';
	import { debugMode as t } from '$lib/i18n-debug';
	const dispatch = createEventDispatcher();

	export let value = null;

	// Initialize value as empty array if null
	value = value || [];
	export let error = null;
	export let loading = false;
	export let success = false;
	export let required = false;
	export let maxItems = undefined;
	export let includeDoctor = false;
	export let includeNotes = false;
	export let isValid = false;

	// Validation patterns
	const dosagePattern = /^\d+(\.\d+)?\s*(mg|g|ml|mcg|IU)$/i;

	// Create reactive frequency options
	$: frequencyPresets = [
		{ value: 'Once daily', label: 'Questionnaire.Fields.Medication.frequency_options.once_daily' },
		{
			value: 'Twice daily',
			label: 'Questionnaire.Fields.Medication.frequency_options.twice_daily'
		},
		{
			value: 'Three times daily',
			label: 'Questionnaire.Fields.Medication.frequency_options.three_times_daily'
		},
		{
			value: 'Four times daily',
			label: 'Questionnaire.Fields.Medication.frequency_options.four_times_daily'
		},
		{
			value: 'Every morning',
			label: 'Questionnaire.Fields.Medication.frequency_options.every_morning'
		},
		{
			value: 'Every evening',
			label: 'Questionnaire.Fields.Medication.frequency_options.every_evening'
		},
		{
			value: 'Before meals',
			label: 'Questionnaire.Fields.Medication.frequency_options.before_meals'
		},
		{
			value: 'After meals',
			label: 'Questionnaire.Fields.Medication.frequency_options.after_meals'
		},
		{ value: 'As needed', label: 'Questionnaire.Fields.Medication.frequency_options.as_needed' },
		{ value: 'Other', label: 'Questionnaire.Fields.Medication.frequency_options.other' }
	];

	// Define fields for medication list
	$: fields = [
		{
			id: 'name',
			label: $t('Questionnaire.Fields.Medication.name_label'),
			type: 'text',
			placeholder: $t('Questionnaire.Fields.Medication.name_placeholder'),
			required
		},
		{
			id: 'type',
			label: $t('Questionnaire.Fields.Medication.type_label'),
			type: 'select',
			placeholder: $t('Questionnaire.Fields.Medication.type_placeholder'),
			options: [
				{
					value: 'Prescription',
					label: 'Questionnaire.Fields.Medication.type_options.prescription'
				},
				{
					value: 'Over-the-counter',
					label: 'Questionnaire.Fields.Medication.type_options.over_the_counter'
				},
				{ value: 'Supplement', label: 'Questionnaire.Fields.Medication.type_options.supplement' },
				{ value: 'Herbal', label: 'Questionnaire.Fields.Medication.type_options.herbal' },
				{ value: 'Other', label: 'Questionnaire.Fields.Medication.type_options.other' }
			],
			required
		},
		{
			id: 'dosage',
			label: $t('Questionnaire.Fields.Medication.dosage_label'),
			type: 'text',
			placeholder: $t('Questionnaire.Fields.Medication.dosage_placeholder'),
			required,
			pattern: dosagePattern,
			patternError: $t('Questionnaire.Fields.Medication.dosage_validation_error')
		},
		{
			id: 'frequency',
			label: $t('Questionnaire.Fields.Medication.frequency_label'),
			type: 'select',
			placeholder: $t('Questionnaire.Fields.Medication.frequency_placeholder'),
			options: frequencyPresets,
			required
		},
		...(includeDoctor
			? [
					{
						id: 'doctor',
						label: $t('Questionnaire.Fields.Medication.doctor_label'),
						type: 'text',
						placeholder: $t('Questionnaire.Fields.Medication.doctor_placeholder')
					}
				]
			: []),
		...(includeNotes
			? [
					{
						id: 'prescripedFor',
						label: $t('Questionnaire.Fields.Medication.prescribed_for_label'),
						type: 'text',
						placeholder: $t('Questionnaire.Fields.Medication.prescribed_for_placeholder')
					}
				]
			: [])
	];
</script>

<DynamicList
	bind:value
	bind:isValid
	{error}
	{loading}
	{success}
	{fields}
	{required}
	{maxItems}
	addLabel={$t('Questionnaire.Fields.Medication.add_button')}
	removeLabel={$t('Questionnaire.Fields.Medication.remove_button')}
	minItems={0}
	noItemsMessage={$t('Questionnaire.Fields.Medication.no_items_message')}
/>
