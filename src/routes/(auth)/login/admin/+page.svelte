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
			error = `Failed to redirect to ${role} page. Please try again.`;
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
				error = result.error || 'Login failed. Please try again.';
			}
		} catch (err) {
			console.error('Error during login:', err);
			error = 'An error occurred. Please try again.';
		} finally {
			loading = false;
		}
	}
</script>

<div class="container mx-auto p-[2rem] h-full z-10 lg:p-[5rem] flex flex-col lg:justify-center">
	<h1 class="text-[1.5rem] font-[600] mb-4">{$t('Auth.Login.admin_title')}</h1>
	<LoginForm on:submit={handleLogin} {loading} isAdmin={true} />
	{#if error}
		<p class="text-red-500 mt-4">{error}</p>
	{/if}
</div>
