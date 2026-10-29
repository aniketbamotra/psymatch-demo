<script>
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import * as api from '$lib/api';
	import { navState } from '$lib/stores';
	import { questionnaireStore } from '$lib/stores/questionnaire';
	import QuestionPage from '$lib/components/questionnaire/QuestionPage.svelte';

	$: testName = $page.params.testName;
	$: questionIndex = parseInt($page.params.questionIndex);

	async function loadStoreData() {
		questionnaireStore.setLoading(true);
		try {
			const response = await fetch(`/api/questionnaires?testName=${testName}`);
			if (!response.ok) throw new Error('Failed to fetch questionnaire');
			const questionnaire = await response.json();

			const responsesResponse = await fetch(`/api/questionnaire-results?testName=${testName}`);
			if (!responsesResponse.ok) throw new Error('Failed to fetch responses');
			const responses = await responsesResponse.json();

			questionnaireStore.setQuestionnaire(questionnaire);

			// Initialize responses array if needed
			if (responses && Array.isArray(responses.responses)) {
				responses.responses.forEach((response, index) => {
					if (response && response.value) {
						questionnaireStore.addResponse(`q${index + 1}`, response.value);
					}
				});
			}
		} catch (error) {
			console.error('Error loading questionnaire data:', error);
		} finally {
			questionnaireStore.setLoading(false);
		}
	}

	onMount(() => {
		if (!$questionnaireStore.currentQuestionnaire) {
			loadStoreData();
		}
		$navState = 'Question';
	});

	function handleSaveAndExit() {
		$navState = 'Home';
		window.location.href = '/patient';
	}
</script>

<div class="w-full h-full z-10 relative">
	{#if $questionnaireStore.currentQuestionnaire}
		<QuestionPage currentIndex={questionIndex} on:saveAndExit={handleSaveAndExit} />
	{/if}
</div>

<style>
	.error {
		color: red;
		font-weight: bold;
	}
</style>
