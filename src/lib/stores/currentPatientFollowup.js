import { writable } from 'svelte/store';
import * as api from '$lib/api';

const initialState = {
	patient: null,
	user: null,
	followupId: null,
	questionnaires: [],
	notes: []
};

function createCurrentPatientFollowupStore() {
	const { subscribe, set } = writable(initialState);

	return {
		subscribe,
		setPatientFollowup: async (patient, user, followupId) => {
			try {
				// Fetch all allocated tests with progress
				const testsResponse = await api.get(`/api/allocated-tests/progress/${patient._id}`);
				let questionnaires = [];
				if (testsResponse.ok) {
					questionnaires = await testsResponse.json();
				}

				// Fetch user details to get notes and intake info
				const userResponse = await api.get(`/api/user?id=${patient._id}`);
				let notes = [];

				if (userResponse.ok) {
					const userData = await userResponse.json();
					console.log('User data:', userData);
				}

				set({
					patient: {
						...patient
					},
					user,
					followupId,
					questionnaires,
					notes
				});
			} catch (error) {
				console.error('Error fetching patient details:', error);
				set({ patient, user, followupId, questionnaires: [], notes: [] });
			}
		},
		reset: () => set(initialState)
	};
}

export const currentPatientFollowup = createCurrentPatientFollowupStore();
