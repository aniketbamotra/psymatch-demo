import { writable } from 'svelte/store';

// Controls visibility of the TOS modal. Set true by (app)/+layout.svelte when
// the server-side gate reports needsTOS, cleared by TOSModal.svelte on accept.
export const showTOSModal = writable(false);
