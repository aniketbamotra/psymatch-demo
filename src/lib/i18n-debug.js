import { derived } from 'svelte/store';
import { t } from 'svelte-i18n';
import { browser } from '$app/environment';

// Debug mode store
export const debugMode = derived(t, ($t) => {
	return (key, vars) => {
		const translation = $t(key, vars);

		if (!browser) return translation;

		// Check for debug flag in localStorage or environment variable
		const isDebug =
			localStorage.getItem('i18n_debug') === 'true' || import.meta.env.VITE_I18N_DEBUG === 'true';

		if (isDebug) {
			return `${translation}-t`;
		}

		return translation;
	};
});
