import { writable } from 'svelte/store';
import * as api from '$lib/api';

function createPatientNotesStore() {
	const { subscribe, set, update } = writable({
		notes: [],
		intakeNote: null,
		currentPatientId: null,
		loading: false,
		error: null,
		success: false
	});

	return {
		subscribe,
		set,
		addNote: async (patientId, content) => {
			update((state) => ({ ...state, loading: true, error: null, success: false }));

			const newNote = {
				id: crypto.randomUUID(),
				patientId,
				content,
				author: {
					id: localStorage.getItem('userId'),
					name: localStorage.getItem('userName')
				},
				createdAt: new Date().toISOString(),
				isIntakeNote: false
			};

			// Optimistically update the store
			update((state) => ({
				...state,
				notes: [...state.notes, newNote]
			}));

			try {
				// Get current state
				let currentState;
				update((state) => {
					currentState = state;
					return state;
				});

				// Save to backend
				const response = await api.put(`/api/user/${patientId}`, {
					patientProfile: {
						notes: [...currentState.notes, newNote].map((note) => ({
							adminId: note.author.id,
							adminName: note.author.name,
							note: note.content,
							timestamp: note.createdAt
						}))
					}
				});

				if (!response.ok) {
					throw new Error('Failed to save note');
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
				console.error('Error saving note:', error);
				// Revert the optimistic update
				update((state) => ({
					...state,
					notes: state.notes.filter((n) => n.id !== newNote.id),
					loading: false,
					error: 'Failed to save note'
				}));
			}
		},
		setIntakeNote: (patientId, content, adminInfo) => {
			update((state) => {
				const intakeNote = {
					id: 'intake',
					patientId,
					content,
					author: {
						id: adminInfo.id,
						name: adminInfo.name
					},
					createdAt: new Date().toISOString(),
					isIntakeNote: true
				};

				return {
					...state,
					intakeNote
				};
			});
		},
		loadNotes: async (patientId, intakeNote = null, intakeAdmin = null) => {
			update((state) => ({ ...state, loading: true, error: null }));
			try {
				// Get the latest notes from the backend
				const response = await api.get(`/api/user/${patientId}`);
				let notes = [];

				if (response.ok) {
					const userData = await response.json();
					notes = (userData.user.patientProfile?.notes || []).map((note) => ({
						id: crypto.randomUUID(),
						patientId,
						content: note.note,
						author: {
							id: note.adminId,
							name: note.adminName
						},
						createdAt: note.timestamp,
						isIntakeNote: false
					}));
				}

				set({
					notes,
					currentPatientId: patientId,
					intakeNote: intakeNote
						? {
								id: 'intake',
								patientId,
								content: intakeNote,
								author: intakeAdmin || { name: 'Admin' },
								createdAt: null,
								isIntakeNote: true
							}
						: null,
					loading: false,
					error: null
				});
			} catch (error) {
				console.error('Error loading notes:', error);
				set({
					notes: [],
					currentPatientId: patientId,
					intakeNote: intakeNote
						? {
								id: 'intake',
								patientId,
								content: intakeNote,
								author: intakeAdmin || { name: 'Admin' },
								createdAt: null,
								isIntakeNote: true
							}
						: null,
					loading: false,
					error: 'Failed to load notes'
				});
			}
		}
	};
}

export const patientNotesStore = createPatientNotesStore();
