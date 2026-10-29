<script>
	import { createEventDispatcher, onMount, onDestroy } from 'svelte';
	import { writable } from 'svelte/store';
	import { fly } from 'svelte/transition';
	import { quartOut } from 'svelte/easing';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { questionnaireStore } from '$lib/stores/questionnaire';
	import * as api from '$lib/api';
	import {
		shouldSkipQuestion,
		saveSkippedQuestionResponse,
		saveSkippedQuestionResponses
	} from '$lib/utils/skipLogicHandler';
	import { processInitialSkipLogic } from '$lib/utils/questionnaireSkipLogic';
	import Button from '$lib/components/buttons/Button.svelte';
	import QuestionnaireForm from './QuestionnaireForm.svelte';
	import Volume from '$lib/components/feather/volume.svelte';
	import VolumeX from '$lib/components/feather/volume-x.svelte';
	import Play from '$lib/components/feather/play.svelte';
	import Pause from '$lib/components/feather/pause.svelte';
	import IconRenderer from '$lib/components/IconRenderer.svelte';
	import { buildCustomQuestion } from './CustomQuestionBuilder.js';
	import ThankYouPage from '$lib/components/questionnaire/ThankYouPage.svelte';
	import { debugMode as t } from '$lib/i18n-debug';
	import { locale } from 'svelte-i18n';
	import { getLocalizedText } from '$lib/utils/language';
	export let currentIndex;

	let lastQuestionSubmitted = false;
	let loadingOption = null;
	let successOption = null;
	let error = null;
	let isBackward = false;
	let isBackLoading = false; // Track loading state for back button
	let anonymizationAbortController = null;

	$: currentQuestion = $questionnaireStore.currentQuestionnaire?.questions[currentIndex - 1];
	$: totalQuestions = $questionnaireStore.currentQuestionnaire?.questions.length || 0;
	$: selectedValue = currentQuestion
		? $questionnaireStore.responses.find((r) => r.questionId === currentQuestion.id)?.value ||
			$questionnaireStore.responses[currentIndex - 1]?.value ||
			null
		: null;

	$: {
		console.log('Questionnaire Store:', {
			currentQuestionnaire: $questionnaireStore.currentQuestionnaire,
			responses: $questionnaireStore.responses,
			questionLeft: $questionnaireStore.questionLeft,
			isLoading: $questionnaireStore.isLoading
		});
		console.log('Current selectedValue:', selectedValue);
		console.log('Current Question Number:', currentIndex);
	}

	// Reset lastQuestionSubmitted and option states when the test changes (based on URL)
	$: {
		const currentPath = $page.url.pathname;
		const pathSegments = currentPath.split('/').filter(Boolean);
		// pathSegments[1] is testName
		if (pathSegments[1]) {
			// If we are on a question page (not thank-you), reset the submission state
			if (!currentPath.includes('thank-you')) {
				lastQuestionSubmitted = false;
				// Also reset option states when switching tests
				loadingOption = null;
				successOption = null;
				error = null;
				selectedValue = null;
			}
		}
	}

	// Reset option states when the question index changes
	$: if (currentIndex) {
		loadingOption = null;
		successOption = null;
		error = null;
		// We don't force selectedValue to null here because the reactive declaration
		// above should handle it based on the store, and we don't want to clear
		// a value if the user navigates back to a answered question.
	}

	// [TEMPORARILY DISABLED] Trigger non-blocking anonymization process for Adult Bio completion
	/*
	$: if (lastQuestionSubmitted && $questionnaireStore.currentQuestionnaire?.test_code === 'ADULT_BIO') {
		if (anonymizationAbortController) {
			anonymizationAbortController.abort(); // Cancel any existing stuck request just in case
		}
		anonymizationAbortController = new AbortController();
		console.log("Triggering background anonymization process...");
		fetch('/api/anonymization/process', {
			method: 'POST',
			credentials: 'include',
			signal: anonymizationAbortController.signal
		}).catch(err => {
			if (err.name === 'AbortError') {
				console.log("Anonymization explicitly aborted by user navigating back to delete final response.");
			} else {
				console.error("Anonymization process failed:", err);
			}
		});
	}
	*/

	async function handleOptionSelect(value) {
		if (loadingOption !== null) return; // Prevent clicking while loading

		loadingOption = value;
		console.log('Selected value:', value);

		// Parse value if it's a JSON string
		try {
			selectedValue = value;
			console.log('Parsed value:', selectedValue);
		} catch {
			selectedValue = value;
		}

		try {
			const currentPath = $page.url.pathname;
			const pathSegments = currentPath.split('/').filter(Boolean);
			let testName = pathSegments[1];
			testName = decodeURIComponent(testName);
			console.log('Test Name:', testName);
			// Ensure value is properly parsed before sending to API
			let parsedAnswer;
			try {
				// If value is a string that looks like JSON, parse it
				if (
					typeof value === 'string' &&
					(value.trim().startsWith('{') || value.trim().startsWith('['))
				) {
					parsedAnswer = JSON.parse(value);
				} else {
					// Otherwise keep the original value
					parsedAnswer = value;
				}
			} catch (e) {
				console.error('Error parsing answer:', e);
				parsedAnswer = value; // Keep original value if parsing fails
			}

			// Always use q1, q2, etc. format for questionId
			const requestData = {
				testName,
				questionId: `q${currentIndex}`,
				answer: parsedAnswer
			};

			console.log('Sending to API:', requestData);

			const response = await api.post('/api/questionnaire-results', requestData);
			console.log('API Response:', await response.clone().json());
			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || 'Failed to save answer');
			}

			// Update responses in store with consistent questionId
			questionnaireStore.addResponse(`q${currentIndex}`, value);

			// If last question, mark as completed and dispatch event
			if (currentIndex === totalQuestions) {
				await api.put('/api/questionnaire-results', { testName });
				const nextUrl = `/patient/${testName}/thank-you`;
				setTimeout(() => {
					lastQuestionSubmitted = true;
				}, 1000);
				window.history.pushState({}, '', nextUrl);
			} else {
				// === SUICIDE INTERVIEW HARDCODED SKIP LOGIC (bandage) ===
				const testCode = $questionnaireStore.currentQuestionnaire.test_code;
				if (testCode === 'suicide_interview') {
					console.log(`[suicide_interview] Inline skip check for Q${currentIndex}`);
					
					// Helper: get a response value from the store by question number
					const getVal = (qNum) => {
						const r = $questionnaireStore.responses.find(r => r.questionId === `q${qNum}`);
						return r ? r.value : null;
					};

					// Helper: save a skipped question using the SAME api.post that works for regular saves
					const saveSkipped = async (qNum, val = '0') => {
						console.log(`[suicide_interview] Saving skipped q${qNum} = ${val}`);
						questionnaireStore.addResponse(`q${qNum}`, val);
						const skipRes = await api.post('/api/questionnaire-results', {
							testName,
							questionId: `q${qNum}`,
							answer: val
						});
						if (!skipRes.ok) {
							console.error(`[suicide_interview] Failed to save q${qNum}:`, await skipRes.clone().text());
						} else {
							console.log(`[suicide_interview] Saved q${qNum} = ${val} to DB`);
						}
					};

					let suicideSkipHandled = false;

					// Rule 1: If Q1=0 AND Q2=0 → skip Q3-Q24, jump to Q25
					if (currentIndex === 2 && getVal(1) == 0 && getVal(2) == 0) {
						console.log('[suicide_interview] Rule 1: Q1=0 & Q2=0 → skipping Q3-Q24');
						for (let i = 3; i <= 24; i++) {
							await saveSkipped(i, '0');
						}
						const targetUrl = `/patient/${testName}/25`;
						window.history.pushState({}, '', targetUrl);
						setTimeout(() => { successOption = null; currentIndex = 25; }, 500);
						suicideSkipHandled = true;
					}
					// Rule 2: If Q13=1 → skip Q14-Q15, jump to Q16
					else if (currentIndex === 13 && getVal(13) == 1) {
						console.log('[suicide_interview] Rule 2: Q13=1 → skipping Q14-Q15');
						await saveSkipped(14, '0');
						await saveSkipped(15, '0');
						const targetUrl = `/patient/${testName}/16`;
						window.history.pushState({}, '', targetUrl);
						setTimeout(() => { successOption = null; currentIndex = 16; }, 500);
						suicideSkipHandled = true;
					}
					// Rule 3: If Q24=1 → save Q25-Q29 as skipped (each with its own value), then exit test
					else if (currentIndex === 24 && getVal(24) == 1) {
						console.log('[suicide_interview] Rule 3: Q24=1 → saving Q25-Q29, exit test');
						const skipValues = {
							25: '0',
							26: '0',
							27: '0',
							28: '0',
							29: '0'
						};
						for (const [qNum, val] of Object.entries(skipValues)) {
							await saveSkipped(parseInt(qNum), val);
						}
						await api.put('/api/questionnaire-results', { testName });
						const thankYouUrl = `/patient/${testName}/thank-you`;
						window.history.pushState({}, '', thankYouUrl);
						setTimeout(() => { lastQuestionSubmitted = true; }, 1000);
						suicideSkipHandled = true;
					}
					// Rule 4: If Q25=1 → skip Q26, jump to Q27
					else if (currentIndex === 25 && getVal(25) == 1) {
						console.log('[suicide_interview] Rule 4: Q25=1 → skipping Q26');
						await saveSkipped(26, '0');
						const targetUrl = `/patient/${testName}/27`;
						window.history.pushState({}, '', targetUrl);
						setTimeout(() => { successOption = null; currentIndex = 27; }, 500);
						suicideSkipHandled = true;
					}

					if (suicideSkipHandled) {
						// Skip handled, don't run generic skip logic
						return;
					}
				}
				// === END SUICIDE INTERVIEW BANDAGE ===

				// Check if the next question should be skipped (Skip Logic)
				const nextQuestionIndex = currentIndex;
				const skipInfo = await shouldSkipQuestion(
					$questionnaireStore.currentQuestionnaire.test_code,
					nextQuestionIndex,
					$questionnaireStore.responses
				);
				console.log(
					`Skip Logic for ${$questionnaireStore.currentQuestionnaire.test_code} question ${nextQuestionIndex}:`,
					skipInfo
				);
				// If the next question should be skipped
				if (skipInfo.skip) {
					console.log(
						`Applying skip logic for ${$questionnaireStore.currentQuestionnaire.test_code} question ${nextQuestionIndex}`,
						skipInfo
					);

					// Use the saveSkippedQuestionResponses utility function with skipInfo
					await saveSkippedQuestionResponses(
						$questionnaireStore.currentQuestionnaire.test_code,
						nextQuestionIndex,
						skipInfo,
						testName,
						$questionnaireStore.currentQuestionnaire?.questions.length
					);

					// If we need to exit the test
					if (skipInfo.exitTest) {
						console.log(`Exit test triggered for ${testName}`);
						// Complete the test
						await api.put('/api/questionnaire-results', { testName });

						// Navigate to thank you page
						const thankYouUrl = `/patient/${testName}/thank-you`;
						window.history.pushState({}, '', thankYouUrl);
						setTimeout(() => {
							lastQuestionSubmitted = true;
						}, 1000);
						return;
					}

					// Navigate to the next appropriate question
					const targetQuestion = skipInfo.nextQuestion || nextQuestionIndex + 1;
					const nextUrl = `/patient/${testName}/${targetQuestion}`;
					window.history.pushState({}, '', nextUrl);

					// Update current index - we'll skip to the appropriate question
					setTimeout(() => {
						successOption = null;
						currentIndex = targetQuestion;
					}, 500);
				} else {
					// Regular navigation to next question
					const nextUrl = `/patient/${testName}/${currentIndex + 1}`;
					window.history.pushState({}, '', nextUrl);

					// Regular index update
					setTimeout(() => {
						successOption = null;
						currentIndex = currentIndex + 1;
					}, 500);
				}
			}
		} catch (err) {
			console.error('Error submitting answer:', err);
			error = err.message;
		} finally {
			isBackward = false;
			loadingOption = null;
			successOption = value;
			// Only increment index if not the last question - REMOVED this as we handle the index update in the skip logic section
			/*
			if (currentIndex !== totalQuestions) {
				setTimeout(() => {
					successOption = null;
					currentIndex = currentIndex + 1;
				}, 500);
			}
			*/

			error = null;
		}
	}

	async function handleBack() {
		if (isBackLoading) return; // Prevent double clicks
		isBackLoading = true;

		try {
			const currentPath = $page.url.pathname;
			const pathSegments = currentPath.split('/').filter(Boolean);
			const testName = pathSegments[1];

			if (lastQuestionSubmitted) {
				// We're coming from the Thank You page, so go back to the last question
				// Clear responses for anything that might be after the last question
				await questionnaireStore.clearResponsesAheadOfIndex(currentIndex);

				lastQuestionSubmitted = false;
				// Reset success state for any options
				successOption = null;
				// Set currentIndex to the last question's index
				currentIndex = currentIndex;

				// Update URL to last question
				const prevUrl = `/patient/${testName}/${currentIndex}`;
				window.history.pushState({}, '', prevUrl);

				isBackward = true;
			} else if (currentIndex > 1) {
				// Regular back button behavior
				// Clear responses ahead of current index and wait for completion
				await questionnaireStore.clearResponsesAheadOfIndex(currentIndex - 1);

				// If they delete the last question's response by going back, abort generation
				/*
				if (anonymizationAbortController) {
					console.log("Aborting background anonymization because final response was cleared.");
					anonymizationAbortController.abort();
					anonymizationAbortController = null;
				}
				*/

				// Now it's safe to navigate
				const prevUrl = `/patient/${testName}/${currentIndex - 1}`;
				window.history.pushState({}, '', prevUrl);
				isBackward = true;
				currentIndex = currentIndex - 1;
			} else {
				goto('/patient');
			}
		} catch (error) {
			console.error('Error during back navigation:', error);
			// Optionally show error message to user
		} finally {
			isBackLoading = false;
		}
	}

	$: isSelected = (value) => {
		const currentResponse = currentQuestion
			? $questionnaireStore.responses.find((r) => r.questionId === currentQuestion.id) ||
				$questionnaireStore.responses[currentIndex - 1]
			: null;
		console.log('Checking selected:', { value, currentResponse });

		if (!currentResponse) return false;

		// Handle JSON values
		let responseValue = currentResponse.value;
		try {
			if (
				typeof responseValue === 'string' &&
				(responseValue.startsWith('{') || responseValue.startsWith('['))
			) {
				responseValue = JSON.parse(responseValue);
			}
			if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
				value = JSON.parse(value);
			}
		} catch {
			// If parsing fails, use values as-is
		}

		// Deep compare objects/arrays, simple compare for primitives
		return typeof responseValue === 'object'
			? JSON.stringify(responseValue) === JSON.stringify(value)
			: responseValue == value;
	};

	const dispatch = createEventDispatcher();

	let audioContext;
	let audioSource;
	let audioBuffers = [];
	let currentBufferIndex = 0;
	let gainNode;
	let isPlaying = false;
	let isMuted = false;
	let playbackSpeed = 1;
	let audioLoaded = false;
	let audioError = false;
	let isAutoplayEnabled = true;

	// Initialize autoplay from cookie
	onMount(() => {
		const autoplayCookie = document.cookie.split('; ').find((row) => row.startsWith('autoplay='));
		if (autoplayCookie) {
			isAutoplayEnabled = autoplayCookie.split('=')[1] === 'true';
		}
		// Set cookie if it doesn't exist
		if (!autoplayCookie) {
			document.cookie = `autoplay=true; path=/; max-age=31536000`; // 1 year expiry
		}
	});

	function toggleAutoplay() {
		isAutoplayEnabled = !isAutoplayEnabled;
		document.cookie = `autoplay=${isAutoplayEnabled}; path=/; max-age=31536000`;
	}

	const audioSettings = writable({ isMuted, playbackSpeed });

	async function loadAudioFiles(autoplay = false) {
		try {
			audioLoaded = false;
			audioBuffers = [];
			console.log('Loading audio files for question:', currentIndex);
			if (audioContext) {
				console.log('Closing existing audio context');
				audioContext.close();
			}
			let customQuestion = null;
			customQuestion = buildCustomQuestion(
				$questionnaireStore.currentQuestionnaire.test_code,
				currentIndex,
				$questionnaireStore.responses,
				$t
			);
			console.log('Custom Question:', customQuestion);
			if (customQuestion?.audio) {
				console.log('Loading custom audio files:', customQuestion.audio);
				audioContext = new (window.AudioContext || window.webkitAudioContext)();
				gainNode = audioContext.createGain();
				gainNode.connect(audioContext.destination);

				const test_code = $questionnaireStore.currentQuestionnaire.test_code;
				const question_id = currentQuestion.id;

				const basePath = $locale === 'fr' ? '/voiceovers_fr' : '/voiceovers';
				// Load all audio files from the audio array
				const bufferPromises = customQuestion.audio.map(async (audioString) => {
					let response = await fetch(
						`${basePath}/${test_code}/${question_id}/${question_id}_${audioString}.m4a`
					);
					if (!response.ok) {
						response = await fetch(
							`${basePath}/${test_code}/${question_id}/${question_id}_${audioString}.mp3`
						);
					}
					if (!response.ok) throw new Error(`Audio file not found: ${audioString}`);
					const arrayBuffer = await response.arrayBuffer();
					return await audioContext.decodeAudioData(arrayBuffer);
				});

				audioBuffers = await Promise.all(bufferPromises);
				audioLoaded = true;
				if (autoplay && isAutoplayEnabled) {
					currentBufferIndex = 0;
					console.log('Autoplay enabled, playing audio for question:', currentIndex);
					playAudio();
				}
			} else {
				audioContext = null;
				audioBuffers = [];
				let arrayBuffer = null;
				// Fallback to default audio file
				audioContext = new (window.AudioContext || window.webkitAudioContext)();
				gainNode = audioContext.createGain();
				gainNode.connect(audioContext.destination);
				let response;
				console.log(currentQuestion);
				const basePath = $locale === 'fr' ? '/voiceovers_fr' : '/voiceovers';
				if ($questionnaireStore.currentQuestionnaire.test_code === 'ADULT_BIO') {
					response = await fetch(
						`${basePath}/${$questionnaireStore.currentQuestionnaire.test_code}/${currentIndex}.mp3`
					);
				} else {
					response = await fetch(
						`${basePath}/${$questionnaireStore.currentQuestionnaire.test_code}/${currentQuestion.id}.m4a`
					);
				}
				if (!response.ok) {
					response = await fetch(
						`${basePath}/${$questionnaireStore.currentQuestionnaire.test_code}/${currentQuestion.id}.mp3`
					);
				}
				if (!response.ok) throw new Error('Audio file not found');
				arrayBuffer = await response.arrayBuffer();
				audioBuffers = [await audioContext.decodeAudioData(arrayBuffer)];
				audioLoaded = true;

				if (autoplay && isAutoplayEnabled) {
					currentBufferIndex = 0;
					console.log('Autoplay enabled, playing audio for question:', currentIndex);
					playAudio();
				}
			}
		} catch (error) {
			console.error('Error loading audio:', error);
			audioError = true;
		}
	}
	onMount(() => {
		// Load audio files
		loadAudioFiles(true);
	});
	$: {
		if (currentIndex) {
			console.log('Current Index:', currentIndex);
			loadAudioFiles(true);
		}
	}

	onDestroy(() => {
		console.log('Cleaning up audio context and buffers');
		if (audioContext) {
			audioContext.close();
		}
		questionnaireStore.reset();
	});

	function togglePlayPause() {
		if (isPlaying) {
			audioSource.stop();
			isPlaying = false;
		} else {
			playAudio();
		}
	}

	function playAudio() {
		if (!audioLoaded || audioBuffers.length === 0) return;

		if (audioSource) {
			audioSource.stop();
		}

		audioSource = audioContext.createBufferSource();
		audioSource.buffer = audioBuffers[currentBufferIndex];
		audioSource.playbackRate.value = playbackSpeed;
		audioSource.connect(gainNode);

		audioSource.start(0);
		isPlaying = true;
		console.log(
			'Playing audio for question:',
			currentIndex,
			'Buffer index:',
			currentBufferIndex,
			'lenght of buffer:',
			audioBuffers.length
		);
		audioSource.onended = () => {
			currentBufferIndex++;
			if (currentBufferIndex < audioBuffers.length) {
				playAudio(); // Play next audio in sequence
			} else {
				currentBufferIndex = 0;
				isPlaying = false;
			}
		};
	}

	function handleSaveAndExit() {
		dispatch('saveAndExit');
		goto('/patient');
	}

	// Prepare question object for QuestionnaireForm
	$: questionData = currentQuestion && {
		id: currentQuestion.id,
		text: buildCustomQuestion(
				$questionnaireStore.currentQuestionnaire.test_code,
				currentIndex,
				$questionnaireStore.responses,
				$t
			)?.text || getLocalizedText(currentQuestion.text, $locale),
		description_for_subsequent_question: currentQuestion.description_for_subsequent_question
			? getLocalizedText(currentQuestion.description_for_subsequent_question, $locale)
			: null,
		answer_type: currentQuestion.answerType || currentQuestion.answer_type,
		input_type: currentQuestion.input_type,
		options: currentQuestion.options,
		fields: currentQuestion.fields,
		conditional: currentQuestion.conditional,
		scale: currentQuestion.scale?.map((opt) => ({
			[opt.num]: getLocalizedText(opt.text, $locale)
		})),
		answer_values:
			(currentQuestion.answerType || currentQuestion.answer_type) === 'boolean'
				? currentQuestion.scale?.map((opt) => opt.num)
				: undefined
	};
	$: console.log('Current Question Data1:', currentQuestion);
	$: console.log('Current Question Data:', questionData);
</script>

{#if lastQuestionSubmitted}
	<ThankYouPage {loadingOption} on:back={handleBack} />
{:else}
	<div
		class="flex flex-col mx-auto z-20 relative pt-8 w-full min-h-[100dvh] lg:h-full lg:pb-0 pb-16"
	>
		<div
			class="flex justify-between w-full text-[0.75rem] lg:text-[1.25rem] px-[1.5rem] lg:px-[5rem]"
		>
			<h1 class="">
				{getLocalizedText($questionnaireStore.currentQuestionnaire?.title, $locale) || ''}
			</h1>
			<button on:click={handleSaveAndExit} class="text-Success_Dark underline">
				{$t('Questionnaire.About.save_and_exit')}
			</button>
		</div>
		<div class="flex justify-between items-center mt-4 px-[1.5rem] lg:px-[5rem]">
			<div class="w-full rounded-full h-1 lg:h-2 bg-white">
				<div
					class="bg-Success h-1 lg:h-2 rounded-full"
					style="width: {(currentIndex / totalQuestions) * 100}%"
				></div>
			</div>
		</div>

		{#if audioLoaded}
			<div class="absolute right-0 top-24 lg:top-28 flex flex-col items-end z-50">
				<div class="h-[3rem] group overflow-hidden">
					<div class="h-full flex transition-all duration-700">
						<button
							on:click={togglePlayPause}
							class="px-4 py-2 w-[4rem] block {isPlaying
								? 'bg-black text-white'
								: 'bg-Gray_Light text-Gray_Dark'} rounded-l-[0.6875rem]"
						>
							<IconRenderer>
								<svelte:component this={isPlaying ? Volume : VolumeX} />
							</IconRenderer>
						</button>
						<button
							on:click={toggleAutoplay}
							class="relative w-[6rem] h-[3rem] flex flex-col justify-between bg-Gray_Light transition-all duration-300 py-2 px-3 border-Gray_Dark border-l-[1px]"
						>
							<div
								class="relative w-full h-3 rounded-full transition-all duration-300"
								class:bg-Success={isAutoplayEnabled}
								class:bg-Gray_Dark={!isAutoplayEnabled}
							>
								<div
									class=" w-5 h-5 rounded-full relative -top-1 bg-white transition-all duration-300 flex items-center justify-center"
									class:left-[calc(100%-1.25rem)]={isAutoplayEnabled}
									class:left-0={!isAutoplayEnabled}
								>
									<svelte:component
										this={isAutoplayEnabled ? Play : Pause}
										size={10}
										class="text-white transition-all duration-300"
									/>
								</div>
							</div>
							<div class="text-sm w-full text-center text-Gray_Dark mt-1">Autoplay</div>
						</button>
					</div>
				</div>
			</div>
		{/if}
		<div class="flex w-full left-0 relative overflow-y-hidden overflow-x-hidden">
			{#key currentIndex}
				<div
					class="w-[100dvw]"
					in:fly={{
						x: isBackward ? '-50dvw' : '50dvw',
						duration: 200,
						delay: 200,
						opacity: 0,
						easing: quartOut
					}}
					out:fly={{
						x: isBackward ? '50dvw' : '-50dvw',
						duration: 200,
						delay: 0,
						opacity: 0,
						easing: quartOut
					}}
				>
					{#if questionData}
						<QuestionnaireForm
							question={questionData}
							currentQuestionNumber={currentIndex}
							{totalQuestions}
							{selectedValue}
							{loadingOption}
							{successOption}
							{error}
							{isSelected}
							onOptionSelect={handleOptionSelect}
						/>
					{/if}
				</div>
			{/key}
		</div>

		<div
			class="flex fixed lg:relative bottom-0 left-0 w-[100dvw] lg:w-auto justify-start lg:mb-8 mt-auto px-[1.5rem] lg:px-[5rem] lg:py-0 py-[1rem] bg-white lg:bg-opacity-0"
		>
			<Button
				label={isBackLoading
					? $t('Questionnaire.Navigation.loading')
					: $t('Questionnaire.Navigation.back')}
				outline={true}
				onClick={handleBack}
				disabled={loadingOption !== null || isBackLoading}
				overide="lg:min-w-[14rem] hover:text-white {isBackLoading ? 'opacity-75' : ''}"
			/>
		</div>
	</div>
{/if}
