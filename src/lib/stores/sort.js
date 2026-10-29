import { writable, derived } from 'svelte/store';

/**
 * Creates a reusable sort store that can be applied to any list store.
 *
 * @param {import('svelte/store').Readable<any[]>} sourceStore - A readable store containing the array to sort
 * @param {string} defaultKey - The field key to sort by initially
 * @returns {{ subscribe, sorted, key, dir, toggle }}
 *
 * Usage:
 *   const sort = createSortStore(filteredItems, 'name');
 *   // In template: {#each $sort.sorted as item}
 *   // On header click: sort.toggle('name')
 *   // Active column check: $sort.key === 'name'
 *   // Direction check: $sort.dir === 1 (asc) or -1 (desc)
 */
export function createSortStore(sourceStore, defaultKey = '') {
	const state = writable({ key: defaultKey, dir: 1 });

	const sorted = derived([state, sourceStore], ([$state, $items]) =>
		[...$items].sort((a, b) => {
			const av = a[$state.key] ?? '';
			const bv = b[$state.key] ?? '';
			if (av < bv) return -$state.dir;
			if (av > bv) return $state.dir;
			return 0;
		})
	);

	// Expose state fields reactively by merging them into the sorted derived store
	const combined = derived([state, sorted], ([$state, $sorted]) => ({
		key: $state.key,
		dir: $state.dir,
		sorted: $sorted
	}));

	return {
		subscribe: combined.subscribe,
		toggle(key) {
			state.update((s) => (s.key === key ? { key, dir: s.dir * -1 } : { key, dir: 1 }));
		}
	};
}
