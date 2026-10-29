import { register, init, getLocaleFromNavigator } from 'svelte-i18n';

export {
	t,
	locale,
	locales,
	dictionary,
	waitLocale,
	getLocaleFromNavigator,
	isLoading
} from 'svelte-i18n';

register('en', () => import('./i18n/en.json'));
register('fr', () => import('./i18n/fr.json'));

init({
	fallbackLocale: 'en',
	initialLocale: getLocaleFromNavigator()
});
