<script>
	import { goto } from '$app/navigation';
	import Button from '../buttons/Button.svelte';
	import { questionnaireStore } from '$lib/stores/questionnaire';
	import * as api from '$lib/api';
	import { debugMode as t } from '$lib/i18n-debug';
	import { locale } from 'svelte-i18n';
	import { getLocalizedText } from '$lib/utils/language';
	export let test_code = '';
	export let title = '';
	export let date = '';
	export let status = ''; // '', 'started', or 'completed'
	export let progress = 0;
	export let questionLeft = 0;
	export let questionTotal = 0;
	export let disabled = false;
	let isLoading = false;
	console.log('QuestionnaireCard:', {
		test_code,
		title,
		date,
		status,
		progress,
		questionLeft,
		questionTotal
	});
	async function handleClick({ intro = false, test_code = test_code }) {
		if (isLoading) return;

		isLoading = true;
		isLoading = true;
		try {
			// Use test_code if available, otherwise fall back to title (which might be an object, so careful)
			const param = test_code || (typeof title === 'string' ? title : title['en']);
			const response = await fetch(`/api/questionnaires?testName=${param}`);
			if (!response.ok) throw new Error('Failed to fetch questionnaire');
			const questionnaire = await response.json();

			const user = await api.get('/api/user').then((res) => res.json());
			const responsesResponse = await fetch(`/api/questionnaire-results?testName=${param}`);
			if (!responsesResponse.ok) throw new Error('Failed to fetch responses');
			const responses = await responsesResponse.json();

			questionnaireStore.setQuestionnaire(questionnaire);
			questionnaireStore.setLoading(false);
			questionnaireStore.setQuestionLeft(questionLeft);

			// Initialize responses array if needed
			if (responses && Array.isArray(responses.responses)) {
				responses.responses.forEach((response, index) => {
					if (response && response.value) {
						questionnaireStore.addResponse(`q${index + 1}`, response.value);
					}
				});
			}

			// Sanitize response sequence to ensure all responses exist in order
			// Wait for sanitization to complete before navigation
			await questionnaireStore.sanitizeResponseSequence();

			if (intro) {
				goto(`/patient/${param}/about_the_test/1`);
			} else {
				goto(`/patient/${param}/${questionLeft + 1}`);
			}
		} catch (error) {
			console.error('Error loading questionnaire:', error);
		} finally {
			isLoading = false;
		}
	}
	console.log('QuestionnaireCard:', { title, date, status, progress, questionLeft, questionTotal });
</script>

{#if test_code == 'ADULT_BIO' && status !== 'completed'}
	<div class="lg:mt-0 mt-10 relative">
		<div
			class="absolute w-full h-full -z-10 bg-Success rounded-[0.625rem] -top-[2.5rem] left-0 text-white p-2 text-[0.75rem]"
		>
			{$t('Questionnaire.Card.complete_interview_prompt').replace(/_/g, ' ')}
		</div>
		<div
			class="bg-white flex flex-col rounded-[0.625rem] overflow-hidden justify-between h-[13rem] lg:h-[17rem] w-full"
		>
			<div class="flex flex-col gap-[1.5rem] p-[1rem]">
				<div>
					<p class="text-sm text-Gray_Dark">
						{$t('Questionnaire.Card.assigned_on')} <br />
						{date}
					</p>
				</div>
				<div class="max-w-[17rem]">
					<h3 class="text-xl leading-tight mb-2">{getLocalizedText(title, $locale)}</h3>
				</div>
			</div>

			<div
				class="w-full bg-Gray_Light lg:p-[1rem] rounded-[0.625rem] flex justify-between gap-[1rem]"
			>
				{#if status == 'started' || (progress > 0 && progress < 100)}
					<div class="w-full flex flex-col h-full justify-between p-2.5 lg:p-0">
						<p class="lg:text-sm font-[500] leading-[110%] text-black">
							{questionLeft} / {questionTotal}<span class="hidden lg:inline"
								><br />{$t('Questionnaire.Card.questions')}</span
							>
						</p>
						<div class="w-full rounded-full h-1 lg:h-2 bg-white">
							<div class="rounded-full h-full bg-Success" style="width:{progress}%"></div>
						</div>
					</div>
					<div class="w-2/3">
						<Button
							label={isLoading
								? $t('Questionnaire.Card.loading')
								: $t('Questionnaire.Card.continue')}
							onClick={() => handleClick({ intro: false, test_code })}
							disabled={isLoading}
							overide="w-full rounded-l-[0] lg:rounded-l-auto"
						/>
					</div>
				{:else if status === 'completed'}
					<div class="w-full">
						<Button label={$t('Questionnaire.Card.completed')} disabled={true} overide="w-full " />
					</div>
				{:else if disabled == false}
					<div class="w-full">
						<Button
							label={isLoading ? $t('Questionnaire.Card.loading') : $t('Questionnaire.Card.start')}
							onClick={() => handleClick({ intro: true, test_code })}
							disabled={isLoading}
							overide="w-full"
						/>
					</div>
				{:else}
					<div class="w-full">
						<Button label={$t('Questionnaire.Card.locked')} disabled="true" overide="w-full" />
					</div>
				{/if}
			</div>
		</div>
	</div>
{:else}
	<div
		class="bg-white flex flex-col rounded-[0.625rem] overflow-hidden justify-between h-[13rem] lg:h-[17rem] w-full"
	>
		<div class="flex flex-col gap-[1.5rem] p-[1rem]">
			<div>
				<p class="text-sm text-Gray_Dark">
					{$t('Questionnaire.Card.assigned_on')} <br />
					{date}
				</p>
			</div>
			<div class="max-w-[17rem]">
				<h3 class="text-xl leading-tight mb-2">{getLocalizedText(title, $locale)}</h3>
			</div>
		</div>

		<div
			class="w-full bg-Gray_Light lg:p-[1rem] rounded-[0.625rem] flex justify-between gap-[1rem]"
		>
			{#if status == 'started' || (progress > 0 && progress < 100)}
				<div class="w-full flex flex-col h-full justify-between p-2.5 lg:p-0">
					<p class="lg:text-sm font-[500] leading-[110%] text-black">
						{questionLeft} / {questionTotal}<span class="hidden lg:inline"
							><br />{$t('Questionnaire.Card.questions')}</span
						>
					</p>
					<div class="w-full rounded-full h-1 lg:h-2 bg-white">
						<div class="rounded-full h-full bg-Success" style="width:{progress}%"></div>
					</div>
				</div>
				<div class="w-2/3">
					<Button
						label={isLoading ? $t('Questionnaire.Card.loading') : $t('Questionnaire.Card.continue')}
						onClick={() => handleClick({ intro: false, test_code })}
						disabled={isLoading}
						overide="w-full rounded-l-[0rem]"
					/>
				</div>
			{:else if status === 'completed'}
				<div class="w-full">
					<Button label={$t('Questionnaire.Card.completed')} disabled={true} overide="w-full " />
				</div>
			{:else if disabled == false}
				<div class="w-full">
					<Button
						label={isLoading ? $t('Questionnaire.Card.loading') : $t('Questionnaire.Card.start')}
						onClick={() => handleClick({ intro: true, test_code })}
						disabled={isLoading}
						overide="w-full"
					/>
				</div>
			{:else}
				<div class="w-full">
					<Button label={$t('Questionnaire.Card.locked')} disabled="true" overide="w-full" />
				</div>
			{/if}
		</div>
	</div>
{/if}
