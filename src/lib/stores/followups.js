import { writable } from 'svelte/store';
import * as api from '$lib/api';

function createFollowupsStore() {
	const { subscribe, set, update } = writable({
		followups: [],
		recentFollowups: [],
		loading: false,
		error: null
	});

	async function loadFollowups() {
		update((state) => ({ ...state, loading: true, error: null }));
		try {
			const followupsResponse = await api.get('/api/followup?skipSync=false');
			if (followupsResponse.ok) {
				const followupsData = await followupsResponse.json();

				// New API returns object with {onboarded, active, completed}
				// Flatten all patients into a single array
				const allPatients = [
					...(followupsData.onboarded || []),
					...(followupsData.active || []),
					...(followupsData.completed || [])
				];

				const today = new Date();
				today.setHours(0, 0, 0, 0);

				// Filter patients needing follow-up (more than 1 day since last activity)
				const sortedFollowups = allPatients
					.filter((f) => {
						const followupDate = new Date(f.date);
						followupDate.setHours(0, 0, 0, 0);
						const diffDays = Math.floor((today - followupDate) / (1000 * 60 * 60 * 24));
						return diffDays >= 1;
					})
					.sort((a, b) => new Date(a.date) - new Date(b.date));

				// Get followups done today (patients with activity today)
				const recentFollowups = allPatients
					.filter((f) => {
						const followupDate = new Date(f.date);
						followupDate.setHours(0, 0, 0, 0);
						return followupDate.getTime() === today.getTime();
					})
					.sort((a, b) => new Date(b.date) - new Date(a.date));

				update((state) => ({
					...state,
					followups: sortedFollowups,
					recentFollowups,
					loading: false
				}));
			} else {
				throw new Error('Failed to load followups');
			}
		} catch (error) {
			console.error('Error loading followups:', error);
			update((state) => ({
				...state,
				error: error.message || 'Failed to load followups',
				loading: false
			}));
		}
	}

	return {
		subscribe,
		refresh: loadFollowups,
		reset: () => set({ followups: [], recentFollowups: [], loading: false, error: null })
	};
}

export const followupsStore = createFollowupsStore();
