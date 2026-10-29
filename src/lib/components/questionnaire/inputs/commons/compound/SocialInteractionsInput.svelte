<script>
	import { createEventDispatcher } from 'svelte';
	import { TextArea, TextInput } from '../base';
	import { debugMode as t } from '$lib/i18n-debug';
	const dispatch = createEventDispatcher();

	export let value = {
		mainDescription: '',
		closeFriends: '',
		friendlyAcquaintances: '',
		meetupFrequency: ''
	};
	export let error = null;
	export let loading = false;
	export let success = false;
	export let required = false;
	export let isValid = false;

	let isValidMain = false;
	let isValidCloseFriends = false;
	let isValidAcquaintances = false;
	let isValidFrequency = false;

	// Field-level validation errors
	let fieldErrors = {
		describe: null,
		closeFriends: null,
		friendlyAcquaintances: null,
		meetupFrequency: null
	};

	// Initialize value with defaults
	value = {
		describe: value?.describe || '',
		closeFriends: value?.closeFriends || '',
		friendlyAcquaintances: value?.friendlyAcquaintances || '',
		meetupFrequency: value?.meetupFrequency || ''
	};

	// Check if all required fields are valid
	$: {
		if (required) {
			isValid = isValidMain && isValidCloseFriends && isValidAcquaintances && isValidFrequency;
		} else {
			isValid = true;
		}
	}
</script>

<div class="flex flex-col space-y-6 max-w-2xl">
	<TextArea
		label={$t('Questionnaire.Fields.Social.describe_label')}
		placeholder={$t('Questionnaire.Fields.Social.describe_placeholder')}
		bind:value={value.describe}
		error={fieldErrors.describe}
		bind:isValid={isValidMain}
		{loading}
		{success}
		{required}
	/>

	<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
		<TextInput
			label={$t('Questionnaire.Fields.Social.close_friends_label')}
			placeholder={$t('Questionnaire.Fields.Social.close_friends_placeholder')}
			bind:value={value.closeFriends}
			error={fieldErrors.closeFriends}
			bind:isValid={isValidCloseFriends}
			{loading}
			{success}
			{required}
			type="number"
			min="0"
		/>

		<TextInput
			label={$t('Questionnaire.Fields.Social.mid_friends_label')}
			placeholder={$t('Questionnaire.Fields.Social.mid_friends_placeholder')}
			bind:value={value.friendlyAcquaintances}
			error={fieldErrors.friendlyAcquaintances}
			bind:isValid={isValidAcquaintances}
			{loading}
			{success}
			{required}
			type="number"
			min="0"
		/>
	</div>

	<TextInput
		label={$t('Questionnaire.Fields.Social.frequency_label')}
		placeholder={$t('Questionnaire.Fields.Social.frequency_placeholder')}
		bind:value={value.meetupFrequency}
		error={fieldErrors.meetupFrequency}
		bind:isValid={isValidFrequency}
		{loading}
		{success}
		{required}
	/>

	{#if error}
		<p class="text-red-500 text-sm">{error}</p>
	{/if}
</div>
