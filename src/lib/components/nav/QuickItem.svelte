<script>
	import { navState } from '$lib/stores';
	import { goto } from '$app/navigation';
	import IconRenderer from '$lib/components/IconRenderer.svelte';
	export let label,
		active,
		disabled = false,
		href = null;
	const onNavItemClick = (label, disabled, href) => {
		if (!disabled) {
			if (label === 'Logout') {
				goto('/login');
			} else if (href) {
				goto(href);
			} else {
				console.log('Setting navState to:', label);
				navState.set(label);
				console.log('Current navState:', $navState);
			}
		}
	};
</script>

<button
	on:click={() => onNavItemClick(label, disabled, href)}
	{disabled}
	class="justify-start h-[2rem] group items-center gap-1 lg:gap-2 rounded-full after:bg-black after:absolute after:h-full after:transition-all after:duration-200 after:ease-out after:left-0 overflow-hidden after:-z-10 relative pr-2 flex-col lg:flex-row flex {!active &&
	!disabled
		? 'text-black hover:text-white after:w-0 after:hover:w-full'
		: ''} {disabled ? 'text-Gray_Dark' : ''} {active
		? 'text-white after:w-full'
		: ''} transition-all duration-200 ease-out {disabled
		? 'cursor-not-allowed '
		: 'cursor-pointer '}"
>
	<IconRenderer
		size="large_2"
		class_="group-hover:bg-white rounded-full {active ? 'bg-white' : ''}"
	>
		<slot></slot>
	</IconRenderer>
	<div class="text-sm lg:text-[0.9rem] pt-[0.1rem] font-medium leading-tight">{label}</div>
</button>
