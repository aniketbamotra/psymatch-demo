<script>
	import { createEventDispatcher } from 'svelte';
	import { DynamicList } from '../enhanced';
	import { SelectInput, TextInput } from '../base';
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
	export let includeDetails = false;
	export let isValid = false;

	// Name validation pattern
	const namePattern = /^[a-zA-Z\s'-]+$/;

	// Define fields for children list
	$: fields = [
		{
			id: 'name',
			label: $t('Questionnaire.Fields.Children.name_label'),
			type: 'text',
			placeholder: $t('Questionnaire.Fields.Children.name_placeholder'),
			required,
			pattern: namePattern,
			patternError: $t('Questionnaire.Fields.Children.name_validation_error')
		},
		{
			id: 'gender',
			label: $t('Questionnaire.Fields.Children.gender_label'),
			type: 'select',
			placeholder: $t('Questionnaire.Fields.Children.gender_placeholder'),
			options: [
				{ value: 'Male', label: 'Questionnaire.Fields.Children.gender_options.male' },
				{ value: 'Female', label: 'Questionnaire.Fields.Children.gender_options.female' },
				{ value: 'Non-binary', label: 'Questionnaire.Fields.Children.gender_options.non_binary' },
				{
					value: 'Prefer not to say',
					label: 'Questionnaire.Fields.Children.gender_options.prefer_not_to_say'
				}
			],
			required
		},
		{
			id: 'age',
			label: $t('Questionnaire.Fields.Children.age_label'),
			type: 'number',
			placeholder: $t('Questionnaire.Fields.Children.age_placeholder'),
			required,
			min: 0,
			max: 100, // Reasonable max age for children
			patternError: $t('Questionnaire.Fields.Children.age_validation_error')
		},
		...(includeDetails
			? [
					{
						id: 'details',
						label: $t('Questionnaire.Fields.Children.details_label'),
						type: 'text',
						placeholder: $t('Questionnaire.Fields.Children.details_placeholder')
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
	variant="children"
	removeButtonStyle="icon"
	layoutDirection="horizontal"
	addLabel={$t('Questionnaire.Fields.Children.add_button')}
	minItems={0}
	noItemsMessage={$t('Questionnaire.Fields.Children.no_items_message')}
/>
