<script>
	import { createEventDispatcher } from 'svelte';
	import FormGroup from '../form/FormGroup.svelte';
	import Button from '../buttons/Button.svelte';
	import ReCaptcha from '../common/ReCaptcha.svelte';
	import { debugMode as t } from '$lib/i18n-debug';
	import { locale } from '$lib/i18n';
	import { DEMO_MODE } from '$lib/demo/mode.js';
	import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '$lib/demo/accounts.js';

	const dispatch = createEventDispatcher();

	export let loading = false;
	export let isAdmin = false; // Helps determine the action for reCAPTCHA v3

	let email = '';
	let password = '';
	let keepSignedIn = false;
	let recaptchaToken = '';
	let recaptchaComponent;
	let recaptchaError = false;

	// Set the appropriate action for reCAPTCHA v3
	const recaptchaAction = isAdmin ? 'login_admin' : 'login';

	function handleSubmit(event) {
		event.preventDefault();

		// ... (keep recaptcha logical checks intact below, but we swap the body out to be complete)
		recaptchaToken = recaptchaComponent ? recaptchaComponent.getResponse() : '';

		if (recaptchaComponent) {
			recaptchaComponent.execute();
		}

		if (!recaptchaToken) {
			recaptchaError = true;
			return;
		}

		recaptchaError = false;
		dispatch('submit', {
			email,
			password,
			keepSignedIn,
			recaptchaToken,
			preferredLanguage: $locale
		});
	}

	function signInAs(account) {
		email = account.email;
		password = DEMO_PASSWORD;
		recaptchaToken = recaptchaComponent ? recaptchaComponent.getResponse() : '';
		dispatch('submit', { email, password, keepSignedIn, recaptchaToken, preferredLanguage: $locale });
	}

	function handleRecaptchaVerify(event) {
		recaptchaToken = event.detail.token;
		recaptchaError = false;
	}

	function handleRecaptchaError() {
		recaptchaToken = '';
		recaptchaError = true;
	}
</script>

<form on:submit|preventDefault={handleSubmit} class="flex flex-grow flex-col gap-6 lg:flex-grow-0">
	<!-- Invisible reCAPTCHA v3 -->
	<ReCaptcha
		bind:this={recaptchaComponent}
		action={recaptchaAction}
		on:verify={handleRecaptchaVerify}
		on:error={handleRecaptchaError}
	/>

	<FormGroup
		label={$t('Auth.Login.email_label')}
		type="email"
		name="email"
		placeholder={$t('Auth.Login.email_placeholder')}
		bind:value={email}
		class="bg-white"
	/>
	<FormGroup
		label={$t('Auth.Login.password_label')}
		type="password"
		name="password"
		placeholder="******************"
		bind:value={password}
		class="bg-white"
	/>

	<!-- Refactor -->
	<div class="flex justify-between mt-auto">
		<div class="flex items-center">
			<input
				type="checkbox"
				id="keepSignedIn"
				bind:checked={keepSignedIn}
				class="mr-2 rounded-[0.1875rem] h-4 w-4 border-black bg-[#ecedf2] text-black focus:ring-0"
			/>
			<label for="keepSignedIn" class="text-sm text-black">{$t('Auth.Login.remember_me')}</label>
		</div>
		<div>
			<a href={$locale === 'fr' ? '/forget-password/fr' : '/forget-password'} class="text-sm text-Success font-[600] underline decoration-dotted"
				>{$t('Auth.Login.forgot_password')}</a
			>
		</div>
	</div>

	{#if recaptchaError}
		<p class="text-red-500 text-sm">{$t('Auth.Login.recaptcha_error')}</p>
	{/if}

	<Button
		type="submit"
		{loading}
		label={$t('Auth.Login.submit_button')}
		loadingText={$t('Auth.Login.submit_loading')}>{$t('Auth.Login.submit_button')}</Button
	>

	{#if DEMO_MODE}
		<div class="rounded-lg border border-dashed border-Success p-4 text-sm">
			<p class="font-[600] mb-1">Demo accounts</p>
			<p class="text-gray-600 mb-3">
				All patients and data are fictional. Password for every account: <code>{DEMO_PASSWORD}</code>
			</p>
			<div class="flex flex-col gap-2">
				{#each DEMO_ACCOUNTS as account}
					<button
						type="button"
						class="flex justify-between gap-2 rounded-md bg-white px-3 py-2 text-left hover:bg-gray-50 disabled:opacity-50"
						disabled={loading}
						on:click={() => signInAs(account)}
					>
						<span class="font-[600]">{account.label}</span>
						<span class="text-gray-500 truncate">{account.email}</span>
					</button>
				{/each}
			</div>
		</div>
	{/if}
</form>
