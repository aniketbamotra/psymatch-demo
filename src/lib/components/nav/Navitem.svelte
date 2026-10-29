<script>
	import { navState } from '$lib/stores';
	import { goto } from '$app/navigation';
	import { logout } from '$lib/utils/auth';
	import IconRenderer from '$lib/components/IconRenderer.svelte';

	export let label,
		active,
		disabled = false,
		href = null,
		isLogout = false;

	async function onNavItemClick(label, disabled, href) {
		if (disabled) return;

		if (isLogout || label === 'Logout') {
			try {
				const success = await logout();
				if (!success) {
					console.error('Logout failed');
				}
			} catch (error) {
				console.error('Error during logout:', error);
			}
		} else if (href) {
			goto(href);
		} else {
			console.log('Setting navState to:', label);
			navState.set(label);
			console.log('Current navState:', $navState);
		}
	}
</script>

<button
	on:click={() => onNavItemClick(label, disabled, href)}
	{disabled}
	class="justify-start items-center gap-1 lg:gap-2 flex-col lg:flex-row flex {!active && !disabled
		? 'text-black hover:text-Success'
		: ''} {disabled
		? 'text-Gray_Dark'
		: 'text-Success'} transition-all duration-200 ease-out {disabled
		? 'cursor-not-allowed '
		: 'cursor-pointer hover:text-Success'}"
>
	<IconRenderer size="large">
		<slot></slot>
	</IconRenderer>
	<div class="text-sm lg:text-base pt-[0.1rem] font-medium leading-tight">{label}</div>
</button>
