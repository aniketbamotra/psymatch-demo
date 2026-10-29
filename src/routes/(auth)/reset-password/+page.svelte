<script>
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import FormGroup from '$lib/components/form/FormGroup.svelte';
	import Button from '$lib/components/buttons/Button.svelte';
	import Referesh from '$lib/components/common/Refresh.svelte';
	import { checkPasswordStrength } from '$lib/utils/passwordStrength';
	import * as api from '$lib/api';
	import Refresh from '../../../lib/components/common/Refresh.svelte';
	import ReCaptcha from '$lib/components/common/ReCaptcha.svelte';
	import { debugMode as t } from '$lib/i18n-debug';
	import { locale } from '$lib/i18n';

	let password = '';
	let confirmPassword = '';
	let error = '';
	let passwordStrength = null;
	let loading = false;
	let recaptchaToken = '';
	let recaptchaComponent;
	let recaptchaComponentRegen;
	let recaptchaError = false;
	$: if (password) {
		passwordStrength = checkPasswordStrength(password);
	}
	let success = false;
	let tokenExpired = false;
	let emailSent = false;
	let userEmail = '';
	let userName = '';
	let loading1 = true;
	let regenerateLoading = false;

	$: token = $page.url.searchParams.get('token');
	$: isNewUser = $page.url.searchParams.get('new') === 'true';

	async function fetchUserInfo() {
		if (!token) return;

		try {
			const response = await fetch(`/api/reset-password/user?token=${token}`);
			const data = await response.json();
			console.log('User info:', data);
			if (response.ok) {
				userEmail = data.email;
				userName = data.name;
				if (data.language) {
					locale.set(data.language);
					// Set locale cookie so auth pages stay in the right language
					document.cookie = `locale=${data.language}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
				}
			} else {
				error = data.error;
				tokenExpired = data.error.includes('expired');
			}
		} catch (err) {
			console.error('Error fetching user info:', err);
			error = $t('Auth.ResetPassword.error_fetch_user');
		} finally {
			loading1 = false;
		}
	}

	function redactEmail(email) {
		const [username, domain] = email.split('@');
		const redactedUsername = username.slice(0, 2) + '*'.repeat(username.length - 2);
		const [domainName, ext] = domain.split('.');
		const redactedDomain = domainName.slice(0, 1) + '*'.repeat(domainName.length - 1);
		return `${redactedUsername}@${redactedDomain}.${ext}`;
	}

	async function regenerateToken() {
		regenerateLoading = true;

		// Get current token and execute reCAPTCHA for a fresh token
		recaptchaToken = recaptchaComponentRegen ? recaptchaComponentRegen.getResponse() : '';

		if (recaptchaComponentRegen) {
			recaptchaComponentRegen.execute();
		}

		if (!recaptchaToken) {
			recaptchaError = true;
			regenerateLoading = false;
			return;
		}

		recaptchaError = false;

		try {
			const response = await api.post('/api/reset-password', {
				token,
				regenerate: true,
				recaptchaToken
			});

			if (response.ok) {
				const data = await response.json();
				userEmail = data.email;
				emailSent = true;
			} else {
				const data = await response.json();
				error = data.error || $t('Auth.ResetPassword.error_regenerate');
			}
		} catch (err) {
			console.error('Error:', err);
			error = $t('Auth.ResetPassword.error_process');
		} finally {
			regenerateLoading = false;
		}
	}

	async function handleSubmit() {
		loading = true;
		if (!password || !confirmPassword) {
			error = $t('Auth.ResetPassword.error_fill_all');
			loading = false;
			return;
		}

		if (password !== confirmPassword) {
			error = $t('Auth.ResetPassword.error_mismatch');
			loading = false;
			return;
		}

		const strength = checkPasswordStrength(password);
		if (!strength.isStrong) {
			error = strength.message;
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
			const response = await api.post('/api/reset-password', {
				password,
				token,
				recaptchaToken
			});

			if (response.ok) {
				loading = false;
				success = true;

				setTimeout(() => {
					goto($locale === 'fr' ? '/login/fr' : '/login');
				}, 3000);
			} else {
				const data = await response.json();
				if (data.error === 'Password reset token is invalid or has expired') {
					tokenExpired = true;
					error = data.error;
					loading = false;
				} else {
					error = data.error || $t('Auth.ResetPassword.error_reset');
					loading = false;
				}
			}
		} catch (err) {
			console.error('Error:', err);
			error = 'Error processing request';
			loading = false;
		}
	}

	onMount(fetchUserInfo);
</script>

<div class="container mx-auto lg:p-[5rem] z-10 relative">
	<Refresh loading={loading1} on:refresh={fetchUserInfo} />
	<div class="w-full space-y-8 p-8 rounded-lg">
		<div>
			<h2 class="mt-6 text-left text-3xl font-extrabold text-gray-900">
				{#if emailSent}
					{$t('Auth.ResetPassword.title_token_regenerated')}
				{:else if tokenExpired}
					{$t('Auth.ResetPassword.title_token_expired')}
				{:else}
					{isNewUser ? $t('Auth.ResetPassword.title_create') : $t('Auth.ResetPassword.title_reset')}
				{/if}
			</h2>
			{#if isNewUser && !tokenExpired && !emailSent}
				<p class="mt-2 text-left text-sm text-gray-600">
					{$t('Auth.ResetPassword.welcome_message')}
				</p>
			{/if}
		</div>
		{#if emailSent}
			<div class="rounded-md bg-green-50 p-4">
				<div class="flex">
					<div class="flex-shrink-0">
						<svg
							class="h-5 w-5 text-green-400"
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 20 20"
							fill="currentColor"
						>
							<path
								fill-rule="evenodd"
								d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
								clip-rule="evenodd"
							/>
						</svg>
					</div>
					<div class="ml-3">
						<p class="text-sm font-medium text-green-800">
							{$t('Auth.ResetPassword.token_regenerated_message')}
							{redactEmail(userEmail)}
						</p>
					</div>
				</div>
			</div>
		{:else if tokenExpired}
			<div class="mt-8 space-y-6">
				<div class="rounded-md bg-yellow-50 p-4">
					<div class="flex">
						<div class="flex-shrink-0">
							<svg
								class="h-5 w-5 text-yellow-400"
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 20 20"
								fill="currentColor"
							>
								<path
									fill-rule="evenodd"
									d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
									clip-rule="evenodd"
								/>
							</svg>
						</div>
						<div class="ml-3">
							<p class="text-sm font-medium text-yellow-800">
								{$t('Auth.ResetPassword.token_expired_message')}
							</p>
						</div>
					</div>
				</div>

				<!-- Invisible reCAPTCHA v3 for token regeneration -->
				<ReCaptcha
					bind:this={recaptchaComponentRegen}
					action="regenerate_token"
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
					<p class="text-red-500 text-sm">{$t('Auth.ResetPassword.recaptcha_error')}</p>
				{/if}

				<div>
					<Button
						onClick={regenerateToken}
						type="button"
						label={$t('Auth.ResetPassword.generate_link_button')}
						loading={regenerateLoading}
						loadingText={$t('Auth.ResetPassword.generating_link')}
					/>
				</div>
			</div>
		{:else}
			<form
				class="mt-8 flex flex-col gap-8 justify-stretch"
				on:submit|preventDefault={handleSubmit}
			>
				{#if userEmail && userName}
					<div class="flex flex-col lg:flex-row w-full justify-items-stretch gap-6">
						<FormGroup
							label={$t('Auth.ResetPassword.name_label')}
							type="text"
							name="Name"
							disabled={true}
							class_="bg-gray-100"
							placeholder={$t('Auth.ResetPassword.new_password_placeholder')}
							bind:value={userName}
						/>
						<FormGroup
							label={$t('Auth.ResetPassword.email_label')}
							type="text"
							name="Email"
							disabled={true}
							class_="bg-gray-100"
							placeholder={$t('Auth.ResetPassword.new_password_placeholder')}
							bind:value={userEmail}
						/>
					</div>
				{/if}
				<div class="space-y-2">
					<FormGroup
						label={$t('Auth.ResetPassword.new_password_label')}
						type="password"
						name="password"
						placeholder={$t('Auth.ResetPassword.new_password_placeholder')}
						bind:value={password}
					/>

					<div class="text-sm">
						<div class="flex items-center gap-2 mb-1">
							<div class="h-1.5 flex-1 rounded-full bg-gray-200 overflow-hidden">
								<div
									class="h-full transition-all duration-300 {passwordStrength?.score === 5
										? 'bg-Success'
										: passwordStrength?.score >= 4
											? 'bg-green-500'
											: passwordStrength?.score >= 3
												? 'bg-yellow-500'
												: 'bg-red-500'}"
									style="width: {(passwordStrength?.score || 0) * 20}%"
								></div>
							</div>
							<span
								class="{passwordStrength?.isStrong ? 'text-Success' : 'text-red-500'} font-medium"
							>
								{#if password}
									{#if passwordStrength?.isStrong}
										{$t('Auth.ResetPassword.password_strength_strong')}
									{:else}
										{passwordStrength?.message}
									{/if}
								{:else}
									{$t('Auth.ResetPassword.password_strength_enter')}
								{/if}
							</span>
						</div>
					</div>
				</div>

				<FormGroup
					label={$t('Auth.ResetPassword.confirm_password_label')}
					type="password"
					name="confirmPassword"
					placeholder={$t('Auth.ResetPassword.confirm_password_placeholder')}
					bind:value={confirmPassword}
				/>

				<!-- Invisible reCAPTCHA v3 for password reset -->
				<ReCaptcha
					bind:this={recaptchaComponent}
					action="forget_password"
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
					<p class="text-red-500 text-sm">reCAPTCHA verification failed. Please try again.</p>
				{/if}

				<Button
					type="submit"
					onClick={handleSubmit}
					{loading}
					{success}
					successText={$t('Auth.ResetPassword.success_message')}
					label={isNewUser
						? $t('Auth.ResetPassword.submit_create')
						: $t('Auth.ResetPassword.submit_reset')}
					loadingText={$t('Auth.ResetPassword.submitting')}
				></Button>
			</form>
			{#if error}
				<p class="mt-4 text-sm text-red-500">{error}</p>
			{/if}
		{/if}
	</div>
</div>
