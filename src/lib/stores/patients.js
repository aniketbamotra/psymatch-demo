import { writable } from 'svelte/store';
import * as api from '$lib/api';

function createPatientsStore() {
	const { subscribe, set, update } = writable({
		patients: [],
		filteredPatients: [],
		searchQuery: '',
		loading: false,
		error: null,
		success: false
	});

	return {
		subscribe,
		set,
		setPatients: (patients) => {
			console.log('Setting patients in store:', patients);
			const processedPatients = patients.map((patient) => ({
				...patient,
				patientProfile: patient.patientProfile || {}
			}));
			console.log('Processed patients:', processedPatients);
			update((state) => ({
				...state,
				patients: processedPatients,
				filteredPatients: filterPatients(processedPatients, state.searchQuery)
			}));
		},
		setSearchQuery: (query) => {
			update((state) => ({
				...state,
				searchQuery: query,
				filteredPatients: filterPatients(state.patients, query)
			}));
		},
		updatePatient: async (patientId, updates) => {
			update((state) => ({ ...state, loading: true, error: null, success: false }));

			// Find patient to update
			let currentState;
			update((state) => {
				currentState = state;
				return state;
			});

			const patientIndex = currentState.patients.findIndex((p) => p._id === patientId);
			if (patientIndex === -1) {
				update((state) => ({
					...state,
					loading: false,
					error: 'Patient not found'
				}));
				return;
			}

			// Create updated patient object
			const updatedPatient = {
				...currentState.patients[patientIndex],
				...updates,
				patientProfile: {
					...currentState.patients[patientIndex].patientProfile,
					...(updates.patientProfile || {})
				}
			};

			// Optimistically update the store
			update((state) => {
				const newPatients = [...state.patients];
				newPatients[patientIndex] = updatedPatient;
				return {
					...state,
					patients: newPatients,
					filteredPatients: filterPatients(newPatients, state.searchQuery)
				};
			});

			try {
				const response = await api.put(`/api/user/${patientId}`, updates);

				if (!response.ok) {
					throw new Error('Failed to update patient');
				}

				update((state) => ({
					...state,
					loading: false,
					success: true
				}));

				// Reset success after 2 seconds
				setTimeout(() => {
					update((state) => ({ ...state, success: false }));
				}, 2000);
			} catch (error) {
				console.error('Error updating patient:', error);

				// Revert the optimistic update
				update((state) => {
					const revertedPatients = [...state.patients];
					revertedPatients[patientIndex] = currentState.patients[patientIndex];
					return {
						...state,
						patients: revertedPatients,
						filteredPatients: filterPatients(revertedPatients, state.searchQuery),
						loading: false,
						error: 'Failed to update patient'
					};
				});
			}
		},

		removePatient: (patientId) => {
			update((state) => {
				const updatedPatients = state.patients.filter((p) => p._id !== patientId);
				return {
					...state,
					patients: updatedPatients,
					filteredPatients: filterPatients(updatedPatients, state.searchQuery)
				};
			});
		}
	};
}

function filterPatients(patients, query) {
	if (!query) return patients;

	const searchPattern = new RegExp(query, 'i');
	return patients.filter((patient) => {
		const phoneNumber = patient?.patientProfile?.phoneNumber;
		return (
			searchPattern.test(patient.fullName) ||
			searchPattern.test(patient.email) ||
			(phoneNumber && searchPattern.test(phoneNumber))
		);
	});
}

export const patientsStore = createPatientsStore();
