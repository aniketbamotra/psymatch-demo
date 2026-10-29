import { writable } from 'svelte/store';

const initialState = 'Home';

function createNavStore() {
	const { subscribe, set, get } = writable(initialState);

	return {
		subscribe,
		set,
		get,
		update(value) {
			set(value);
		},
		reset() {
			set(initialState);
		}
	};
}

const questions = false;
function createQuestionStat() {
	const { subscribe, set, get } = writable(questions);

	return {
		subscribe,
		set,
		get,
		update(value) {
			set(value);
		},
		reset() {
			set(questions);
		}
	};
}

const initialIntakeForm = {
	step: 1,
	formData: {
		fullName: '',
		email: '',
		phoneNumber: '',
		preferredCommunication: '',
		// Mandatory field — pre-selected as English so a reset never leaves it blank.
		preferredLanguage: 'en',
		intakeNote: '',
		fileMakerId: '',
		selectedQuestionnaires: []
	}
};

function createIntakeFormStore() {
	const { subscribe, set, update } = writable(initialIntakeForm);

	return {
		subscribe,
		setStep: (step) => update((state) => ({ ...state, step })),
		updateFormData: (data) =>
			update((state) => ({
				...state,
				formData: { ...state.formData, ...data }
			})),
		reset: () => set(initialIntakeForm)
	};
}

// Enhanced store for selected patient with localStorage persistence
function createSelectedPatientStore() {
	// Get initial value from localStorage if available
	const storedPatientId =
		typeof window !== 'undefined' ? window.localStorage.getItem('selectedPatientId') : null;

	const { subscribe, set } = writable(storedPatientId);

	return {
		subscribe,
		set: (patientId) => {
			if (typeof window !== 'undefined') {
				if (patientId) {
					window.localStorage.setItem('selectedPatientId', patientId);
				} else {
					window.localStorage.removeItem('selectedPatientId');
				}
			}
			set(patientId);
		},
		reset: () => {
			if (typeof window !== 'undefined') {
				window.localStorage.removeItem('selectedPatientId');
			}
			set(null);
		}
	};
}

export const navState = createNavStore();
export const questionnaire = createQuestionStat();
export const intakeForm = createIntakeFormStore();
export const selectedPatient = createSelectedPatientStore();
export const showRedactionProfile = writable(false);
export const redactionRegenerating = writable({ active: false, percent: 0, step: '' });
