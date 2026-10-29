<script>
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { questionnaireStore } from '$lib/stores/questionnaire';
	import { navState } from '$lib/stores';
	import AboutTestPage from '$lib/components/questionnaire/AboutTestPage.svelte';
	import Refresh from '$lib/components/common/Refresh.svelte';

	$: testName = $page.params.testName;
	$: slideNumber = $page.params.slideNumber;
	$: test_code = $questionnaireStore.currentQuestionnaire?.test_code;

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
			console.log('Finally,', $questionnaireStore);
			questionnaireStore.setLoading(false);
		}
	}

	onMount(() => {
		if (!$questionnaireStore.currentQuestionnaire) {
			loadStoreData();
		}
		$navState = 'Question';
	});
</script>

<div class="w-full h-full z-10 relative">
	<Refresh loading={$questionnaireStore.isLoading} on:refresh={loadStoreData} />
	{#if $questionnaireStore.currentQuestionnaire}
		<AboutTestPage
			{slideNumber}
			{test_code}
			title={$questionnaireStore.currentQuestionnaire.title}
			urlParam={testName}
			displayTextBeforeQuestions={$questionnaireStore.currentQuestionnaire
				.displayTextBeforeQuestions}
		/>
	{/if}
</div>
