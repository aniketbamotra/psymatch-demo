<script>
	import { createEventDispatcher } from 'svelte';
	import * as api from '$lib/api';
	import { getContext } from 'svelte';
	import { navState } from '$lib/stores';
	import { currentPatientFollowup } from '$lib/stores/currentPatientFollowup';
	import Print from '$lib/components/feather/print.svelte';
	import { debugMode as t } from '$lib/i18n-debug';
	export let assignmentLeft;
	export let patient;
	export let lastFollowupDate;
	export let followupId;
	export let user;
	export let status = 'new'; // 'new', 'in_progress', 'completed'
	let gender = 'They/Them';
	const dispatch = createEventDispatcher();

	// Define background colors based on status
	const statusColors = {
		new: 'bg-white', // New patient - white background
		in_progress: 'bg-[#E8F9F5]', // Started questions - light green
		completed: 'bg-[#00A886]' // Completed questions - dark green
	};

	// Define text colors based on status
	const textColors = {
		new: 'text-black', // Black text for white background
		in_progress: 'text-black', // Black text for light green background
		completed: 'text-white' // White text for dark green background
	};

	// Get background color based on status
	$: backgroundColor = statusColors[status] || statusColors.new;

	// Get text color based on status
	$: textColor = textColors[status] || textColors.new;

	// Get icon stroke color based on status
	$: iconStroke = status === 'completed' ? 'white' : 'black';

	function getDaysSinceFollowup(date) {
		const now = new Date();
		const followupDate = new Date(date);
		const diffTime = Math.abs(now - followupDate);
		const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
		return diffDays === 0
			? $t('Followup.Card.today')
			: `${diffDays} ${$t('Followup.Card.days_ago')}`;
	}
	if (patient.gender == 'He' || patient.gender == 'he') {
		gender = 'He/Him';
	} else if (patient.gender == 'She' || patient.gender == 'she') {
		gender = 'She/Her';
	} else if (
		patient == 'Ze' ||
		patient.gender == 'ze' ||
		patient.gender == 'Zee' ||
		patient.gender == 'zee'
	) {
		gender = 'Ze/Zir';
	}

	function handleInfoClick() {
		currentPatientFollowup.setPatientFollowup(patient, user, followupId);
		navState.set('PatientDetails');
	}

	async function handleComplete() {
		try {
			const response = await api.patch('/api/followup?skipSync=false', {
				followupId,
				last_followedup_by: {
					id: user._id,
					name: user.fullName
				}
			});
			if (response.ok) {
				// Notify parent to refresh followups
				dispatch('refresh');
			} else {
				console.error('Failed to update followup');
			}
		} catch (error) {
			console.error('Error updating followup:', error);
		}
	}

	function handlePrint() {
		console.log('Print button clicked for patient:', patient.fullName, 'ID:', patient._id);

		// Store patient ID in selectedPatient store and localStorage
		import('$lib/stores').then(({ selectedPatient }) => {
			selectedPatient.set(patient._id);
			if (typeof window !== 'undefined') {
				window.localStorage.setItem('selectedPatientId', patient._id);
			}
		});

		// Navigate to PrintReport modal
		import('$lib/stores').then(({ navState }) => {
			navState.set('PrintReport');
		});
	}
</script>

<div
	class="{backgroundColor} rounded-[0.625rem] p-3 flex-grow h-[8rem] flex justify-between flex-col shadow-md"
>
	<div class="flex justify-between items-start mb-2 gap-2">
		<div>
			<h3 class="text-base {textColor}">{patient.fullName}</h3>
			<p class="text-[0.6875rem] {textColor}">{gender}</p>
		</div>
		<button class="i" on:click={handleInfoClick}>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="16"
				height="16"
				viewBox="0 0 16 16"
				fill="none"
			>
				<path
					d="M8 15C11.866 15 15 11.866 15 8C15 4.13401 11.866 1 8 1C4.13401 1 1 4.13401 1 8C1 11.866 4.13401 15 8 15Z"
					stroke={iconStroke}
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
				<path
					d="M8 15C11.866 15 15 11.866 15 8C15 4.13401 11.866 1 8 1C4.13401 1 1 4.13401 1 8C1 11.866 4.13401 15 8 15Z"
					stroke={iconStroke}
					stroke-opacity="0.2"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
				<path
					d="M8 11L8 8"
					stroke={iconStroke}
					stroke-width="1.5"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
				<path
					d="M8 11L8 8"
					stroke={iconStroke}
					stroke-opacity="0.2"
					stroke-width="1.5"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
				<path
					d="M8 5.19922H8.0075"
					stroke={iconStroke}
					stroke-width="1.5"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
				<path
					d="M8 5.19922H8.0075"
					stroke={iconStroke}
					stroke-opacity="0.2"
					stroke-width="1.5"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
		</button>
	</div>
	<div class="flex justify-stretch">
		<div class="">
			{#if status === 'new'}
				<p class="text-[0.7rem] font-normal {textColor}">{$t('Followup.Card.added')}</p>
				<p class="text-[0.7rem] font-normal {textColor}">
					{getDaysSinceFollowup(lastFollowupDate)}
				</p>
			{:else if status === 'in_progress'}
				<p class="text-[0.7rem] font-normal {textColor}">{$t('Followup.Card.last_activity')}</p>
				<p class="text-[0.7rem] font-normal {textColor}">
					{getDaysSinceFollowup(lastFollowupDate)}
				</p>
			{:else if status === 'completed'}
				<p class="text-[0.7rem] font-normal {textColor}">{$t('Followup.Card.completed')}</p>
				<p class="text-[0.7rem] font-normal {textColor}">
					{getDaysSinceFollowup(lastFollowupDate)}
				</p>
			{/if}
		</div>

		<!-- Print button for completed cards -->
		<div class="flex h-full flex-grow justify-end items-end gap-[0.25rem]">
			{#if status === 'completed'}
				<button
					class="flex items-center justify-center"
					on:click={handlePrint}
					aria-label="Print report"
				>
					<Print color="white" size="30" />
				</button>
			{/if}
		</div>
	</div>
</div>
