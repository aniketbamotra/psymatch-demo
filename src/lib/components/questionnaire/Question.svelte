<script>
	import { createEventDispatcher } from 'svelte';
	import { fade, slide } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	import Button from '../buttons/Button.svelte';
	import {
		selectedAnswer,
		direction,
		isTransitioning,
		responses,
		currentIndex
	} from '$lib/stores/questionStore';

	export let question;
	export let position = 'current'; // 'previous', 'current', or 'next'

	const dispatch = createEventDispatcher();

	function handleOptionSelect(value) {
		if ($isTransitioning) return;

		// Only update selection if no existing response
		const questionIndex = parseInt(question.id.split('q')[1]) - 1;
		const hasExistingAnswer = $responses?.responses?.[questionIndex]?.value;

		if (!hasExistingAnswer) {
			selectedAnswer.set(value);

			// Auto-submit for boolean questions
			if (question.answer_type === 'boolean') {
				setTimeout(() => dispatch('answer', value), 300);
			}
		}
	}

	// Check if option is selected, considering both current selection and existing responses
	$: isSelected = (value) => {
		const questionIndex = parseInt(question.id.split('q')[1]) - 1;
		const existingAnswer = $responses?.responses?.[questionIndex]?.value;
		return existingAnswer ? existingAnswer === value : $selectedAnswer === value;
	};

	// Calculate transition parameters based on position and direction
	$: slideParams = {
		duration: 500,
		easing: quintOut,
		axis: 'x',
		direction: position === 'previous' ? -1 : 1
	};
</script>

<div class="question-container relative {position}" in:slide={slideParams} out:slide={slideParams}>
	<p class="text-[1.5rem] max-w-full mb-14" in:fade={{ duration: 300, delay: 200 }}>
		{question.text}
	</p>

	{#if question.answer_type === 'scale'}
		{#if Array.isArray(question.scale)}
			<div class="space-y-5 flex flex-col">
				{#each question.scale as scaleOption, index}
					{#each Object.entries(scaleOption) as [value, label]}
						{@const selected = isSelected(value)}
						<div in:fade={{ duration: 300, delay: 100 + index * 50 }}>
							<Button
								{label}
								outline={true}
								onClick={() => handleOptionSelect(value)}
								overide="w-[34rem] mx-auto text-xl hover:text-white text-left transition-all duration-300 {selected
									? 'bg-black text-white scale-105'
									: ''}"
							/>
						</div>
					{/each}
				{/each}
			</div>
		{:else}
			<p class="text-red-500">Invalid scale format: expected an array</p>
		{/if}
	{:else if question.answer_type === 'boolean'}
		{#if Array.isArray(question.answer_values)}
			<div class="space-x-5 flex justify-center">
				{#each question.answer_values as option, index}
					{@const selected = isSelected(option)}
					<div in:fade={{ duration: 300, delay: 100 + index * 50 }}>
						<Button
							label={option}
							outline={true}
							onClick={() => handleOptionSelect(option)}
							overide="w-[10rem] text-xl text-left hover:text-white transition-all duration-300 {selected
								? 'bg-Black text-white scale-105'
								: ''}"
						/>
					</div>
				{/each}
			</div>
		{:else}
			<p class="text-red-500">Invalid answer_values format: expected an array</p>
		{/if}
	{:else}
		<p class="text-red-500">Unsupported answer type: {question.answer_type}</p>
	{/if}
</div>

<style>
	.question-container {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		transition: transform 0.5s ease-out;
	}

	.question-container.previous {
		transform: translateX(-100%);
	}

	.question-container.current {
		transform: translateX(0);
	}

	.question-container.next {
		transform: translateX(100%);
	}
</style>
