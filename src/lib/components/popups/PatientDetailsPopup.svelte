<script>
	import { navState, selectedPatient } from '$lib/stores';
	import { currentPatientFollowup } from '$lib/stores/currentPatientFollowup';
	import Cross from './Cross.svelte';
	import Button from '../buttons/Button.svelte';
	import * as api from '$lib/api';
	import { languageLabel } from '$lib/utils/language';
	import { onMount, onDestroy } from 'svelte';
	import SummaryReportGenerator from '../common/SummaryReportGenerator.svelte';
	import Check from '../feather/check.svelte';
	import Trash from '../feather/trash.svelte';
	import Download from '../feather/download.svelte';
	import Print from '../feather/print.svelte';
	import { debugMode as t } from '$lib/i18n-debug';
	import { getLocalizedText } from '$lib/utils/language';

	// Helper to ensure title is always a string
	function formatTitle(title) {
		if (!title) return 'Untitled';
		if (typeof title === 'string') return title;
		if (typeof title === 'object') {
			return title.en || Object.values(title)[0] || 'Untitled';
		}
		return String(title);
	}

	let patient = null;
	let patientDetails = null;
	let user;
	let followupId;
	let questionnaires = [];
	let notes = [];
	let loading = true;
	let error = null;
	let removingPatient = false;
	let patientRemoved = false;

	// Sets dropdown state
	/** @type {{ _id: string, set_name: string, info: string, interviews: any[] }[]} */
	let sets = [];
	let selectedSetId = null;
	let dropdownOpen = false;
	let setDropdownRef;
	let setButtonRef;

	function handleSetClickOutside(event) {
		if (
			setDropdownRef &&
			!setDropdownRef.contains(event.target) &&
			setButtonRef &&
			!setButtonRef.contains(event.target)
		) {
			dropdownOpen = false;
		}
	}

	$: selectedSet = sets.find((s) => s._id.toString() === selectedSetId) ?? sets[0] ?? null;
	$: selectedInterviews = (selectedSet?.interviews ?? []).map((iv) => ({
		title: formatTitle(iv.title) || iv.test_code || 'Untitled',
		progress:
			iv.totalQuestions > 0 ? Math.round((iv.completedQuestions / iv.totalQuestions) * 100) : 0,
		answeredQuestions: iv.completedQuestions,
		totalQuestions: iv.totalQuestions,
		status: iv.status
	}));

	// Determine if the currently selected set is completely downloaded/completed
	$: isSetFullyDownloaded =
		selectedInterviews.length > 0 && selectedInterviews.every((iv) => iv.status === 'downloaded');
	$: isSetFullyCompleted =
		selectedInterviews.length > 0 &&
		selectedInterviews.every((iv) => iv.status === 'completed' || iv.status === 'downloaded');

	// Subscribe to get initial patient ID and user info
	const unsubscribe = currentPatientFollowup.subscribe((value) => {
		patient = value.patient;
		user = value.user;
		followupId = value.followupId;

		// Fetch fresh data when patient changes
		if (patient?._id) {
			loadPatientDetails(patient._id);
		}
	});

	// Fetch fresh patient details from API
	async function loadPatientDetails(patientId) {
		loading = true;
		error = null;

		try {
			const response = await api.get(`/api/followup/${patientId}`);

			if (!response.ok) {
				throw new Error('Failed to fetch patient details');
			}

			patientDetails = await response.json();

			// Print assignments array to console
			console.log('📋 Patients Array:', patientDetails);

			// Transform assignments to questionnaires format for compatibility
			questionnaires = patientDetails.assignments.map((assignment) => ({
				title: formatTitle(assignment.assignmentName),
				progress:
					assignment.totalQuestions > 0
						? Math.round((assignment.completedQuestions / assignment.totalQuestions) * 100)
						: 0,
				answeredQuestions: assignment.completedQuestions,
				totalQuestions: assignment.totalQuestions,
				status: assignment.status
			}));

			// Use notes from API
			notes = patientDetails.notes || [];

			// Fetch sets for this patient (parallel, non-blocking)
			try {
				const setsRes = await api.get(`/api/set/read?mode=patientPopup&patientId=${patientId}`);
				if (setsRes.ok) {
					const setsData = await setsRes.json();
					sets = setsData.sets ?? [];
					selectedSetId = sets[0]?._id?.toString() ?? null;
				}
			} catch (setsErr) {
				console.error('Error loading patient sets:', setsErr);
			}

			// Merge API data with existing patient object for backward compatibility
			patient = {
				...patient,
				fullName: patientDetails.patientName,
				gender: patientDetails.pronouns,
				patientProfile: {
					phoneNumber: patientDetails.phoneNumber,
					preferredCommunication: patientDetails.preferredComms,
					intakeNote: notes.find((n) => n.intake)?.text || '',
					intakeAdmin: notes.find((n) => n.intake)?.admin
						? { name: notes.find((n) => n.intake).admin }
						: null
				}
			};

			loading = false;
		} catch (err) {
			console.error('Error loading patient details:', err);
			error = err.message;
			loading = false;
		}
	}

	onMount(() => {
		// Load data if patient already set
		if (patient?._id) {
			loadPatientDetails(patient._id);
		}
		window.addEventListener('click', handleSetClickOutside);
	});

	onDestroy(() => {
		unsubscribe();
		currentPatientFollowup.reset();
		window.removeEventListener('click', handleSetClickOutside);
	});

	async function handleProceed() {
		try {
			const response = await api.patch('/api/followup', {
				followupId,
				last_followedup_by: {
					id: user._id,
					name: user.fullName
				}
			});
			if (response.ok) {
				// Dispatch a custom event that Modal.svelte can listen to
				const event = new CustomEvent('followup-completed');
				window.dispatchEvent(event);
				currentPatientFollowup.reset();
				$navState = 'Home';
			} else {
				console.error('Failed to update followup');
			}
		} catch (error) {
			console.error('Error updating followup:', error);
		}
	}

	function closeModal() {
		currentPatientFollowup.reset();
		$navState = 'Home';
	}

	// Event handlers for SummaryReportGenerator
	function handleReportGenerated(event) {
		console.log('Report generated for patient:', event.detail);
	}

	function handleStatusChecked(event) {
		console.log('Status checked for patient:', event.detail);
		// Show browser alert with the status message
		if (event.detail.message) {
			alert(event.detail.message);
		}
	}

	function handleDownloadRequested(event) {
		console.log('Download requested for patient:', event.detail);
		// Show success message if download was successful
		if (event.detail.success && event.detail.message) {
			alert(event.detail.message);
		}
	}

	function handleReportError(event) {
		console.error('Report error for patient:', event.detail);

		// Show specific error message based on error type
		if (event.detail.type === 'generate') {
			// Error during report generation - show custom message
			alert($t('Popups.PatientDetails.error_generate'));
		} else if (event.detail.type === 'status') {
			// Error during status check
			alert(event.detail.message || $t('Popups.PatientDetails.error_status'));
		} else if (event.detail.type === 'download') {
			// Error during download
			alert(event.detail.message || $t('Popups.PatientDetails.error_download'));
		} else {
			// Generic error
			alert(event.detail.message || $t('Popups.PatientDetails.error_generic'));
		}
	}

	// Format date of registration
	function formatRegistrationDate(dateString) {
		if (!dateString) return '';

		const date = new Date(dateString);
		const now = new Date();

		const diffTime = Math.abs(now - date);
		const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

		const years = Math.floor(diffDays / 365);
		const months = Math.floor((diffDays % 365) / 30);
		const days = diffDays % 30;

		// Format: DD/MM/YYYY ( YY years MM months DD days ago )
		const dd = String(date.getDate()).padStart(2, '0');
		const mm = String(date.getMonth() + 1).padStart(2, '0');
		const yyyy = date.getFullYear();

		return `${dd}/${mm}/${yyyy} ( ${years} ${$t('Common.Time.years')} ${months} ${$t('Common.Time.months')} ${days} ${$t('Common.Time.days_ago')} )`;
	}

	async function handleRemovePatient() {
		try {
			removingPatient = true;

			// Use patient._id (the original ID) instead of patientDetails.patientId
			const patientId = patient._id || patientDetails?.patientId;
			console.log('Deleting patient with ID:', patientId);

			const response = await api.del(`/api/followup/${patientId}`);
			console.log('Delete response:', response);
			if (response.ok) {
				removingPatient = false;
				patientRemoved = true;

				// Keep success state visible for 2 seconds before closing
				setTimeout(() => {
					currentPatientFollowup.reset();
					$navState = 'Home';
					// Trigger refresh of patient list
					window.dispatchEvent(new CustomEvent('followup-completed'));
				}, 2000);
			} else {
				removingPatient = false;
				const errorData = await response.json().catch(() => ({}));
				console.error('Failed to remove patient:', response.status, errorData);
			}
		} catch (error) {
			removingPatient = false;
			console.error('Error removing patient:', error);
		}
	}

	async function handleDownloadReports() {
		// Set the selected patient and navigate to PrintReport modal
		const patientId = patient._id || patientDetails?.patientId;

		if (patientId) {
			selectedPatient.set(patientId);

			// Store in localStorage for persistence
			if (typeof window !== 'undefined') {
				window.localStorage.setItem('selectedPatientId', patientId);
			}

			// Navigate to PrintReport modal
			$navState = 'PrintReport';
		} else {
			console.error('No patient ID available');
		}
	}
</script>

<div class="flex">
	<h3 class="text-xl flex-grow font-semibold leading-relaxed">
		{patient?.fullName || $t('Popups.PatientDetails.title')}
		{patient?.gender ? `(${patient.gender})` : ''}
	</h3>
	<button on:click={closeModal}>
		<Cross />
	</button>
</div>

{#if loading}
	<div class="flex items-center justify-center py-12">
		<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-[#00A886]"></div>
	</div>
{:else if error}
	<div class="space-y-4 mt-4">
		<div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
			<p class="font-medium">{$t('Popups.PatientDetails.error_loading')}</p>
			<p class="text-sm">{error}</p>
		</div>
		<button
			class="text-[#00A886] hover:underline text-sm"
			on:click={() => loadPatientDetails(patient._id)}
		>
			{$t('Popups.PatientDetails.try_again')}
		</button>
	</div>
{:else}
	<div class="space-y-4 mt-4">
		<!-- Basic Info Section -->
		<div class="grid grid-cols-2 gap-4">
			<div>
				<h3 class="font-medium text-sm text-gray-500">{$t('Popups.PatientDetails.email')}:</h3>
				<p class="mt-0.5">{patientDetails?.email || $t('Common.na')}</p>
			</div>
			<div>
				<h3 class="font-medium text-sm text-gray-500">{$t('Popups.PatientDetails.phone')}:</h3>
				<p class="mt-0.5">{patientDetails?.phoneNumber || $t('Common.na')}</p>
			</div>
			<div>
				<h3 class="font-medium text-sm text-gray-500">
					{$t('Popups.PatientDetails.preferred_comms')}:
				</h3>
				<p class="mt-0.5">{patientDetails?.preferredComms || $t('Common.na')}</p>
			</div>
			<div>
				<h3 class="font-medium text-sm text-gray-500">
					{$t('Popups.PatientDetails.preferred_language')}:
				</h3>
				<!-- Never "N/A": every patient has a language, legacy rows read as English. -->
				<p class="mt-0.5">{languageLabel(patientDetails?.preferredLanguage)}</p>
			</div>
			<div>
				<h3 class="font-medium text-sm text-gray-500">{$t('Popups.PatientDetails.date_of_reg')}</h3>
				<p class="mt-0.5">{formatRegistrationDate(patientDetails?.dateOfReg)}</p>
			</div>
		</div>

		<!-- Questionnaires / Sets Section -->
		<div class="mt-6">
			{#if sets.length > 0}
				<!-- Set dropdown header -->
				<div class="flex items-center justify-between">
					<div class="relative">
						<!-- Dropdown trigger — matches LanguageSelector style -->
						<button
							type="button"
							bind:this={setButtonRef}
							on:click={(e) => {
								e.stopPropagation();
								dropdownOpen = !dropdownOpen;
							}}
							class="ml-2 px-3 py-2 text-Gray_Dark rounded-t-[0.5625rem] {isSetFullyCompleted
								? 'bg-[#E8F9F5]'
								: 'bg-[#eef2f1]'} text-base font-light leading-snug outline-none border-none focus:ring-0 flex items-center justify-between gap-4 cursor-pointer"
						>
							<span class={isSetFullyCompleted ? 'text-[#00A886]' : 'text-black'}
								>{selectedSet?.set_name ?? '—'}</span
							>
							<span class="text-Gray_Dark italic text-sm">{selectedSet?.info ?? ''}</span>

							<div class="flex items-center gap-2">
								{#if isSetFullyDownloaded}
									<div class="relative w-5 h-5 flex items-center justify-center">
										<Print color="#00A886" size={16} />
									</div>
								{:else if isSetFullyCompleted}
									<div class="relative w-5 h-5 flex items-center justify-center">
										<div class="w-5 h-5 rounded-full bg-[#00A886] flex items-center justify-center">
											<Check size={12} color="white" />
										</div>
									</div>
								{/if}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-5 w-5 text-Gray_Dark transition-transform {dropdownOpen
										? 'rotate-180'
										: ''}"
									viewBox="0 0 20 20"
									fill="currentColor"
								>
									<path
										fill-rule="evenodd"
										d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
										clip-rule="evenodd"
									/>
								</svg>
							</div>
						</button>

						<!-- Dropdown list — matches LanguageSelector style -->
						{#if dropdownOpen}
							<div
								bind:this={setDropdownRef}
								class="absolute top-full left-0 mt-1 z-[9999] w-full bg-white rounded-lg shadow-lg overflow-hidden p-[14px]"
							>
								{#each sets as set, index (set._id)}
									<button
										type="button"
										on:click={() => {
											selectedSetId = set._id.toString();
											dropdownOpen = false;
										}}
										class="w-full flex items-center justify-between px-4 py-3 text-center transition-colors
											{set._id.toString() === selectedSetId
											? 'bg-Success text-white rounded-lg'
											: index === 0
												? 'bg-white text-Success hover:bg-gray-100 hover:rounded-lg rounded-t-lg'
												: 'bg-white text-Success hover:bg-gray-100 hover:rounded-lg'}"
									>
										<span>{set.set_name}</span>
										<span
											class="italic text-sm {set._id.toString() === selectedSetId
												? 'text-white'
												: 'text-gray-400'}">{set.info}</span
										>
									</button>
									{#if index < sets.length - 1}
										<div class="h-px bg-gray-200 my-2"></div>
									{/if}
								{/each}
							</div>
						{/if}
					</div>

					<span class="text-sm text-gray-500">Total {sets.length} Interview sets</span>
				</div>

				<!-- Interview grid for selected set -->
				<div
					class="grid grid-cols-2 items-stretch gap-2 min-h-8 max-h-48 overflow-y-scroll p-4 bg-gray-50 rounded-lg"
				>
					{#each selectedInterviews as questionnaire}
						<div
							class="flex items-center justify-between py-1.5 px-2 rounded-lg h-max
								{questionnaire.status === 'completed' || questionnaire.status === 'downloaded'
								? 'bg-[#E8F9F5]'
								: 'bg-white'}"
						>
							<span
								class="text-sm {questionnaire.status === 'completed' ||
								questionnaire.status === 'downloaded'
									? 'text-[#00A886]'
									: ''}">{questionnaire.title}</span
							>
							<div class="flex items-center gap-2">
								{#if questionnaire.status !== 'completed' && questionnaire.status !== 'downloaded'}
									<span class="text-gray-600">
										{questionnaire.answeredQuestions}/{questionnaire.totalQuestions}
									</span>
								{/if}
								{#if questionnaire.status === 'downloaded'}
									<div class="relative w-7 h-7 flex items-center justify-center">
										<Print color="#00A886" />
									</div>
								{:else if questionnaire.status === 'completed'}
									<div class="relative w-7 h-7 flex items-center justify-center">
										<div class="w-7 h-7 rounded-full bg-[#00A886] flex items-center justify-center">
											<Check size={16} color="white" />
										</div>
									</div>
								{:else}
									<div class="relative w-7 h-7">
										<svg class="w-7 h-7">
											<circle
												cx="14"
												cy="14"
												r="12"
												stroke="#E5E7EB"
												stroke-width="2.5"
												fill="none"
											/>
											<circle
												cx="14"
												cy="14"
												r="12"
												stroke="#00A886"
												stroke-width="2.5"
												fill="none"
												stroke-dasharray={2 * Math.PI * 12}
												stroke-dashoffset={2 * Math.PI * 12 * (1 - questionnaire.progress / 100)}
											/>
										</svg>
									</div>
								{/if}
							</div>
						</div>
					{/each}
					{#if selectedInterviews.length === 0}
						<p class="col-span-2 text-sm text-gray-400 italic text-center py-4">
							No interviews in this set
						</p>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Notes Section -->
		<div class="mt-6">
			<h3 class="font-medium text-sm mb-3">{$t('Popups.PatientDetails.notes')}</h3>
			{#if notes && notes.length > 0}
				<div class="p-4 bg-gray-50 rounded-lg space-y-2 max-h-40 overflow-y-scroll">
					{#each notes as note}
						<div class="bg-white p-3 rounded-lg">
							<p class="whitespace-pre-wrap text-sm">{note.text}</p>
							<div class="flex justify-between items-center mt-2 text-sm text-gray-500">
								<span class="italic">- {note.admin}</span>
								{#if note.intake}
									<span class="text-xs bg-[#00A886] text-white px-2 py-0.5 rounded"
										>{$t('Popups.PatientDetails.intake_note')}</span
									>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="p-4 bg-gray-50 rounded-lg">
					<div class="bg-white p-8 rounded-lg flex items-center justify-center">
						<p class="text-sm text-gray-400 italic">- {$t('Popups.PatientDetails.no_notes')} -</p>
					</div>
				</div>
			{/if}
		</div>

		<!-- Action Buttons -->
		<div class="flex justify-between items-end mt-8">
			<!-- Left side buttons -->
			<div class="flex flex-col gap-3">
				{#if patientDetails?.patientId}
					<SummaryReportGenerator
						patientId={patientDetails.patientId}
						size="large"
						on:reportGenerated={handleReportGenerated}
						on:statusChecked={handleStatusChecked}
						on:downloadRequested={handleDownloadRequested}
						on:error={handleReportError}
					/>
				{/if}
				<Button
					onClick={handleRemovePatient}
					variant="danger"
					size="large"
					icon={true}
					iconOnSide="left"
					loading={removingPatient}
					success={patientRemoved}
					label={$t('Popups.PatientDetails.remove_patient')}
					loadingText={$t('Popups.PatientDetails.removing')}
					successText={$t('Popups.PatientDetails.patient_removed')}
				>
					<Trash slot="icon" size={20} color="white" />
				</Button>
			</div>

			<!-- Right side button -->
			<Button onClick={handleDownloadReports} variant="outline" size="large">
				{$t('Popups.PatientDetails.download_report')}
			</Button>
		</div>
	</div>
{/if}
