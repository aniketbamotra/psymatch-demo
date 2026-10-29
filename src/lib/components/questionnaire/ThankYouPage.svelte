<script>
	import { onMount } from 'svelte';
	import { createEventDispatcher } from 'svelte';
	import Button from '../buttons/Button.svelte';
	import NextQuestionnaireCard from './NextQuestionnaireCard.svelte';
	import ArrowLeft from '../feather/arrow-left.svelte';
	import ThankYouCheck from '../feather/thank-you-check.svelte';
	import { goto } from '$app/navigation';
	import { questionnaireStore } from '$lib/stores/questionnaire';
	import * as api from '$lib/api';
	import Check from '$lib/components/feather/check.svelte';
	import { debugMode as t } from '$lib/i18n-debug';
	import Refresh from '../common/Refresh.svelte';

	export let loadingOption = false;
	export let nextQuestionnaire = null;
	export let title = '';

	let allCompleted = false;
	let loadingButton = false;
	let loadingInitial = true;

	const dispatch = createEventDispatcher();

	function handleClose() {
		dispatch('saveAndExit');
		goto('/patient');
	}

	function handleBack() {
		dispatch('back');
	}

	async function handleStartNext() {
		if (!nextQuestionnaire || loadingButton) return;

		loadingButton = true;
		try {
			const title = nextQuestionnaire.test_name;
			const questionLeft = nextQuestionnaire.questionCurrent - 1; // 0-indexed for store? No, store usually takes 1-indexed or count.
			// In QuestionnaireCard: questionLeft is passed.
			// Let's check QuestionnaireCard logic again.
			// It uses `questionLeft` to set store.
			// And navigates to `questionLeft + 1`.

			// Here `nextQuestionnaire.questionCurrent` is already 1-indexed (next question to answer).
			// So `questionLeft` (completed count) would be `questionCurrent - 1`.

			const currentCount = nextQuestionnaire.questionCurrent - 1;

			// Sanitize title for API calls (use English or string value)
			const titleObj = nextQuestionnaire.test_name;
			const titleParam =
				typeof titleObj === 'object' ? titleObj.en || Object.values(titleObj)[0] : titleObj;

			const response = await fetch(`/api/questionnaires?testName=${titleParam}`);
			if (!response.ok) throw new Error('Failed to fetch questionnaire');
			const questionnaire = await response.json();

			const user = await api.get('/api/user').then((res) => res.json());
			const responsesResponse = await fetch(`/api/questionnaire-results?testName=${titleParam}`);
			if (!responsesResponse.ok) throw new Error('Failed to fetch responses');
			const responses = await responsesResponse.json();

			// Reset store to clear previous test's responses just before setting new data
			questionnaireStore.reset();
			questionnaireStore.setQuestionnaire(questionnaire);
			questionnaireStore.setQuestionLeft(currentCount);

			// Initialize responses array if needed
			if (responses && Array.isArray(responses.responses)) {
				responses.responses.forEach((response, index) => {
					if (response && response.value) {
						questionnaireStore.addResponse(`q${index + 1}`, response.value);
					}
				});
			}

			// Sanitize response sequence
			await questionnaireStore.sanitizeResponseSequence();

			if (nextQuestionnaire.status === 'in_progress') {
				goto(`/patient/${titleParam}/${nextQuestionnaire.questionCurrent}`);
			} else {
				goto(`/patient/${titleParam}/about_the_test/1`);
			}
		} catch (error) {
			console.error('Error loading questionnaire:', error);
		} finally {
			loadingButton = false;
		}
	}

	onMount(async () => {
		loadingInitial = true;
		try {
			console.log('🚀 Fetching next assessment...');
			const response = await fetch('/api/patient/assessments/next');

			if (!response.ok) {
				throw new Error(`Failed to fetch: ${response.status}`);
			}

			const data = await response.json();
			console.log('✅ Next Assessment API Response:', data);

			if (data.all_completed) {
				allCompleted = true;
				console.log('✨ All assessments completed!');
			} else if (data.title) {
				nextQuestionnaire = {
					test_name: data.title,
					test_code: data.test_code,
					progress: data.progress,
					questionCurrent: data.questionCurrent,
					questionTotal: data.questionTotal,
					status: data.status,
					all_completed: data.all_completed,
					totalInterviewsLeft: data.totalInterviewsLeft
				};
				console.log('📋 Next Questionnaire Set:', nextQuestionnaire);
			}
		} catch (error) {
			console.error('❌ Error fetching next assessment:', error);
		} finally {
			loadingInitial = false;
		}
	});

	// This ensures the loadingOption prop is passed correctly from QuestionPage
	$: console.log('ThankYouPage received loadingOption:', loadingOption);
</script>

<Refresh loading={loadingInitial} bg="bg-white" />

<div class="w-full mx-auto min-h-[100dvh] lg:h-full rounded-lg lg:mt-4 flex flex-col pb-16 lg:pb-0">
	<div
		class="flex justify-between w-full text-[0.75rem] lg:text-[1.25rem] px-[1.5rem] lg:px-[5rem] pb-[2rem] pt-8"
	>
		<h1>{title}</h1>
		<button on:click={handleClose} class="text-Success_Dark underline">
			{$t('Questionnaire.ThankYouPage.save_and_exit')}
		</button>
	</div>

	<div
		class="lg:flex-1 flex-none flex flex-col items-center justify-center lg:mt-0 mt-8 px-[1.5rem] lg:px-[5rem]"
	>
		<div class="mb-8">
			<ThankYouCheck size={150} color="#00A886" />
		</div>
		<h2 class="lg:text-3xl text-lg font-bold mb-8 text-center" style="color: #00A886;">
			{allCompleted
				? $t('Questionnaire.ThankYou.all_completed_title')
				: $t('Questionnaire.ThankYou.section_completed_title')}
		</h2>
		{#if allCompleted}
			<p class="text-sm lg:text-lg lg:mb-12 mb-8 text-center max-w-2xl text-gray-700">
				{$t('Questionnaire.ThankYou.all_completed_message')}
			</p>
		{:else}
			<p class="text-sm lg:text-lg lg:mb-12 mb-8 text-center max-w-2xl text-gray-700">
				{$t('Questionnaire.ThankYou.section_completed_message')}
			</p>
		{/if}
		<div
			class="hidden lg:flex lg:flex-col lg:gap-8 lg:items-center lg:justify-center max-w-4xl mx-auto w-full"
		>
			{#if allCompleted}
				<Button
					label={$t('Questionnaire.ThankYouPage.go_home')}
					onClick={handleClose}
					icon={true}
					iconOnSide="right"
					overide="min-w-[14rem] bg-Success text-white"
					loading={loadingButton}
				>
					<div slot="icon" style="display: inline-flex; transform: rotate(180deg);">
						<ArrowLeft size={20} color="white" />
					</div>
				</Button>
			{:else}
				<!-- Interviews Left -->
				{#if nextQuestionnaire && nextQuestionnaire.totalInterviewsLeft}
					<div class="flex items-center gap-4 mb-6 lg:w-[580px] w-full justify-center">
						<div class="flex-1 h-0.5 bg-Success"></div>
						<p class="text-sm font-bold text-Success whitespace-nowrap">
							{nextQuestionnaire.totalInterviewsLeft}
							{$t('Questionnaire.ThankYouPage.interviews_left')}
						</p>
						<div class="flex-1 h-0.5 bg-Success"></div>
					</div>
				{/if}
				<NextQuestionnaireCard
					{nextQuestionnaire}
					loading={loadingButton}
					on:start={handleStartNext}
				/>
			{/if}
		</div>
	</div>

	<!-- Mobile Next Questionnaire Card (Above Buttons) -->
	<div class="lg:hidden px-[1.5rem] pb-[120px]">
		{#if !allCompleted && nextQuestionnaire}
			<!-- Interviews Left -->
			{#if nextQuestionnaire.totalInterviewsLeft}
				<div class="flex items-center gap-4 mb-6 max-w-xs mx-auto">
					<div class="flex-1 h-0.5 bg-Success"></div>
					<p class="text-sm font-bold text-Success whitespace-nowrap">
						{nextQuestionnaire.totalInterviewsLeft}
						{$t('Questionnaire.ThankYouPage.interviews_left')}
					</p>
					<div class="flex-1 h-0.5 bg-Success"></div>
				</div>
			{/if}
			<NextQuestionnaireCard
				{nextQuestionnaire}
				loading={loadingButton}
				on:start={handleStartNext}
			/>
		{/if}
	</div>

	<!-- Bottom Buttons (Back and Go To Home) (Fixed on Mobile, Relative on Desktop) -->
	<div
		class="flex fixed lg:relative lg:bottom-20 bottom-0 left-0 w-[100dvw] lg:w-auto justify-between lg:justify-start lg:mb-8 mt-auto gap-3 px-[1.5rem] lg:px-[5rem] lg:py-0 py-[1rem] bg-white lg:bg-opacity-0"
	>
		<Button
			label={$t('Questionnaire.ThankYouPage.back')}
			outline={true}
			onClick={handleBack}
			overide="lg:min-w-[14rem] hover:text-white"
		/>

		<!-- Start/Complete Interview Button (Mobile, if not completed) -->
		{#if !allCompleted && nextQuestionnaire}
			<Button
				label={nextQuestionnaire.status === 'in_progress'
					? $t('Questionnaire.ThankYouPage.complete_interview')
					: $t('Questionnaire.ThankYouPage.start_next_interview')}
				onClick={handleStartNext}
				size="small"
				icon={true}
				iconOnSide="right"
				overide="flex-1 lg:hidden bg-Success text-white"
				loading={loadingButton}
			>
				<svg
					slot="icon"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="w-4 h-4"
				>
					<polyline points="9 18 15 12 9 6"></polyline>
				</svg>
			</Button>
		{/if}

		<!-- Go To Home Button (Mobile only, shows only if all_completed) -->
		{#if allCompleted}
			<Button
				label={$t('Questionnaire.ThankYouPage.go_home')}
				onClick={handleClose}
				icon={true}
				iconOnSide="right"
				overide="flex-1 lg:hidden bg-Success text-white"
				loading={loadingButton}
			>
				<div slot="icon" style="display: inline-flex; transform: rotate(180deg);">
					<ArrowLeft size={20} color="white" />
				</div>
			</Button>
		{/if}
	</div>
</div>
