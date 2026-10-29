<script>
	import { createEventDispatcher } from 'svelte';
	const dispatch = createEventDispatcher();

	export let loading = false;
	export let size = 'large';
	export let bg = 'bg-white bg-opacity-20 backdrop-blur-sm';

	function handleRefresh() {
		if (!loading) {
			dispatch('refresh');
		}
	}
</script>

<button
	class="fixed inset-0 flex items-center justify-center z-50 {loading ? 'visible' : 'invisible'}"
	on:click={handleRefresh}
>
	<div class="absolute inset-0 {bg}"></div>
	<div class="relative z-10 flex flex-col items-center">
		<svg
			class="animate-spin"
			width={size === 'small' ? '100' : '200'}
			height={size === 'small' ? '100' : '200'}
			viewBox="0 0 24 24"
			fill="none"
			stroke="#02755e"
			stroke-width="1"
		>
			<path
				class="stroke-[#b6d2d0]"
				d="M12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2Z"
			/>
			<path
				class=" animate-trim"
				d="M12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2Z"
				stroke-dasharray="60"
				stroke-linecap="round"
			/>
		</svg>
	</div>
</button>

<style>
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@keyframes trim {
		0% {
			stroke-dashoffset: 60;
		}
		50% {
			stroke-dashoffset: 30;
		}
		100% {
			stroke-dashoffset: 60;
		}
	}

	.animate-spin {
		animation: spin 1s linear infinite;
	}

	.animate-trim {
		animation: trim 1.5s ease-in-out infinite;
	}
</style>
