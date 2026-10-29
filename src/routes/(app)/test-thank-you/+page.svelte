<script>
	import ThankYouPage from '$lib/components/questionnaire/ThankYouPage.svelte';

	let loading = false;
	let nextQuestionnaire = {
		test_name: 'Depression Assessment'
	};
	let title = 'Adult Biographical';
</script>

<div>
	<ThankYouPage {loading} {nextQuestionnaire} {title} />
</div>
