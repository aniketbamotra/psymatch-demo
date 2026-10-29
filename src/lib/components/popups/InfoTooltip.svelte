<script>
	import Pill from '../form/Pill.svelte';

	export let visible = false;
	export let position = 'bottom'; // 'top', 'bottom', 'left', 'right'

	// Mock data for demonstration
	const notDownloadedExample = {
		title: 'Test Name',
		status: 'completed'
	};

	const downloadedExample = {
		title: 'Test Name',
		status: 'downloaded'
	};
</script>

{#if visible}
	<div
		class="absolute z-50 {position === 'bottom' ? 'top-full mt-2' : ''} {position === 'top'
			? 'bottom-full mb-2'
			: ''} {position === 'left' ? 'right-full mr-2' : ''} {position === 'right'
			? 'left-full ml-2'
			: ''}"
	>
		<!-- Triangle arrow pointing up -->
		{#if position === 'bottom'}
			<div class="absolute -top-2 left-2 w-4 h-4 bg-[#EEF2F1] transform rotate-45 shadow-lg"></div>
		{/if}

		<div class="relative bg-[#EEF2F1] rounded-lg shadow-lg p-4 min-w-[280px] max-w-[320px]">
			<!-- Not Downloaded Section -->
			<div class="flex items-start gap-6 mb-3">
				<div class="text-sm text-gray-700 font-normal">Not Downloaded</div>
				<div class="">
					<Pill option={notDownloadedExample} />
				</div>
			</div>

			<!-- Downloaded Section -->
			<div class="flex items-start gap-3">
				<div class="flex-shrink-0 w-[100px] text-sm text-gray-700 font-normal">Downloaded</div>
				<div class="flex-1">
					<Pill option={downloadedExample} />
				</div>
			</div>
		</div>
	</div>
{/if}
