<script>
	import Button from '../buttons/Button.svelte';
	import SpecialInput from './inputs/SpecialInput.svelte';
	import { debugMode as t } from '$lib/i18n-debug';

	export let question;
	export let currentQuestionNumber;
	export let totalQuestions;
	export let selectedValue;
	export let loadingOption;
	export let successOption;
	export let error;
	export let isSelected;
	export let onOptionSelect;
	let Input;

	$: console.log('Questionnaire Form:', {
		question,
		currentQuestionNumber,
		totalQuestions,
		selectedValue,
		loadingOption,
		successOption,
		error,
		isSelected,
		onOptionSelect
	});

	// Track conditional values for each question
	let conditionalValues = {};

	function handleSpecialInput(event) {
		console.log('Special input event:', Input);
		onOptionSelect(Input);
	}

	function handleConditionalInput(event) {
		conditionalValues = {
			...conditionalValues,
			[currentQuestionNumber]: event.detail
		};
		// Combine main value with conditional values
		const combinedValue = {
			value: selectedValue,
			conditional: JSON.parse(event.detail)
		};
		onOptionSelect(JSON.stringify(combinedValue));
	}
</script>

<div class="w-full lg:w-[100dvw] mx-auto lg:h-full rounded-lg mt-[5rem] px-[1.5rem] lg:px-0">
	<div class="lg:h-full flex flex-col justify-between pb-10 max-w-[60rem] mx-auto">
		<div class="lg:max-w-full">
			{#if question.description_for_subsequent_question}
				<p class="text-[1rem] lg:text-[1.25rem] max-w-full italic mb-4 lg:mb-8">
					{question.description_for_subsequent_question
						? currentQuestionNumber + '. '
						: ''}{question.description_for_subsequent_question}
				</p>
			{/if}
			<p class="text-[1.25rem] lg:text-[1.5rem] {question.description_for_subsequent_question ? 'text-center' : ''} max-w-full mb-14">
				{!question.description_for_subsequent_question
					? currentQuestionNumber + '. '
					: ''}{question.text}
			</p>

			{#if question.answer_type === 'special'}
				<SpecialInput
					type={question.input_type}
					value={selectedValue}
					options={question.options}
					fields={question.fields}
					conditional={question.conditional}
					{error}
					questionNumber={currentQuestionNumber}
					currentQuestion={question}
					bind:Input
					on:submit={handleSpecialInput}
					on:conditional={handleConditionalInput}
					conditionalValues={selectedValue?.conditional || {}}
				/>
			{:else if question.answer_type === 'scale'}
				{#if Array.isArray(question.scale)}
					<div class="space-y-5 flex flex-col">
						{#each question.scale as scaleOption}
							{#each Object.entries(scaleOption) as [value, label]}
								{@const selected = isSelected(value)}

								<Button
									label={$t(label)}
									outline={true}
									pressed={selected}
									onClick={() => onOptionSelect(value)}
									loading={loadingOption === value}
									loadingText={$t(label)}
									successText={$t(label)}
									successClass="bg-Success"
									success={successOption === value}
									overide="lg:w-[34rem] w-[90%] mx-auto text-md lg:text-xl hover:text-white text-left"
								/>
							{/each}
						{/each}
					</div>
				{:else}
					<p class="text-red-500">Invalid scale format: expected an array</p>
				{/if}
			{:else if question.answer_type === 'boolean'}
				{#if Array.isArray(question.scale)}
					<div class="space-x-5 flex justify-center">
						{#each question.scale as scaleOption}
							{#each Object.entries(scaleOption) as [value, label]}
								{@const selected = isSelected(value)}
								<Button
									label={loadingOption === value ? 'Saving...' : $t(label)}
									outline={true}
									pressed={selected}
									onClick={() => onOptionSelect(value)}
									loading={loadingOption === value}
									loadingText={$t(label)}
									successText={$t(label)}
									successClass="bg-Success"
									success={successOption === value}
									overide="w-[10rem] text-xl text-left hover:text-white "
								/>
							{/each}
						{/each}
					</div>
				{:else}
					<p class="text-red-500">Invalid answer_values format: expected an array</p>
				{/if}
			{:else}
				<p class="text-red-500">Unsupported answer type: {question.answer_type}</p>
			{/if}

			{#if error}
				<p class="text-red-500 mt-4">{error}</p>
			{/if}
		</div>
	</div>
</div>
