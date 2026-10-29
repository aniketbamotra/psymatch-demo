<script>
	import { goto } from '$app/navigation';
	import LoginForm from '$lib/components/auth/LoginForm.svelte';
	import { login } from '$lib/utils/auth';
	import { debugMode as t } from '$lib/i18n-debug';

	let error = '';
	let loading = false;

	async function redirectBasedOnRole(role) {
		console.log(`Attempting to redirect to /${role}`);
		try {
			await goto(`/${role}`);
			console.log(`Redirection to /${role} successful`);
		} catch (err) {
			console.error(`Error during redirection to /${role}:`, err);
			error = $t('Auth.Login.failed_redirect');
		}
	}

	async function handleLogin(event) {
		const { email, password, keepSignedIn, recaptchaToken } = event.detail;
		if (loading) return; // Prevent multiple submissions

		loading = true;
		error = '';

		try {
			const result = await login(email, password, keepSignedIn, recaptchaToken);
			if (result.success) {
				await redirectBasedOnRole(result.role);
			} else {
				error = result.error || $t('Auth.Login.error_generic');
			}
		} catch (err) {
			console.error('Error during login:', err);
			error = $t('Auth.Login.error_unexpected');
		} finally {
			loading = false;
		}
	}
</script>

<div
	class="relative container mx-auto p-[2rem] h-full z-10 lg:p-[5rem] flex flex-col lg:justify-center"
>
	<a
		href="/login/admin"
		class="absolute bottom-10 right-4 lg:block hidden text-sm text-Success hover:text-Success_Dark"
		>{$t('Auth.Login.admin_link')}</a
	>
	<h1 class="text-[1.5rem] font-[600] mb-4">{$t('Auth.Login.title')}</h1>
	<LoginForm on:submit={handleLogin} {loading} />
	{#if error}
		<p class="text-red-500 mt-4">{error}</p>
	{/if}
</div>
