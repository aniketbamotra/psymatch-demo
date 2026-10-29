<script>
	import { createEventDispatcher } from 'svelte';
	import FormGroup from '../form/FormGroup.svelte';
	import Button from '../buttons/Button.svelte';
	import ReCaptcha from '../common/ReCaptcha.svelte';
	import { debugMode as t } from '$lib/i18n-debug';
	import { locale } from '$lib/i18n';

	const dispatch = createEventDispatcher();

	export let loading = false;
	export let success = false;
	export let error = false;
	let email = '';
	let recaptchaToken = '';
	let recaptchaComponent;
	let recaptchaError = false;
	let errorMessage = '';
	let successMessage = '';

	// Set the action for reCAPTCHA v3
	const recaptchaAction = 'forget_password';

	async function handleSubmit(event) {
		event.preventDefault();
		loading = true;

		// Check if email is provided
		if (!email) {
			error = true;
			dispatch('error');
			loading = false;
			return;
		}

		// Get current token and execute reCAPTCHA for a fresh token
		recaptchaToken = recaptchaComponent ? recaptchaComponent.getResponse() : '';

		if (recaptchaComponent) {
			recaptchaComponent.execute();
		}

		if (!recaptchaToken) {
			recaptchaError = true;
			loading = false;
			return;
		}

		recaptchaError = false;

		try {
			const response = await fetch('/api/reset-password', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ email, recaptchaToken })
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Failed to send reset link');
			}

			success = true;
			dispatch('success', { email });
		} catch (error) {
			error = true;
			dispatch('error', { email });
			success = false;
		} finally {
			loading = false;
		}
	}
</script>

<form on:submit={handleSubmit} class="flex flex-grow flex-col gap-6 lg:flex-grow-0 justify-between">
	<FormGroup
		label={$t('Auth.Forget.email_label')}
		type="email"
		name="email"
		placeholder={$t('Auth.Forget.email_placeholder')}
		bind:value={email}
		class="bg-white"
	/>

	<!-- Invisible reCAPTCHA v3 -->
	<ReCaptcha
		bind:this={recaptchaComponent}
		action={recaptchaAction}
		on:verify={(e) => {
			recaptchaToken = e.detail.token;
			recaptchaError = false;
		}}
		on:error={() => {
			recaptchaToken = '';
			recaptchaError = true;
		}}
	/>

	{#if recaptchaError}
		<p class="text-red-500 text-sm">{$t('Auth.Forget.recaptcha_error')}</p>
	{/if}

	<div class="flex flex-col gap-6 mt-auto">
		<div class="flex justify-end">
			<div>
				<a href={$locale === 'fr' ? '/login/fr' : '/login'} class="text-sm text-Success font-[600] underline decoration-dotted"
					>{$t('Auth.Forget.back_to_login')}</a
				>
			</div>
		</div>

		<Button
			type="submit"
			{loading}
			{success}
			label={$t('Auth.Forget.submit_button')}
			loadingText={$t('Auth.Forget.submit_loading')}
			successText={$t('Auth.Forget.submit_success')}
		/>
	</div>

</form>
