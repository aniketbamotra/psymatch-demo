<script>
	import { createEventDispatcher } from 'svelte';
	import { locale } from '$lib/i18n';
	const dispatch = createEventDispatcher();

	export let option;
	export let selected = false;

	// Check if this assignment is downloaded (green styling)
	$: isDownloaded = option.status === 'downloaded';
	$: isSent = option.isSent === true;

	$: bgClass = isDownloaded ? 'bg-[#E8F9F5]' : isSent ? 'bg-[#E5E7EB]' : 'bg-white';
	$: textClass = isDownloaded ? 'text-[#00A886]' : isSent ? 'text-gray-500 italic' : '';

	// // Format test_code as readable text: "social_anxiety_test" → "Social Anxiety Test"
	// function formatCode(code) {
	//     if (!code) return 'Untitled';
	//     return code.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
	// }

	// Resolve title: handles plain strings and multilingual objects { en: '...', fr: '...' }
	$: displayTitle = (() => {
		const t = option.title;
		let titleStr = option.test_code || 'Untitled';
		if (t) {
			if (typeof t === 'string') {
				titleStr = t;
			} else {
				titleStr = t[$locale] || t.en || t[Object.keys(t)[0]] || option.test_code || 'Untitled';
			}
		}
		return isSent ? `${titleStr} (Sent)` : titleStr;
	})();

	function handleClick() {
		if (isSent && !selected) return; // Prevent clicking on sent items in the available panel
		if (isSent && selected) return; // Prevent clicking on sent items in the selected panel (no deselect)

		if (selected) {
			dispatch('deselect');
		} else {
			dispatch('select');
		}
	}
</script>

<button
	on:click={handleClick}
	class="{bgClass} rounded-full px-4 py-1 h-min flex items-center gap-1 {textClass} {isSent
		? 'cursor-not-allowed opacity-70'
		: ''}"
>
	{#if isDownloaded}
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<polyline points="6 9 6 2 18 2 18 9"></polyline>
			<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
			<rect x="6" y="14" width="12" height="8"></rect>
		</svg>
	{/if}
	<div class="text-[0.75rem]">{displayTitle}</div>
	{#if selected}
		{#if !isSent}
			<div class="">-</div>
		{/if}
	{:else}
		<div class="">+</div>
	{/if}
</button>
