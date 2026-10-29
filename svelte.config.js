import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		// Explicit adapter: adapter-auto ignores options and installs adapter-vercel@4,
		// which rejects Node 22 (Vercel has discontinued Node 20).
		adapter: adapter({
			runtime: 'nodejs22.x'
		}),
		csrf: {
			checkOrigin: false
		}
	},
	preprocess: vitePreprocess()
};

export default config;
