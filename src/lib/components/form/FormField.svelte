<script>
	import { createEventDispatcher } from 'svelte';
	import Eye from '$lib/components/feather/eye.svelte';
	import EyeOff from '$lib/components/feather/eye-off.svelte';
	import IconRenderer from '$lib/components/IconRenderer.svelte';
	export let type = 'text';
	export let value = '';
	export let placeholder = '';
	export let name = '';
	export let required = false;
	export let disabled = false;
	export let class_ = ''; // For additional classes
	let password = false;
	if (type === 'password') {
		password = true;
	}
	const dispatch = createEventDispatcher();
	function passDisplay() {
		type = type === 'password' ? 'text' : 'password';
	}
	function handleInput(event) {
		value = event.target.value;
		console.log(`FormField input (${name}):`, type === 'password' ? '********' : value);
		dispatch('input', value);
	}

	$: {
		console.log(`FormField value changed (${name}):`, type === 'password' ? '********' : value);
	}
</script>

<div class="self-stretch flex-col justify-start items-start gap-1 flex">
	<div
		class="self-stretch px-5 py-3 bg-High-fed-white rounded-[0.5625rem] justify-start items-center gap-2 inline-flex {class_}"
	>
		<input
			{type}
			{value}
			{placeholder}
			{name}
			{required}
			{disabled}
			on:input={handleInput}
			class="grow shrink basis-0 text-Gray_Dark text-base font-light leading-snug bg-transparent outline-none border-none focus:ring-0 px-0 {class_}"
		/>
		{#if password}
			<button class="w-[1.3125rem] text-Gray_Dark" on:click={passDisplay} type="button">
				<IconRenderer>
					<svelte:component this={type === 'password' ? Eye : EyeOff} />
				</IconRenderer>
			</button>
		{/if}
	</div>
</div>
