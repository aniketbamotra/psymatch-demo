<script>
	import { createEventDispatcher } from 'svelte';
	import Button from '../buttons/Button.svelte';
	import FormGroup from '../form/FormGroup.svelte';
	import Cross from './Cross.svelte';
	import { navState } from '$lib/stores';
	import * as api from '$lib/api';
	import { debugMode as t } from '$lib/i18n-debug';

	const dispatch = createEventDispatcher();

	let formData = {
		fullName: '',
		email: '',
		gender: '',
		isDirector: false
	};

	let formErrors = {};
	let loading = false;
	let success = false;
	let emailError = '';

	$: genderOptions = [
		{ value: '', label: $t('Popups.AddAdmin.select_gender') },
		{ value: 'He', label: $t('Popups.AddAdmin.gender_options.he') },
		{ value: 'She', label: $t('Popups.AddAdmin.gender_options.she') },
		{ value: 'They', label: $t('Popups.AddAdmin.gender_options.they') },
		{ value: 'Ze', label: $t('Popups.AddAdmin.gender_options.ze') }
	];

	async function checkEmail(email) {
		try {
			const response = await api.get(`/api/user?email=${email}`);
			if (response.ok) {
				const data = await response.json();
				if (data.exists) {
					emailError = $t('Popups.AddAdmin.validation.email_exists');
					return false;
				}
			}
			emailError = '';
			return true;
		} catch (error) {
			console.error('Error checking email:', error);
			return false;
		}
	}

	async function validateForm() {
		formErrors = {};
		if (!formData.fullName)
			formErrors.fullName = $t('Popups.AddAdmin.validation.full_name_required');
		if (!formData.email) formErrors.email = $t('Popups.AddAdmin.validation.email_required');
		if (!formData.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/))
			formErrors.email = $t('Popups.AddAdmin.validation.email_invalid');
		if (!formData.gender) formErrors.gender = $t('Popups.AddAdmin.validation.gender_required');

		// Check if email exists
		if (formData.email && !formErrors.email) {
			const emailAvailable = await checkEmail(formData.email);
			if (!emailAvailable) {
				formErrors.email = emailError;
			}
		}

		return Object.keys(formErrors).length === 0;
	}

	function closeModal() {
		$navState = 'Home';
	}

	async function handleSubmit() {
		if (loading) return;
		const isValid = await validateForm();
		if (!isValid) return;

		try {
			loading = true;
			success = false;

			// Create admin user
			const response = await api.post('/api/user?createAdmin=true', {
				fullName: formData.fullName,
				email: formData.email,
				gender: formData.gender,
				userType: 'admin',
				isDirector: formData.isDirector
			});

			if (response.ok) {
				const newAdmin = await response.json();

				// Send password reset email
				await api.post('/api/reset-password', {
					email: formData.email,
					isNewUser: true,
					isAdmin: true,
					isDirector: formData.isDirector
				});

				dispatch('adminAdded', newAdmin);
				success = true;

				// Wait for 3 seconds to show success state
				await new Promise((resolve) => setTimeout(resolve, 3000));
				closeModal();
			} else {
				const data = await response.json();
				formErrors.submit = data.error || $t('Popups.AddAdmin.validation.create_error');
			}
		} catch (err) {
			console.error('Error creating admin:', err);
			formErrors.submit = $t('Popups.AddAdmin.validation.generic_error');
		} finally {
			loading = false;
		}
	}
</script>

<div class="flex">
	<h3 class="text-xl flex-grow font-semibold leading-relaxed">{$t('Popups.AddAdmin.title')}</h3>
	<button on:click={closeModal}>
		<Cross />
	</button>
</div>

<div class="flex flex-col gap-6">
	{#if formErrors.submit}
		<div class="bg-red-50 p-4 rounded-lg">
			<p class="text-sm text-red-800">{formErrors.submit}</p>
		</div>
	{/if}

	<FormGroup
		label={$t('Popups.AddAdmin.full_name_label')}
		placeholder={$t('Popups.AddAdmin.full_name_placeholder')}
		bind:value={formData.fullName}
		type="text"
		name="fullName"
		required={true}
		error={formErrors.fullName}
		class_="bg-[#eef2f1]"
	/>

	<FormGroup
		label={$t('Popups.AddAdmin.email_label')}
		placeholder={$t('Popups.AddAdmin.email_placeholder')}
		bind:value={formData.email}
		type="email"
		name="email"
		required={true}
		error={formErrors.email}
		class_="bg-[#eef2f1]"
	/>

	<div class="self-stretch h-20 flex-col justify-start items-start gap-3 flex">
		<div class="self-stretch text-black text-sm font-normal leading-none">
			{$t('Popups.AddAdmin.gender_label')}
			{#if formErrors.gender}
				<span class="text-red-500 text-sm">{formErrors.gender}</span>
			{/if}
		</div>
		<select
			class="w-full px-5 py-5 text-Gray_Dark rounded-[0.5625rem] bg-[#eef2f1] text-base font-light leading-snug outline-none border-none focus:ring-0 {formErrors.gender
				? 'border-red-500'
				: ''}"
			bind:value={formData.gender}
			required
		>
			{#each genderOptions as option, i}
				<option class={i > 0 ? 'text-black' : 'text-Gray_Dark'} value={option.value}
					>{option.label}</option
				>
			{/each}
		</select>
	</div>

	<div class="flex items-center">
		<input
			type="checkbox"
			bind:checked={formData.isDirector}
			class="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
		/>
		<label class="ml-2 block text-sm text-gray-900">{$t('Popups.AddAdmin.make_director')}</label>
	</div>

	<div class="flex justify-end mt-4">
		<Button
			onClick={handleSubmit}
			{loading}
			loadingText={$t('Popups.AddAdmin.submit_loading')}
			{success}
			successText={$t('Popups.AddAdmin.submit_success')}
		>
			{$t('Popups.AddAdmin.submit_button')}
		</Button>
	</div>
</div>

<style>
	/* Works on Firefox */
	* {
		scrollbar-width: thin;
		scrollbar-color: rgb(88, 88, 88) #ffffff00;
	}

	/* Works on Chrome, Edge, and Safari */
	*::-webkit-scrollbar {
		width: 8px;
	}

	*::-webkit-scrollbar-track {
		background: #ffffff00;
	}

	*::-webkit-scrollbar-thumb {
		background-color: rgb(88, 88, 88);
		border-radius: 100px;
	}
</style>
