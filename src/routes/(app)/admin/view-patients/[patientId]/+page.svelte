<script>
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { patientNotesStore } from '$lib/stores/patientNotes.js';
	import { patientTestsStore } from '$lib/stores/patientTests.js';
	import { patientsStore } from '$lib/stores/patients.js';
	import { selectedPatient } from '$lib/stores.js';
	import * as api from '$lib/api';
	import DiagnosticTest from '$lib/components/popups/DiagnosticTest.svelte';
	import PrintReport from '$lib/components/popups/PrintReport.svelte';
	import Download from '$lib/components/feather/download.svelte';
	import IconRenderer from '$lib/components/IconRenderer.svelte';
	import Button from '$lib/components/buttons/Button.svelte';
	import SummaryReportGenerator from '$lib/components/common/SummaryReportGenerator.svelte';
	import LanguageSelector from '$lib/components/form/LanguageSelector.svelte';
	import { getLocalizedText, normalizeLanguage, DEFAULT_LANGUAGE } from '$lib/utils/language';
	import { debugMode as t } from '$lib/i18n-debug';

	let patient = null;
	let loading = true;
	let error = null;
	let activeTab = 'profile';
	let showSendTest = false;
	let showPrintReport = false;

	// Form fields
	let name = '';
	let email = '';
	let phone = '';
	let preferredComms = '';
	// Mandatory — never blank. Legacy patients with no stored value read as English.
	let preferredLanguage = DEFAULT_LANGUAGE;
	let newNote = '';

	onMount(async () => {
		try {
			const patientId = $page.params.patientId;
			const response = await api.get(`/api/user/${patientId}`);

			if (response.ok) {
				const data = await response.json();
				patient = data.user;

				// Initialize form fields
				name = patient.fullName;
				email = patient.email;
				phone = patient.patientProfile?.phoneNumber || '';
				preferredComms = patient.patientProfile?.preferredCommunication || '';
				preferredLanguage = normalizeLanguage(patient.patientProfile?.preferredLanguage);

				// Load patient notes including intake note
				patientNotesStore.loadNotes(
					patientId,
					patient.patientProfile?.intakeNote,
					patient.patientProfile?.intakeAdmin
				);

				// Load patient tests
				patientTestsStore.loadTests(patientId);
			} else {
				error = 'Failed to fetch patient details';
			}
		} catch (err) {
			error = 'Error loading patient details';
			console.error(err);
		} finally {
			loading = false;
		}
	});

	async function confirmChanges() {
		// Check if there are any actual changes
		const hasChanges =
			name !== patient.fullName ||
			email !== patient.email ||
			phone !== (patient.patientProfile?.phoneNumber || '') ||
			preferredComms !== (patient.patientProfile?.preferredCommunication || '') ||
			preferredLanguage !== normalizeLanguage(patient.patientProfile?.preferredLanguage);

		if (hasChanges) {
			try {
				const updates = {
					fullName: name,
					email,
					patientProfile: {
						...patient.patientProfile,
						phoneNumber: phone,
						preferredCommunication: preferredComms,
						preferredLanguage: normalizeLanguage(preferredLanguage)
					}
				};

				console.log('Sending updates to API:', JSON.stringify(updates, null, 2));
				console.log('preferredLanguage value:', preferredLanguage);

				const response = await api.put(`/api/user/${patient._id}`, updates);
				if (!response.ok) {
					throw new Error('Failed to update patient');
				}

				const { user: updatedUser } = await response.json();

				// Update store after successful backend update
				patientsStore.set({
					...$patientsStore,
					success: true,
					loading: false,
					error: null
				});

				// Update local patient data
				patient = updatedUser;

				// Reset success message after 2 seconds
				setTimeout(() => {
					patientsStore.set({
						...$patientsStore,
						success: false
					});
				}, 2000);
			} catch (err) {
				console.error('Error updating patient:', err);
				patientsStore.set({
					...$patientsStore,
					error: 'Failed to update patient',
					loading: false
				});
			}
		}
	}

	async function addNote() {
		if (newNote.trim()) {
			try {
				let user1 = {};
				let userResponse1 = await api.get('/api/user');
				if (userResponse1.ok) {
					user1 = await userResponse1.json();
				}
				const newNoteObj = {
					adminId: user1.id,
					adminName: user1.fullName,
					note: newNote.trim(),
					timestamp: new Date().toISOString()
				};

				// Get current notes and add new one
				const currentNotes = patient.patientProfile?.notes || [];
				const updates = {
					patientProfile: {
						...patient.patientProfile,
						notes: [...currentNotes, newNoteObj]
					}
				};

				const response = await api.put(`/api/user/${patient._id}`, updates);
				if (!response.ok) {
					throw new Error('Failed to add note');
				}

				const { user: updatedUser } = await response.json();

				// Update store after successful backend update
				patientNotesStore.set({
					...$patientNotesStore,
					notes: updatedUser.patientProfile.notes.map((note) => ({
						id: crypto.randomUUID(),
						patientId: patient._id,
						content: note.note,
						author: {
							id: note.adminId,
							name: note.adminName
						},
						createdAt: note.timestamp,
						isIntakeNote: false
					})),
					success: true,
					loading: false,
					error: null
				});

				// Update local patient data
				patient = updatedUser;
				newNote = '';

				// Reset success message after 2 seconds
				setTimeout(() => {
					patientNotesStore.set({
						...$patientNotesStore,
						success: false
					});
				}, 2000);
			} catch (err) {
				console.error('Error adding note:', err);
				patientNotesStore.set({
					...$patientNotesStore,
					error: 'Failed to add note',
					loading: false
				});
			}
		}
	}

	function openSendTest() {
		showSendTest = true;
	}

	async function removeTest(testId) {
		if (confirm($t('Admin.PatientProfile.confirm_remove_test'))) {
			await patientTestsStore.removeTest(testId);
		}
	}

	function openPrintReport() {
		$selectedPatient = patient._id;
		showPrintReport = true;
	}

	// Event handlers for SummaryReportGenerator
	function handleReportGenerated(event) {
		console.log('Report generated:', event.detail);
	}

	function handleStatusChecked(event) {
		console.log('Status checked:', event.detail);
		// Show browser alert with the status message
		if (event.detail.message) {
			alert(event.detail.message);
		}
	}

	function handleDownloadRequested(event) {
		console.log('Download requested:', event.detail);
		// Show success message if download was successful
		if (event.detail.success && event.detail.message) {
			alert(event.detail.message);
		}
	}

	function handleReportError(event) {
		console.error('Report error:', event.detail);

		// Show specific error message based on error type
		if (event.detail.type === 'generate') {
			// Error during report generation - show custom message
			alert($t('Admin.PatientProfile.error_generate'));
		} else if (event.detail.type === 'status') {
			// Error during status check
			alert(event.detail.message || $t('Admin.PatientProfile.error_status'));
		} else if (event.detail.type === 'download') {
			// Error during download
			alert(event.detail.message || $t('Admin.PatientProfile.error_download'));
		} else {
			// Generic error
			alert(event.detail.message || $t('Admin.PatientProfile.error_generic'));
		}
	}

	// Success messages
	$: if ($patientsStore.success) {
		setTimeout(() => {
			$patientsStore.success = false;
		}, 2000);
	}

	$: if ($patientNotesStore.success) {
		setTimeout(() => {
			$patientNotesStore.success = false;
		}, 2000);
	}

	function formatDate(dateString) {
		if (!dateString) return $t('Common.na');
		const date = new Date(dateString);
		return date.toLocaleDateString('en-GB', {
			year: 'numeric',
			month: '2-digit',
			day: '2-digit'
		});
	}
</script>

<div class="p-6 z-10">
	<h1 class="text-2xl font-bold mb-6">{patient?.fullName || $t('Admin.PatientProfile.title')}</h1>

	{#if loading}
		<div class="flex justify-center items-center h-64">
			<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
		</div>
	{:else if error || $patientsStore.error || $patientNotesStore.error}
		<div class="bg-red-50 p-4 rounded-lg mb-6">
			<div class="flex">
				<div class="flex-shrink-0">
					<svg
						class="h-5 w-5 text-red-400"
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 20 20"
						fill="currentColor"
					>
						<path
							fill-rule="evenodd"
							d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
							clip-rule="evenodd"
						/>
					</svg>
				</div>
				<div class="ml-3">
					<p class="text-sm font-medium text-red-800">
						{error || $patientsStore.error || $patientNotesStore.error}
					</p>
				</div>
			</div>
		</div>
	{:else if patient}
		{#if $patientsStore.success || $patientNotesStore.success}
			<div
				class="fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg transition-opacity duration-500"
			>
				{#if $patientsStore.success}
					{$t('Admin.PatientProfile.success_changes')}
				{:else}
					{$t('Admin.PatientProfile.success_note')}
				{/if}
			</div>
		{/if}

		<div class="mb-6">
			<div class="inline-flex rounded-lg overflow-hidden">
				<button
					class="px-6 py-3 {activeTab === 'profile' ? 'bg-white' : 'bg-gray-100'} font-medium"
					on:click={() => (activeTab = 'profile')}
				>
					{$t('Admin.PatientProfile.tabs.profile')}
				</button>
				<button
					class="px-6 py-3 {activeTab === 'tests' ? 'bg-white' : 'bg-gray-100'} font-medium"
					on:click={() => (activeTab = 'tests')}
				>
					{$t('Admin.PatientProfile.tabs.tests')}
				</button>
			</div>
		</div>

		{#if activeTab === 'profile'}
			<div class="bg-white rounded-lg p-6">
				<!-- Patient Info -->
				<div class="mb-8">
					<div class="flex justify-between items-center mb-6">
						<h2 class="text-xl font-semibold">{$t('Admin.PatientProfile.section.info')}</h2>
						<button
							class="px-6 py-2 bg-Success text-white rounded-lg hover:bg-Success_Dark relative"
							on:click={confirmChanges}
							disabled={$patientsStore.loading}
						>
							{#if $patientsStore.loading}
								<div class="absolute inset-0 flex items-center justify-center">
									<div class="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
								</div>
								<span class="opacity-0">{$t('Admin.PatientProfile.button.confirm')} →</span>
							{:else}
								{$t('Admin.PatientProfile.button.confirm')} →
							{/if}
						</button>
					</div>

					<div class="space-y-6">
						<div class="col-span-2">
							<label class="block text-sm font-medium text-gray-700 mb-1"
								>{$t('Admin.PatientProfile.field.name')}</label
							>
							<input
								type="text"
								class="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-Success"
								bind:value={name}
								disabled={$patientsStore.loading}
							/>
						</div>
						<div class="grid grid-cols-2 gap-6">
							<div>
								<label class="block text-sm font-medium text-gray-700 mb-1"
									>{$t('Admin.PatientProfile.field.email')}</label
								>
								<input
									type="email"
									class="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-Success"
									bind:value={email}
									disabled={$patientsStore.loading}
								/>
							</div>
							<div>
								<label class="block text-sm font-medium text-gray-700 mb-1"
									>{$t('Admin.PatientProfile.field.phone')}</label
								>
								<input
									type="tel"
									class="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-Success"
									bind:value={phone}
									disabled={$patientsStore.loading}
								/>
							</div>
							<div>
								<label class="block text-sm font-medium text-gray-700 mb-1"
									>{$t('Admin.PatientProfile.field.preferred_comms')}</label
								>
								<input
									type="text"
									class="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-Success"
									placeholder={$t('Admin.PatientDetails.field.preferred_comms_placeholder')}
									bind:value={preferredComms}
									disabled={$patientsStore.loading}
								/>
							</div>
							<div>
								<LanguageSelector
									label={$t('Admin.PatientProfile.field.preferred_language') ||
										'Preferred Language'}
									bind:value={preferredLanguage}
									disabled={$patientsStore.loading}
									required={true}
								/>
							</div>
							<div>
								<label class="block text-sm font-medium text-gray-700 mb-1"
									>{$t('Admin.PatientProfile.field.date_of_reg')}</label
								>
								<input
									type="text"
									class="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-Success bg-gray-100"
									value={formatDate(patient.dateOfReg)}
									disabled={true}
								/>
							</div>
							<div>
								<label class="block text-sm font-medium text-gray-700 mb-1"
									>{$t('Admin.PatientProfile.field.last_activity')}</label
								>
								<input
									type="text"
									class="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-Success bg-gray-100"
									value={formatDate(patient.lastActivity)}
									disabled={true}
								/>
							</div>
						</div>
					</div>
				</div>

				<!-- Patient Notes -->
				<div>
					<h2 class="text-xl font-semibold mb-6">{$t('Admin.PatientProfile.section.notes')}</h2>

					<div class="space-y-4">
						{#if $patientNotesStore.intakeNote}
							<div class="p-4 border rounded-lg bg-gray-50">
								<div class="flex justify-between text-sm text-gray-500 mb-2">
									<span class="font-medium"
										>{$t('Admin.PatientProfile.note.intake_by')}
										{$patientNotesStore.intakeNote.author.name}</span
									>
									{#if $patientNotesStore.intakeNote.createdAt}
										<span>{new Date($patientNotesStore.intakeNote.createdAt).toLocaleString()}</span
										>
									{/if}
								</div>
								<p class="whitespace-pre-wrap">{$patientNotesStore.intakeNote.content}</p>
							</div>
						{/if}

						{#each $patientNotesStore.notes as note}
							<div class="p-4 border rounded-lg">
								<div class="flex justify-between text-sm text-gray-500 mb-2">
									<span>{note.author.name}</span>
									<span>{new Date(note.createdAt).toLocaleString()}</span>
								</div>
								<p class="whitespace-pre-wrap">{note.content}</p>
							</div>
						{/each}

						<div class="flex gap-2">
							<input
								type="text"
								class="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-Success"
								placeholder={$t('Admin.PatientProfile.note.placeholder')}
								bind:value={newNote}
								disabled={$patientNotesStore.loading}
							/>
							<button
								class="px-6 py-2 bg-Success text-white rounded-lg hover:bg-Success_Dark relative"
								on:click={addNote}
								disabled={$patientNotesStore.loading}
							>
								{#if $patientNotesStore.loading}
									<div class="absolute inset-0 flex items-center justify-center">
										<div class="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
									</div>
									<span class="opacity-0">{$t('Admin.PatientProfile.button.add_note')} →</span>
								{:else}
									{$t('Admin.PatientProfile.button.add_note')} →
								{/if}
							</button>
						</div>
					</div>
				</div>
			</div>
		{:else}
			<div class="bg-white rounded-lg p-6">
				<div class="flex justify-between items-center mb-6">
					<SummaryReportGenerator
						patientId={patient._id}
						on:reportGenerated={handleReportGenerated}
						on:statusChecked={handleStatusChecked}
						on:downloadRequested={handleDownloadRequested}
						on:error={handleReportError}
					/>
					<div class="space-x-4 flex items-center">
						<Button
							label={$t('Admin.PatientProfile.button.send_interviews')}
							outline={true}
							onClick={openSendTest}
							size="large"
						/>
						<Button
							label={$t('Admin.PatientProfile.button.download_reports')}
							outline={true}
							icon={true}
							iconOnSide="left"
							onClick={openPrintReport}
							size="large"
						>
							<Download slot="icon" />
						</Button>
					</div>
				</div>

				<!-- Test Lists -->
				{#if $patientTestsStore.loading}
					<div class="flex justify-center items-center h-32">
						<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
					</div>
				{:else if $patientTestsStore.error}
					<div class="text-red-500 text-center py-4">{$patientTestsStore.error}</div>
				{:else}
					<div class="space-y-8">
						<div>
							<h3 class="text-lg font-medium mb-4">
								{$t('Admin.PatientProfile.section.intake_questionnaire')}
							</h3>
							<div class="space-y-2">
								{#each $patientTestsStore.tests.filter((t) => getLocalizedText(t.title, 'en')
										.toLowerCase()
										.includes('intake')) as test}
									<div class="flex justify-between items-center py-2">
										<div>
											<span class="font-medium">{getLocalizedText(test.title, 'en')}</span>
											<span class="ml-4 text-sm text-gray-500">{test.status}</span>
										</div>
										<div class="space-x-4">
											<button
												class="text-Success hover:text-Success_Dark"
												on:click={openPrintReport}
											>
												{$t('Admin.PatientProfile.button.print')}
											</button>
											<button
												class="text-red-500 hover:text-red-700"
												on:click={() => removeTest(test.id)}
											>
												{$t('Admin.PatientProfile.button.remove')}
											</button>
										</div>
									</div>
								{/each}
							</div>
						</div>
						<div>
							<h3 class="text-lg font-medium mb-4">
								{$t('Admin.PatientProfile.section.other_questionnaire')}
							</h3>
							<div class="space-y-2">
								{#each $patientTestsStore.tests.filter((t) => !getLocalizedText(t.title, 'en')
											.toLowerCase()
											.includes('intake')) as test}
									<div class="flex justify-between items-center py-2">
										<div>
											<span class="font-medium">{getLocalizedText(test.title, 'en')}</span>
											<span class="ml-4 text-sm text-gray-500">{test.status}</span>
										</div>
										<div class="space-x-4">
											<button
												class="text-Success hover:text-Success_Dark"
												on:click={openPrintReport}
											>
												{$t('Admin.PatientProfile.button.print')}
											</button>
											<button
												class="text-red-500 hover:text-red-700"
												on:click={() => removeTest(test.id)}
											>
												{$t('Admin.PatientProfile.button.remove')}
											</button>
										</div>
									</div>
								{/each}
							</div>
						</div>
					</div>
				{/if}
			</div>
		{/if}
	{/if}
</div>
{#if showSendTest || showPrintReport}
	<div
		class="z-50 left-[10rem] fixed max-h-screen flex justify-center top-0 items-center bottom-0 right-0"
	>
		<div
			class="flex bg-white flex-col p-7 gap-5 w-[90%] min-w-[60rem] min-h-[30rem] rounded-2xl max-h-[80dvh]"
		>
			{#if showSendTest}
				<DiagnosticTest
					selectedPatient={patient}
					currentStep={2}
					on:close={() => (showSendTest = false)}
				/>
			{/if}
			{#if showPrintReport}
				<PrintReport
					on:close={() => {
						showPrintReport = false;
						$selectedPatient = null;
					}}
				/>
			{/if}
		</div>
	</div>
	<div
		class="fixed w-screen h-screen bg-white left-0 top-0 z-20 bg-opacity-10 backdrop-blur-sm"
	></div>
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
