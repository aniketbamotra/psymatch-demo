<script>
	import { onMount, afterUpdate } from 'svelte';
	import { goto } from '$app/navigation';
	import * as api from '$lib/api';
	import { locale } from 'svelte-i18n';
	import { getLocalizedText } from '$lib/utils/language';
	import { navState } from '$lib/stores';
	import { allocatedTests } from '$lib/stores/allocatedTests';
	import { updateTestProgress } from '$lib/utils/testProgress';
	import QuestionnaireCard from '$lib/components/questionnaire/QuestionnaireCard.svelte';
	import { debugMode as t } from '$lib/i18n-debug';
	import Refresh from '$lib/components/common/Refresh.svelte';

	let user = null;
	let error = null;
	let loading = false;
	let processedTests = [];
	// Process tests when store updates
	$: {
		// First map the tests to add display properties
		const mappedTests = $allocatedTests.map((test) => {
			return {
				...test,
				displayTextBeforeQuestions: test.displayTextBeforeQuestions,
				test_code: test.test_code,
				title:
					typeof test.test_name === 'object'
						? getLocalizedText(test.test_name, $locale)
						: test.test_name.replace('_', ' '),
				date: new Date(test.allocated_at).toLocaleDateString(),
				status: test.progress === 100 ? 'completed' : '',
				progress: test.progress || 0,
				questionLeft: test.questionLeft || 0,
				questionTotal: test.questionTotal || 0
			};
		});

		// Check if ADULT_BIO with pending status exists
		let adultBioPending = mappedTests.find(
			(test) => test.test_code === 'ADULT_BIO' && test.status !== 'completed'
		);
		if (adultBioPending === undefined) {
			// If no ADULT_BIO pending, set to false
			adultBioPending = false;
		}
		console.log('ADULT_BIO pending:', adultBioPending);
		// Sort the tests: ADULT_BIO pending first, then other pending, then completed
		processedTests = mappedTests
			.sort((a, b) => {
				// If a is ADULT_BIO pending, it comes first
				if (a.test_code === 'ADULT_BIO' && a.status !== 'completed') return -1;
				// If b is ADULT_BIO pending, it comes first
				if (b.test_code === 'ADULT_BIO' && b.status !== 'completed') return 1;
				// If a is completed but b is not, b comes first
				if (a.status === 'completed' && b.status !== 'completed') return 1;
				// If b is completed but a is not, a comes first
				if (b.status === 'completed' && a.status !== 'completed') return -1;
				// Otherwise maintain original order
				return 0;
			})
			.map((test) => ({
				...test,
				// Disable non-ADULT_BIO tests if ADULT_BIO pending exists
				disabled: adultBioPending && test.test_code !== 'ADULT_BIO' && test.status !== 'completed'
			}));
	}
	async function loadData() {
		// Only show loader if no data exists
		if ($allocatedTests.length === 0) {
			loading = true;
		}

		try {
			const userResponse = await api.get('/api/user');
			if (userResponse.ok) {
				user = await userResponse.json();
				if (user.userType !== 'patient') {
					error = $t('Patient.Home.access_denied');
					return;
				}

				// Fetch allocated tests
				const testsResponse = await api.get('/api/allocated-tests');
				if (testsResponse.ok) {
					const testsData = await testsResponse.json();
					// Update progress for all tests before updating store
					console.log('Tests:', testsData);
					const updatedTests = await Promise.all(testsData.map((test) => updateTestProgress(test)));
					allocatedTests.set(updatedTests);
				} else {
					error = $t('Patient.Home.load_tests_error');
				}
			} else {
				error = $t('Patient.Home.load_user_error');
			}
		} catch (err) {
			console.error('Error fetching data:', err);
			error = $t('Patient.Home.unexpected_error');
		} finally {
			loading = false;
		}
	}

	onMount(loadData);
	afterUpdate(() => {
		if ($navState === 'Question') {
			$navState = 'Home';
		}
	});
</script>

<div class="container mx-auto p-[2.5rem] lg:p-[5rem] z-10 relative">
	<Refresh {loading} on:refresh={loadData} />
	{#if error}
		<p class="text-red-500">{error}</p>
	{:else if user}
		<div class="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-4 gap-4">
			{#each processedTests as test (test.test_name)}
				<QuestionnaireCard
					displayTextBeforeQuestions={test.displayTextBeforeQuestions}
					test_code={test.test_code}
					title={test.title}
					date={test.date}
					status={test.status}
					progress={test.progress}
					questionLeft={test.questionLeft}
					questionTotal={test.questionTotal}
					disabled={test.disabled}
				/>
			{/each}
		</div>
	{/if}
</div>
