<script>
	import { debugMode as t } from '$lib/i18n-debug';
</script>

<div class="h-20 px-6 py-5 bg-gray-100 rounded-lg justify-start items-center gap-2.5 inline-flex">
	<div class="flex-grow">
		<div class="text-black text-base font-medium font-['Inter Display'] leading-tight">
			{$t('Popups.NewTest.title')}
		</div>
		<div class="text-black text-sm font-normal font-['Inter Display'] leading-tight">
			{$t('Popups.NewTest.allotted_on')} 02 September 2024
		</div>
	</div>
	<a
		href="/id"
		class="text-Success block text-sm underline underline-offset-4 font-semibold font-['Inter Display'] leading-tight"
	>
		{$t('Questionnaire.Card.start')}
	</a>
</div>
