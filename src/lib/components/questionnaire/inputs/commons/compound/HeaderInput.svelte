<script>
	import { createEventDispatcher } from 'svelte';
	import Button from '../../../../buttons/Button.svelte';
	const dispatch = createEventDispatcher();

	export let value = '';
	export let error = null;
	export let loading = false;
	export let success = false;
	export let required = false;
	export let isValid = true; // Always valid since it's just a header
	export let text = '';

	// Since this is just a header with instructions, we'll set a default value
	$: value = text || '';
	isValid = true; // Always valid since it's just a header
	function handleSubmit() {
		// For header type, we just pass the text as the value
		dispatch('submit', { value });
	}
</script>

<div class="flex flex-col space-y-6 max-w-3xl"></div>
