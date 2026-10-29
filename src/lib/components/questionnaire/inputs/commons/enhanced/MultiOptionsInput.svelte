<script>
	import { createEventDispatcher } from 'svelte';
	import { debugMode as t } from '$lib/i18n-debug';
	const dispatch = createEventDispatcher();

	export let value = { preference: '', importance: '' };
	export let optionSets = [];
	export let error = null;
	export let required = false;
	export let isValid = false;

	// Local state to prevent value loss
	let preference = value.preference || '';
	let importance = value.importance || '';

	// Update local state when value changes from outside
	$: {
		if (value.preference !== preference && value.preference) {
			preference = value.preference;
		}
		if (value.importance !== importance && value.importance) {
			importance = value.importance;
		}
	}

	$: isValid = value.preference && value.importance;

	function handlePreferenceChange(event) {
		preference = event.target.value;
		const newValue = {
			importance: value.importance,
			preference: preference
		};
		value = newValue;
		checkAndDispatch(newValue);
	}

	function handleImportanceChange(event) {
		importance = event.target.value;
		const newValue = {
			preference: value.preference,
			importance: importance
		};
		value = newValue;
		checkAndDispatch(newValue);
	}

	function checkAndDispatch(newValue) {
		// Only dispatch if both values are selected
		if (newValue.preference && newValue.importance) {
			dispatch('submit', newValue);
		}
	}
</script>

<div class="flex flex-col">
	<div class="flex items-center gap-4 flex-wrap">
		<div class="relative">
			<select
				class="block w-60 rounded-md border border-gray-300 bg-gray-200 px-4 py-2 text-gray-900 shadow-sm focus:border-Success focus:outline-none"
				bind:value={preference}
				on:change={handlePreferenceChange}
			>
				<option value="" disabled selected>{$t(optionSets[0]?.label || 'Preference')}</option>
				{#each optionSets[0]?.options || [] as option}
					<option value={typeof option === 'object' ? option.value : option}>
						{typeof option === 'object' ? $t(option.label) : option}
					</option>
				{/each}
			</select>
		</div>

		<div class="text-gray-700 whitespace-nowrap">
			{$t('Questionnaire.Config.TherapistMatch.connector_which_is')}
		</div>

		<div class="relative">
			<select
				class="block w-60 rounded-md border border-gray-300 bg-gray-200 px-4 py-2 text-gray-900 shadow-sm focus:border-Success focus:outline-none"
				bind:value={importance}
				on:change={handleImportanceChange}
			>
				<option value="" disabled selected>{$t(optionSets[1]?.label || 'Importance')}</option>
				{#each optionSets[1]?.options || [] as option}
					<option value={typeof option === 'object' ? option.value : option}>
						{typeof option === 'object' ? $t(option.label) : option}
					</option>
				{/each}
			</select>
		</div>

		<div class="text-gray-700 whitespace-nowrap">
			{$t('Questionnaire.Config.TherapistMatch.connector_to_me')}
		</div>
	</div>

	{#if required && (!value.preference || !value.importance)}
		<div class="text-gray-600 mt-2">
			{$t('Questionnaire.Config.TherapistMatch.both_required_message')}
		</div>
	{/if}

	{#if error}
		<div class="text-sm text-red-500 mt-1">{error}</div>
	{/if}
</div>

<style>
	select {
		appearance: none;
		background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236B7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3E%3C/svg%3E");
		background-position: right 0.5rem center;
		background-repeat: no-repeat;
		background-size: 1.5em 1.5em;
		padding-right: 2.5rem;
	}
</style>
