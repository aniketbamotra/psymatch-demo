import { writable } from 'svelte/store';
import * as api from '$lib/api';

function createPatientTestsStore() {
	const { subscribe, update } = writable({
		tests: [],
		loading: false,
		error: null
	});

	return {
		subscribe,
		loadTests: async (patientId) => {
			update((state) => ({ ...state, loading: true, error: null }));
			try {
				const response = await api.get(`/api/allocated-tests/progress/${patientId}`);
				if (response.ok) {
					const tests = await response.json();
					update((state) => ({
						...state,
						tests: tests.map((test) => ({
							...test,
							status: test.progress === 100 ? 'Completed' : 'In Progress'
						})),
						loading: false
					}));
				} else {
					throw new Error('Failed to fetch tests');
				}
			} catch (error) {
				console.error('Error loading tests:', error);
				update((state) => ({
					...state,
					error: 'Failed to load tests',
					loading: false
				}));
			}
		},
		removeTest: async (testId) => {
			try {
				const response = await api.del(`/api/allocated-tests/${testId}`);
				if (response.ok) {
					update((state) => ({
						...state,
						tests: state.tests.filter((t) => t.id !== testId)
					}));
				} else {
					throw new Error('Failed to remove test');
				}
			} catch (error) {
				console.error('Error removing test:', error);
			}
		}
	};
}

export const patientTestsStore = createPatientTestsStore();
