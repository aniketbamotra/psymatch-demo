<script>
	import NewTest from './NewTest.svelte';
	import Cross from './Cross.svelte';
	import { debugMode as t } from '$lib/i18n-debug';
	let update = false;
</script>

<div class="flex">
	<h3 class="text-xl flex-grow font-semibold leading-relaxed">{$t('Popups.Updates.title')}</h3>
	<Cross />
</div>

{#if update}
	<NewTest testId={2} label="CISM™ Adult Biographical Questionnaire" date="24 September 2024" />
	<NewTest testId={2} label="CISM™ Adult Biographical Questionnaire" date="24 September 2024" />
	<NewTest testId={2} label="CISM™ Adult Biographical Questionnaire" date="24 September 2024" />
{:else}
	<div
		class="h-full text-Success opacity-40 italic text-2xl justify-center flex flex-grow font-bold items-center text-center mb-20"
	>
		{@html $t('Popups.Updates.no_updates')}
	</div>
{/if}
