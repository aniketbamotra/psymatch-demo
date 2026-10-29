<script>
	import { createEventDispatcher } from 'svelte';
	import Button from '../buttons/Button.svelte';
	import { locale } from 'svelte-i18n';
	import { getLocalizedText } from '$lib/utils/language';
	import { debugMode as t } from '$lib/i18n-debug';

	const dispatch = createEventDispatcher();

	export let nextQuestionnaire = null;
	export let loading = false;

	function handleStartNext() {
		if (nextQuestionnaire) {
			dispatch('start', nextQuestionnaire);
		}
	}
</script>

{#if nextQuestionnaire}
	<div class="flex flex-col gap-0 relative">
		<!-- Main Card -->
		<div class="flex flex-col p-6 border border-gray-200 rounded-lg bg-white shadow-sm gap-4">
			<!-- Header with title and button -->
			<div class="flex flex-col lg:flex-row items-center justify-between gap-6">
				<h3 class="text-base font-normal text-gray-900 text-center lg:text-left leading-[128%]">
					{getLocalizedText(nextQuestionnaire.test_name, $locale) || 'Next Interview'}
				</h3>
				<Button
					label={nextQuestionnaire.status === 'in_progress'
						? $t('Questionnaire.ThankYouPage.complete_interview')
						: $t('Questionnaire.ThankYouPage.start_next_interview')}
					onClick={handleStartNext}
					size="small"
					icon={true}
					iconOnSide="right"
					overide="min-w-[12rem] bg-Success text-white hidden lg:inline-flex"
					{loading}
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
			</div>
		</div>

		<!-- Progress Section (Absolutely Positioned) -->
		{#if nextQuestionnaire.questionTotal && nextQuestionnaire.status === 'in_progress'}
			<div
				class="absolute flex flex-col gap-2 p-4 rounded-lg lg:w-[238px] w-full top-full lg:right-3 right-0 bg-[#E1DFDF]"
			>
				<p class="text-sm font-[500] leading-[110%] text-black">
					{String(nextQuestionnaire.questionCurrent).padStart(
						2,
						'0'
					)}/{nextQuestionnaire.questionTotal} Questions
				</p>
				<div class="w-full rounded-full h-2 bg-gray-200">
					<div
						class="rounded-full h-full bg-Success transition-all duration-300"
						style="width: {nextQuestionnaire.progress || 0}%"
					></div>
				</div>
			</div>
		{/if}
	</div>
{/if}

<style>
	/* Add any additional styling here */
</style>
