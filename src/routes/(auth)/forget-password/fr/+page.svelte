<script>
	import ForgetForm from '$lib/components/auth/ForgetForm.svelte';
	import Card from '$lib/components/info/Card.svelte';
	import { debugMode as t } from '$lib/i18n-debug';

	let loading = false;
	let success = false;
	let error = false;

	function handleSuccess() {
		error = false;
		success = true;
	}
	function handleError() {
		success = false;
		error = true;
	}
</script>

<div
	class="relative flex flex-col justify-between container mx-auto p-[1.5rem] h-[100dvh] lg:h-auto lg:p-[5rem] lg:justify-center"
>
	<h1 class="text-[1.5rem] font-[600] mb-4">{$t('Auth.Forget.title')}</h1>

	<p class="text-gray-600 mb-6">{$t('Auth.Forget.description')}</p>
	<ForgetForm {loading} {success} {error} on:error={handleError} on:success={handleSuccess} />
	{#if success}
		<Card
			main={$t('Auth.Forget.success_title')}
			body={$t('Auth.Forget.success_message')}
			state="success"
		/>
	{/if}
	{#if error}
		<Card
			main={$t('Auth.Forget.error_title')}
			body={$t('Auth.Forget.error_message')}
			state="error"
		/>
	{/if}
</div>
