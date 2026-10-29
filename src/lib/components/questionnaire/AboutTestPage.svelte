<script>
	import { onMount, onDestroy } from 'svelte';
	import { debugMode as t } from '$lib/i18n-debug';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import Button from '../buttons/Button.svelte';
	import Volume from '../feather/volume.svelte';
	import VolumeX from '../feather/volume-x.svelte';
	import Play from '../feather/play.svelte';
	import Pause from '../feather/pause.svelte';
	import IconRenderer from '../IconRenderer.svelte';

	import { getLocalizedText } from '$lib/utils/language';
	import { locale } from 'svelte-i18n';

	export let slideNumber;
	export let test_code;
	export let title;
	export let displayTextBeforeQuestions;
	export let urlParam;

	let audioContext;
	let audioSource;
	let audioBuffer;
	let gainNode;
	let isPlaying = false;
	let isAutoplayEnabled = true;
	let audioLoaded = false;
	let audioError = false;

	onMount(() => {
		const autoplayCookie = document.cookie.split('; ').find((row) => row.startsWith('autoplay='));
		if (autoplayCookie) {
			isAutoplayEnabled = autoplayCookie.split('=')[1] === 'true';
		}
		if (!autoplayCookie) {
			document.cookie = `autoplay=true; path=/; max-age=31536000`;
		}
	});

	$: {
		if (slideNumber && test_code) {
			loadAudioFiles(true);
		}
	}

	function toggleAutoplay() {
		isAutoplayEnabled = !isAutoplayEnabled;
		document.cookie = `autoplay=${isAutoplayEnabled}; path=/; max-age=31536000`;
	}

	async function loadAudioFiles(autoplay = false) {
		try {
			if (audioContext) {
				audioContext.close();
			}
			audioContext = new (window.AudioContext || window.webkitAudioContext)();
			gainNode = audioContext.createGain();
			gainNode.connect(audioContext.destination);

			const basePath = $locale === 'fr' ? '/voiceovers_fr' : '/voiceovers';
			const response = await fetch(`${basePath}/${test_code}/about_test_${slideNumber}.m4a`);
			if (!response.ok) throw new Error('Audio file not found');
			const arrayBuffer = await response.arrayBuffer();
			audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

			audioSource = audioContext.createBufferSource();
			audioSource.buffer = audioBuffer;
			audioSource.connect(gainNode);

			audioLoaded = true;
			if (autoplay && isAutoplayEnabled) {
				playAudio();
			}
		} catch (error) {
			console.error('Error loading audio:', error);
			audioError = true;
		}
	}

	function togglePlayPause() {
		if (isPlaying) {
			audioSource?.stop();
			isPlaying = false;
		} else {
			playAudio();
		}
	}

	function playAudio() {
		if (!audioLoaded) return;

		if (audioSource) {
			audioSource.stop();
		}

		audioSource = audioContext.createBufferSource();
		audioSource.buffer = audioBuffer;
		audioSource.connect(gainNode);
		audioSource.start(0);
		isPlaying = true;

		audioSource.onended = () => {
			isPlaying = false;
		};
	}

	function handleNext() {
		const nextSlide = parseInt(slideNumber) + 1;
		if (test_code === 'ADULT_BIO') {
			if (nextSlide <= 3) {
				goto(`/patient/${urlParam}/about_the_test/${nextSlide}`);
			} else {
				goto(`/patient/${urlParam}/1`);
			}
		} else {
			goto(`/patient/${urlParam}/1`);
		}
	}

	function handleBack() {
		const prevSlide = parseInt(slideNumber) - 1;
		if (test_code === 'ADULT_BIO') {
			if (prevSlide > 0) {
				goto(`/patient/${urlParam}/about_the_test/${prevSlide}`);
			} else {
				goto('/patient');
			}
		} else {
			// For non-adult_bio tests, only allow going back to patient page
			goto('/patient');
		}
	}

	function handleSaveAndExit() {
		goto('/patient');
	}

	onDestroy(() => {
		if (audioContext) {
			audioContext.close();
		}
		if (audioSource) {
			try {
				audioSource.stop();
			} catch (e) {
				// Ignore errors if audio source is already stopped
			}
		}
	});
</script>

<div
	class="flex flex-col justify-between lg:justify-start mx-auto z-20 relative pt-8 w-full min-h-[100dvh] lg:h-full pb-[10rem] lg:pb-0"
>
	<div
		class="flex justify-between w-full text-[0.75rem] lg:text-[1.25rem] px-[1.5rem] lg:px-[5rem] pb-[2rem]"
	>
		<h1>{getLocalizedText(title, $locale)}</h1>
		<button on:click={handleSaveAndExit} class="text-Success_Dark underline">
			{$t('Questionnaire.About.save_and_exit')}
		</button>
	</div>

	{#if audioLoaded}
		<div class="absolute right-0 top-28 flex flex-col items-end z-50">
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
								class="w-5 h-5 rounded-full relative -top-1 bg-white transition-all duration-300 flex items-center justify-center"
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

	<div
		class="flex lg:flex-row flex-col gap-10 lg:items-center flex-grow px-[1.5rem] lg:px-[5rem] font-inter-display"
	>
		{#if slideNumber === '1' && test_code === 'ADULT_BIO'}
			<div class=" max-w-2xl">
				<h2 class="text-[1.5rem] lg:text-[3rem] mb-6">
					{$t('Questionnaire.About.welcome_title')}
				</h2>
				<p class="mb-4 text-[1rem] lg:text-[1.5rem] font-light">
					{$t('Questionnaire.About.welcome_text')}
				</p>
			</div>
		{:else if slideNumber === '2' && test_code === 'ADULT_BIO'}
			<div class="lg:grid lg:grid-cols-2 lg:gap-x-10 space-y-10">
				<div class="mx-auto">
					{#key $locale}
						<video
							src={$locale === 'fr' ? '/intro_fr.mp4' : '/intro_en.mp4'}
							autoplay
							playsinline
							controls
							class=" max-h-[50dvh] rounded-[0.6875rem] lg:rounded-[1.25rem]"
						></video>
					{/key}
				</div>
				<div>
					<h2 class="text-[1.5rem] lg:text-[3rem] mb-6">{$t('Questionnaire.About.doctor_name')}</h2>
					<p class="mb-4 text-[1rem] lg:text-[1.5rem] font-light">
						{$t('Questionnaire.About.doctor_bio')}
					</p>
				</div>
				<div>
					<h2 class="text-[1.5rem] lg:text-[3rem] mb-6">
						{$t('Questionnaire.About.quick_guide_title')}
					</h2>
					<p class="mb-4 text-[1rem] lg:text-[1.5rem] font-light">
						{$t('Questionnaire.About.quick_guide_text')}
					</p>
				</div>
			</div>
		{:else}
			<div class="lg:max-w-2xl">
				<h2 class="text-[1.5rem] lg:text-[3rem] mb-6">{getLocalizedText(title, $locale)}</h2>
				<p class="mb-4 text-[1rem] lg:text-[1.5rem] font-light">
					{getLocalizedText(displayTextBeforeQuestions, $locale)}
				</p>
			</div>
		{/if}
	</div>

	<div
		class="flex gap-5 justify-between lg:mb-8 px-[1.5rem] lg:px-[5rem] lg:py-0 py-[1rem] fixed bottom-0 left-0 bg-white lg:bg-opacity-0 lg:static w-full lg:w-auto"
	>
		<Button
			label={$t('Questionnaire.Navigation.back')}
			outline={true}
			onClick={handleBack}
			overide="lg:min-w-[14rem] hover:text-white"
		/>
		<Button
			label={$t('Questionnaire.Navigation.next')}
			onClick={handleNext}
			overide="lg:min-w-[14rem]"
		/>
	</div>
</div>
