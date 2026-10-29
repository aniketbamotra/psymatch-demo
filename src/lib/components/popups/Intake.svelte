<script>
	import { onMount, getContext } from 'svelte';
	import { intakeForm, navState } from '$lib/stores';

	import { followupsStore } from '$lib/stores/followups';
	import FormGroup from '../form/FormGroup.svelte';
	import Button from '../buttons/Button.svelte';
	import Cross from './Cross.svelte';
	import MultiSelector from '../form/MultiSelector.svelte';
	import LanguageSelector from '../form/LanguageSelector.svelte';
	import * as api from '$lib/api';
	import { debugMode as t } from '$lib/i18n-debug';
	import { getLocalizedText, normalizeLanguage, languageLabel, DEFAULT_LANGUAGE } from '$lib/utils/language';

	// Helper to ensure title is always a string
	function formatTitle(title) {
		if (!title) return 'Untitled';
		if (typeof title === 'string') return title;
		if (typeof title === 'object') {
			return title.en || Object.values(title)[0] || 'Untitled';
		}
		return String(title);
	}

	let loading = false;
	let success = false;
	// Demo mode: emails are not sent, so the new patient's setup link is shown here
	let demoSetupLink = '';
	let questionnaires = []; // All available tests
	let previouslyAllocatedTestIds = []; // IDs of tests already assigned to the user
	let fileMakerIdError = '';
	let emailError = '';
	let loadingQuestionnaires = true;
	let questionnairesError = '';
	let formErrors = {};
	let formData = {
		gender: '',
		firstName: '',
		lastName: '',
		email: '',
		phoneNumber: '',
		preferredCommunication: '',
		// Preferred language is mandatory and pre-selected as English — it drives the
		// AI-report variant, the welcome email template and the TOS wording, and an
		// empty value fails the Mongo enum outright. See utils/language.js.
		preferredLanguage: DEFAULT_LANGUAGE,
		intakeNote: '',
		fileMakerId: '',
		selectedQuestionnaires: []
	};

	// Predefined sets
	/** @type {{ _id: string, set_name: string, interviews: any[] }[]} */
	let predefinedSets = [];
	let loadingSets = true;
	/** @type {string[]} — IDs of currently selected sets */
	let selectedSetIds = [];

	/**
	 * Returns true if every interview in the set is present in selectedQuestionnaires.
	 * Used to show a set as "selected" state.
	 */
	function isSetSelected(set) {
		if (!set.interviews?.length) return false;
		return set.interviews.every((iv) =>
			formData.selectedQuestionnaires.some((q) => q.id === iv._id.toString())
		);
	}

	/**
	 * Returns true if SOME (but not all) interviews of a set are selected — partial state.
	 */
	function isSetPartial(set) {
		if (!set.interviews?.length) return false;
		const count = set.interviews.filter((iv) =>
			formData.selectedQuestionnaires.some((q) => q.id === iv._id.toString())
		).length;
		return count > 0 && count < set.interviews.length;
	}

	function toggleSet(set) {
		const setId = set._id.toString();
		if (selectedSetIds.includes(setId)) {
			// Deselect: remove all interviews in this set, EXCEPT those present in OTHER selected sets
			const setInterviewIds = set.interviews.map((iv) => iv._id.toString());

			const otherSelectedSets = predefinedSets.filter(
				(s) => selectedSetIds.includes(s._id.toString()) && s._id.toString() !== setId
			);

			const keepIds = new Set();
			otherSelectedSets.forEach((s) => {
				if (s.interviews) {
					s.interviews.forEach((iv) => keepIds.add(iv._id.toString()));
				}
			});

			formData.selectedQuestionnaires = formData.selectedQuestionnaires.filter(
				(q) => !setInterviewIds.includes(q.id) || keepIds.has(q.id)
			);
		} else {
			// Select: add interviews not already selected
			const toAdd = set.interviews
				.filter((iv) => !formData.selectedQuestionnaires.some((q) => q.id === iv._id.toString()))
				.map((iv) => ({ id: iv._id.toString(), title: formatTitle(iv.title) }));
			formData.selectedQuestionnaires = [...formData.selectedQuestionnaires, ...toAdd];
		}
	}

	// Re-evaluate selected sets whenever selectedQuestionnaires changes.
	$: selectedSetIds = predefinedSets
		.filter((set) => {
			if (!set?.interviews?.length) return false;
			return set.interviews.every((iv) =>
				formData.selectedQuestionnaires.some((q) => q.id === iv._id.toString())
			);
		})
		.map((s) => s._id.toString());

	$: genderOptions = [
		{ value: '', label: $t('Popups.Intake.select_gender') },
		{ value: 'He', label: 'He' },
		{ value: 'She', label: 'She' },
		{ value: 'They', label: 'They' }
	];

	$: communicationOptions = [
		{ value: 'Email', label: 'Email' },
		{ value: 'Phone', label: 'Phone' },
		{ value: 'Both', label: 'Both Email and Phone' }
	];

	$: currentStep = $intakeForm.step;
	$: {
		// Update store whenever form data changes
		intakeForm.updateFormData(formData);
	}

	onMount(async () => {
		// Fetch available questionnaires
		try {
			loadingQuestionnaires = true;
			const response = await api.get('/api/available-questionnaires');
			if (response.ok) {
				const data = await response.json();
				questionnaires = Array.isArray(data) ? data : [];
			} else {
				const error = await response.json();
				questionnairesError = error.message || 'Failed to load Interviews';
			}
		} catch (error) {
			console.error('Error fetching Interviews:', error);
			questionnairesError = 'Failed to load Interviews';
		} finally {
			loadingQuestionnaires = false;
		}

		// Fetch predefined sets (active sets with populated interviews)
		try {
			loadingSets = true;
			const res = await api.get('/api/set/read?mode=assign');
			if (res.ok) {
				const data = await res.json();
				predefinedSets = data.sets ?? [];
			}
		} catch (err) {
			console.error('Error fetching predefined sets:', err);
		} finally {
			loadingSets = false;
		}
	});

	async function checkFileMakerId(id) {
		try {
			const response = await api.get(`/api/user?fileMakerId=${id}`);
			if (response.ok) {
				const data = await response.json();
				if (data.exists) {
					fileMakerIdError = 'This User ID already exists';
					return false;
				}
			}
			fileMakerIdError = '';
			return true;
		} catch (error) {
			console.error('Error checking User ID:', error);
			return false;
		}
	}

	async function checkEmail(id) {
		try {
			const response = await api.get(`/api/user?email=${id}`);
			if (response.ok) {
				const data = await response.json();
				console.log(data.exists);
				if (data.exists) {
					emailError = 'Same email in use already';
					// If the user exists, track what tests have been allocated so we can filter them from the MultiSelector
					try {
						const ulResponse = await api.get(`/api/unallocated-tests/${data.user._id}`);
						if (ulResponse.ok) {
							const unallocated = await ulResponse.json();
							// We know all the questionnaires from the global list, so anything NOT in unallocated has been allocated/sent
							const sentTests = questionnaires
								.filter((q) => !unallocated.some((ut) => ut._id.toString() === q._id.toString()))
								.map((q) => q._id.toString());

							previouslyAllocatedTestIds = sentTests;
							// Don't pre-populate selectedQuestionnaires with sent tests - they're filtered from the MultiSelector
							formData.selectedQuestionnaires = [];
						}
					} catch (e) {
						console.error("Could not fetch user's previous tests for Intake mapping.", e);
					}

					return false;
				}
			}
			emailError = '';
			previouslyAllocatedTestIds = [];
			return true;
		} catch (error) {
			console.error('Error checking email:', error);
			return false;
		}
	}

	async function validateStep1() {
		formErrors = {};
		if (!formData.gender) formErrors.gender = 'Please select a gender pronoun';
		if (!formData.firstName) formErrors.firstName = 'First name is required';
		if (!formData.lastName) formErrors.lastName = 'Last name is required';
		if (!formData.email) formErrors.email = 'Email is required';
		if (!formData.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/))
			formErrors.email = 'Please enter a valid email';
		if (!formData.phoneNumber) formErrors.phoneNumber = 'Phone number is required';
		if (!formData.preferredCommunication)
			formErrors.preferredCommunication = 'Please select preferred communication';
		// Mandatory. It is pre-filled with English and the picker offers no blank
		// option, so this only fires if the value was cleared some other way — in
		// which case fall back to English rather than blocking the admin.
		if (!formData.preferredLanguage) formData.preferredLanguage = DEFAULT_LANGUAGE;
		if (!formData.intakeNote) formData.intakeNote = '';

		// Check if email exists
		if (formData.email && !formErrors.email) {
			const emailAvailable = await checkEmail(formData.email);
			if (!emailAvailable) {
				formErrors.email = emailError;
			}
		}

		return Object.keys(formErrors).length === 0;
	}

	function validateStep2() {
		formErrors = {};
		if (!formData.fileMakerId) formErrors.fileMakerId = 'User ID is required';
		if (formData.selectedQuestionnaires.length === 0)
			formErrors.questionnaires = 'Please select at least one Interview';
		return Object.keys(formErrors).length === 0;
	}

	function closeModal() {
		if (demoSetupLink) {
			intakeForm.reset();
			demoSetupLink = '';
		}
		intakeForm.setStep(1);
		$navState = 'Home';
	}

	async function handleNext() {
		if (currentStep === 1) {
			const isValid = await validateStep1();
			if (!isValid) return;
		}
		if (currentStep === 2 && !validateStep2()) return;
		console.log('Next clicked, current step:', currentStep);
		intakeForm.setStep(currentStep + 1);
	}

	function handleBack() {
		intakeForm.setStep(currentStep - 1);
	}

	async function handleSubmit() {
		if (!validateStep2()) return;
		if (await checkFileMakerId(formData.fileMakerId)) {
			intakeForm.setStep(3);
		}
	}

	async function handleConfirm() {
		if (loading) return;

		try {
			loading = true;
			success = false;
			let user1 = {};
			let userResponse1 = await api.get('/api/user');
			if (userResponse1.ok) {
				user1 = await userResponse1.json();
			}
			const userData = {
				email: formData.email,
				fullName: `${formData.firstName} ${formData.lastName}`,
				gender: formData.gender,
				userType: 'patient',
				patientProfile: {
					phoneNumber: formData.phoneNumber,
					preferredCommunication: formData.preferredCommunication,
					preferredLanguage: normalizeLanguage(formData.preferredLanguage),
					intakeNote: formData.intakeNote,
					fileMakerId: formData.fileMakerId,
					intakeAdmin: {
						id: user1.id,
						name: user1.fullName
					},
					notes: []
				}
			};
			console.log('userData', userData);
			// Create user
			const userResponse = await api.post('/api/user', userData);
			if (!userResponse.ok) {
				throw new Error('Failed to create user');
			}

			const user = await userResponse.json();
			console.log('Created user:', user);

			// Allocate tests if any are selected
			if (formData.selectedQuestionnaires.length > 0) {
				let questionnaireIds = formData.selectedQuestionnaires.map((q) => q.id);
				console.log('Allocating tests:', questionnaireIds);
				const allocateResponse = await api.post('/api/allocated-tests', {
					userId: user._id,
					questionnaireIds: questionnaireIds
				});
				if (!allocateResponse.ok) {
					console.error('Failed to allocate tests:', await allocateResponse.json());
				}
			}

			// Send password reset email
			const resetResponse = await api.post('/api/reset-password', {
				email: user.email,
				isNewUser: true,
				locale: normalizeLanguage(formData.preferredLanguage)
			});
			demoSetupLink = (await resetResponse.json().catch(() => ({}))).demoResetUrl || '';
			loading = false;
			success = true;

			// Refresh followups after creating patient
			await followupsStore.refresh();

			// Leave the setup link on screen until the modal is closed
			if (demoSetupLink) return;

			// Wait for 3 seconds to show success state
			await new Promise((resolve) => setTimeout(resolve, 3000));

			intakeForm.reset();
			$navState = 'Home';
		} catch (error) {
			console.error('Error creating patient:', error);
		} finally {
			loading = false;
		}
	}
</script>

<div class="flex">
	<h3 class="text-xl flex-grow font-semibold leading-relaxed">{$t('Popups.Intake.title')}</h3>
	<button on:click={closeModal}>
		<Cross />
	</button>
</div>

{#if currentStep === 1}
	<div class="flex flex-col gap-6">
		<div class="flex gap-6">
			<FormGroup
				label={$t('Popups.Intake.first_name_label')}
				placeholder={$t('Popups.Intake.first_name_placeholder')}
				bind:value={formData.firstName}
				type="text"
				name="firstName"
				required={true}
				error={formErrors.firstName}
				class_="bg-[#eef2f1]"
			/>

			<FormGroup
				label={$t('Popups.Intake.last_name_label')}
				placeholder={$t('Popups.Intake.last_name_placeholder')}
				bind:value={formData.lastName}
				type="text"
				name="lastName"
				required={true}
				error={formErrors.lastName}
				class_="bg-[#eef2f1]"
			/>
		</div>

		<div class="flex gap-6">
			<FormGroup
				label={$t('Popups.Intake.email_label')}
				placeholder={$t('Popups.Intake.email_placeholder')}
				bind:value={formData.email}
				type="email"
				name="email"
				required={true}
				error={formErrors.email}
				class_="bg-[#eef2f1]"
			/>

			<FormGroup
				label={$t('Popups.Intake.phone_label')}
				placeholder={$t('Popups.Intake.phone_placeholder')}
				bind:value={formData.phoneNumber}
				type="tel"
				name="phoneNumber"
				required={true}
				error={formErrors.phoneNumber}
				class_="bg-[#eef2f1]"
			/>
		</div>

		<div class="flex gap-6">
			<div class="self-stretch h-20 flex-col justify-start items-start gap-3 flex flex-grow">
				<div class="self-stretch text-black text-sm font-normal leading-none">
					{$t('Popups.Intake.gender_label')}
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
			<div class="self-stretch h-20 flex-col justify-start items-start gap-3 flex flex-grow">
				<div class="self-stretch text-black text-sm font-normal leading-none">
					{$t('Popups.Intake.preferred_comm_label')}
					{#if formErrors.preferredCommunication}
						<span class="text-red-500 text-sm">{formErrors.preferredCommunication}</span>
					{/if}
				</div>
				<select
					class="w-full px-5 py-5 text-Gray_Dark rounded-[0.5625rem] bg-[#eef2f1] text-base font-light leading-snug outline-none border-none focus:ring-0 {formErrors.preferredCommunication
						? 'border-red-500'
						: ''}"
					bind:value={formData.preferredCommunication}
					required
				>
					<option value="">{$t('Popups.Intake.select_comm')}</option>
					{#each communicationOptions as option, i}
						<option class="text-black" value={option.value}>{option.label}</option>
					{/each}
				</select>
			</div>
		</div>

		<div class="self-stretch flex-col justify-start items-start gap-3 flex w-full">
			<LanguageSelector
				label={$t('Popups.Intake.preferred_language_label') || 'Preferred Language'}
				bind:value={formData.preferredLanguage}
				variant="intake"
				required={true}
			/>
		</div>

		<div class="self-stretch flex-col justify-start items-start gap-3 flex">
			<div class="self-stretch text-black text-sm font-normal leading-none">
				{$t('Popups.Intake.notes_label')}
			</div>
			<textarea
				class="w-full px-5 py-5 text-Gray_Dark rounded-[0.5625rem] bg-[#eef2f1] text-base font-light leading-snug outline-none border-none focus:ring-0 resize-y {formErrors.intakeNote
					? 'border-red-500'
					: ''}"
				bind:value={formData.intakeNote}
				placeholder={$t('Popups.Intake.notes_placeholder')}
				required
			/>
			{#if formErrors.intakeNote}
				<p class="text-red-500 text-sm">{formErrors.intakeNote}</p>
			{/if}
		</div>

		<div class="flex justify-end gap-4 mt-4">
			<Button onClick={handleNext}>{$t('Popups.Intake.next')}</Button>
		</div>
	</div>
{:else if currentStep === 2}
	<div class="flex flex-col gap-6">
		<FormGroup
			label={$t('Popups.Intake.user_id_label')}
			placeholder={$t('Popups.Intake.user_id_placeholder')}
			bind:value={formData.fileMakerId}
			type="text"
			name="fileMakerId"
			required={true}
			error={formErrors.fileMakerId || fileMakerIdError}
			class_="bg-[#eef2f1]"
		/>

		<div class="space-y-4">
			{#if loadingQuestionnaires}
				<p class="text-gray-600">{$t('Popups.Intake.loading_interviews')}</p>
			{:else if questionnairesError}
				<p class="text-red-500">{questionnairesError}</p>
			{:else if questionnaires.length === 0}
				<p class="text-gray-600">{$t('Popups.Intake.no_interviews')}</p>
			{:else}
				<div class="h-[300px]">
					<MultiSelector
						form="intake"
						options={questionnaires
							.filter((q) => !previouslyAllocatedTestIds.includes(q._id.toString()))
							.map((q) => ({
								id: q._id,
								title: q.title,
								test_code: q.test_code
							}))}
						bind:selected={formData.selectedQuestionnaires}
						field1={$t('Popups.Intake.available_interviews')}
						field2={$t('Popups.Intake.selected_interviews_label')}
					/>
				</div>
			{/if}
			{#if formErrors.questionnaires}
				<p class="text-red-500 text-sm">{formErrors.questionnaires}</p>
			{/if}
		</div>

		<!-- Predefined Sets -->
		<div class="space-y-2">
			<p class="text-sm">Predefined Sets</p>
			{#if loadingSets}
				<p class="text-gray-600 text-sm">Loading sets…</p>
			{:else if predefinedSets.length === 0}
				<p class="text-gray-500 text-sm">No predefined sets available</p>
			{:else}
				<div class="bg-[#eef2f1] rounded-lg p-3 flex flex-wrap gap-2">
					{#each predefinedSets as set (set._id)}
						{@const selected = selectedSetIds.includes(set._id.toString())}
						{@const partial = !selected && isSetPartial(set)}
						{@const allSent =
							set.interviews?.length > 0 &&
							set.interviews.every((iv) => previouslyAllocatedTestIds.includes(iv._id.toString()))}
						<button
							on:click={() => {
								if (!allSent) toggleSet(set);
							}}
							class="rounded-full px-4 py-1 text-sm flex items-center gap-1 transition-colors
								{allSent
								? 'bg-[#E5E7EB] text-gray-500 italic cursor-not-allowed opacity-70'
								: selected
									? 'bg-[#E8F9F5] text-[#00A886]'
									: partial
										? 'bg-white text-gray-500 ring-1 ring-[#00A886] ring-inset'
										: 'bg-white text-gray-700 hover:bg-gray-50'}"
						>
							{set.set_name}
							{allSent ? '(Sent)' : ''}
							{#if !allSent}
								{#if selected}
									<span class="font-bold text-xs ml-0.5">−</span>
								{:else}
									<span class="font-bold text-xs ml-0.5">+</span>
								{/if}
							{/if}
						</button>
					{/each}
				</div>
			{/if}
		</div>

		<div class="flex justify-between mt-4">
			<Button outline onClick={handleBack} variant="secondary">{$t('Popups.Intake.back')}</Button>
			<Button onClick={handleSubmit}>{$t('Popups.Intake.next')}</Button>
		</div>
	</div>
{:else if currentStep === 3}
	<div class="flex flex-col gap-6">
		<h2 class="text-xl font-semibold">{$t('Popups.Intake.confirm_title')}</h2>

		<div class="space-y-4">
			<div class="grid grid-cols-2 gap-4">
				<div>
					<h3 class="font-medium">{$t('Popups.Intake.confirm.gender_pronoun')}</h3>
					<p>{formData.gender}</p>
				</div>
				<div>
					<h3 class="font-medium">{$t('Popups.Intake.confirm.name')}</h3>
					<p>{formData.firstName} {formData.lastName}</p>
				</div>
				<div>
					<h3 class="font-medium">{$t('Popups.Intake.confirm.email')}</h3>
					<p>{formData.email}</p>
				</div>
				<div>
					<h3 class="font-medium">{$t('Popups.Intake.confirm.phone')}</h3>
					<p>{formData.phoneNumber}</p>
				</div>
				<div>
					<h3 class="font-medium">{$t('Popups.Intake.confirm.preferred_comm')}</h3>
					<p>
						{communicationOptions.find((opt) => opt.value === formData.preferredCommunication)
							?.label || ''}
					</p>
				</div>
				<div>
					<h3 class="font-medium">{$t('Popups.Intake.confirm.preferred_language')}</h3>
					<p>{languageLabel(formData.preferredLanguage)}</p>
				</div>
				<div>
					<h3 class="font-medium">{$t('Popups.Intake.confirm.user_id')}</h3>
					<p>{formData.fileMakerId}</p>
				</div>
			</div>

			<div>
				<h3 class="font-medium">{$t('Popups.Intake.confirm.notes')}</h3>
				<p class="whitespace-pre-wrap">{formData.intakeNote}</p>
			</div>

			<div>
				<h3 class="font-medium">{$t('Popups.Intake.confirm.selected_interviews')}</h3>
				<p>{formData.selectedQuestionnaires.length} Interviews selected</p>
			</div>
		</div>

		{#if demoSetupLink}
			<div class="rounded-lg border border-dashed border-Success p-4 text-sm mt-4">
				<p class="font-[600] mb-1">Demo: the invitation email was not sent</p>
				<p class="mb-2">
					Open this link in a private window to set the patient's password and start their
					interviews:
				</p>
				<a href={demoSetupLink} target="_blank" rel="noopener" class="break-all text-Success underline"
					>{demoSetupLink}</a
				>
			</div>
		{/if}

		<div class="flex justify-between mt-4">
			<Button outline onClick={handleBack} variant="secondary">{$t('Popups.Intake.back')}</Button>
			<Button
				onClick={handleConfirm}
				{loading}
				loadingText={$t('Popups.Intake.creating')}
				{success}
				successText={$t('Popups.Intake.created')}
			>
				{$t('Popups.Intake.confirm_create')}
			</Button>
		</div>
	</div>
{/if}

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
