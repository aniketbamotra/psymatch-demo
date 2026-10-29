import { writable } from 'svelte/store';

function createLegalsStore() {
	const { subscribe, set, update } = writable({
		tos: { content: { en: '', fr: '' }, version: 0 },
		privacyOfficer: { name: '', email: '', phone: '', mailingAddress: '', version: 0 },
		activeJurisdiction: { key: '', label: { en: '', fr: '' }, content: { en: '', fr: '' }, version: 0 },
		activeJurisdictionVersion: 0,
		jurisdictions: []
	});

	return {
		subscribe,
		setBundle: (bundle) => set(bundle),
		updateDoc: (kind, patch) =>
			update((store) => ({
				...store,
				[kind]: { ...store[kind], ...patch }
			})),
		setActiveJurisdiction: (key) =>
			update((store) => {
				const j = store.jurisdictions.find((x) => x.key === key);
				return j
					? {
							...store,
							activeJurisdiction: { ...j }
					  }
					: store;
			})
	};
}

export const legalsStore = createLegalsStore();
