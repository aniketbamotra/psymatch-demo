import { writable, derived } from 'svelte/store';

function createAdminsStore() {
	const { subscribe, set, update } = writable({
		admins: [],
		searchQuery: ''
	});

	return {
		subscribe,
		setAdmins: (admins) => {
			update((store) => ({
				...store,
				admins
			}));
		},
		setSearchQuery: (query) => {
			update((store) => ({
				...store,
				searchQuery: query
			}));
		},
		removeAdmin: (adminId) => {
			update((store) => ({
				...store,
				admins: store.admins.filter((admin) => admin._id !== adminId)
			}));
		}
	};
}

export const adminsStore = createAdminsStore();

// Derived store for filtered admins
export const filteredAdmins = derived(adminsStore, ($store) => {
	const query = $store.searchQuery.toLowerCase();
	return $store.admins.filter(
		(admin) =>
			admin.fullName.toLowerCase().includes(query) || admin.email.toLowerCase().includes(query)
	);
});
