<script>
	import { createEventDispatcher } from 'svelte';
	import FormField from './FormField.svelte';

	export let label;
	export let placeholder = '';
	export let type = 'text';
	export let name = '';
	export let value = '';
	export let required = false;
	export let error = '';
	export let disabled = false;
	export let class_ = 'bg-white'; // For additional classes
	$: console.log('error:', error);
	const dispatch = createEventDispatcher();

	function handleInput(event) {
		value = event.detail;
		console.log(`FormGroup input (${name}):`, type === 'password' ? '********' : value);
		dispatch('input', value);
	}

	$: {
		console.log(`FormGroup value changed (${name}):`, type === 'password' ? '********' : value);
	}
</script>

<div class="self-stretch h-20 flex-col justify-start w-full items-start gap-3 flex">
	<div class="self-stretch text-black text-sm font-normal leading-none">
		{label}
		{#if required}
			<span class="text-red-500">*</span>
			{#if error}
				<span class="text-red-500 text-sm mb-10">{error}</span>
			{/if}
		{/if}
	</div>
	<FormField
		{placeholder}
		{type}
		{name}
		{required}
		{disabled}
		class_={error ? 'border-red-500 ' + class_ : class_}
		bind:value
		on:input={handleInput}
	/>
</div>
