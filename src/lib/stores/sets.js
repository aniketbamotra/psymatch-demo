import { writable, derived } from 'svelte/store';

function createSetsStore() {
	const { subscribe, set, update } = writable({
		sets: [],
		searchQuery: '',
		selectedIds: []
	});

	return {
		subscribe,
		setSets: (sets) => {
			update((store) => ({ ...store, sets }));
		},
		addSet: (newSet) => {
			update((store) => ({ ...store, sets: [...store.sets, newSet] }));
		},
		updateSet: (updatedSet) => {
			update((store) => ({
				...store,
				sets: store.sets.map((s) => (s._id === updatedSet._id ? updatedSet : s))
			}));
		},
		removeSet: (setId) => {
			update((store) => ({
				...store,
				sets: store.sets.filter((s) => s._id !== setId),
				selectedIds: store.selectedIds.filter((id) => id !== setId)
			}));
		},
		removeSets: (setIds) => {
			update((store) => ({
				...store,
				sets: store.sets.filter((s) => !setIds.includes(s._id)),
				selectedIds: store.selectedIds.filter((id) => !setIds.includes(id))
			}));
		},
		updateStatuses: (updates) => {
			update((store) => ({
				...store,
				sets: store.sets.map((s) => {
					const match = updates.find((u) => u._id === s._id);
					return match ? { ...s, status: match.status } : s;
				})
			}));
		},
		setSearchQuery: (query) => {
			update((store) => ({ ...store, searchQuery: query }));
		},
		toggleSelection: (setId) => {
			update((store) => {
				const already = store.selectedIds.includes(setId);
				return {
					...store,
					selectedIds: already
						? store.selectedIds.filter((id) => id !== setId)
						: [...store.selectedIds, setId]
				};
			});
		},
		selectAll: (ids) => {
			update((store) => ({ ...store, selectedIds: ids }));
		},
		clearSelection: () => {
			update((store) => ({ ...store, selectedIds: [] }));
		}
	};
}

export const setsStore = createSetsStore();

export const filteredSets = derived(setsStore, ($store) => {
	const query = $store.searchQuery.toLowerCase().trim();
	if (!query) return $store.sets;
	return $store.sets.filter((s) => s.set_name.toLowerCase().includes(query));
});
