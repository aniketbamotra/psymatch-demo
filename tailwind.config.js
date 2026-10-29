/** @type {import('tailwindcss').Config} */
import forms from '@tailwindcss/forms';

export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		extend: {
			colors: {
				Success: '#00A886',
				Black: '#000000',
				white: '#ffffff',
				Somke_BG: '#ecedf2',
				Gray_Dark: '#8b8e8c',
				Success_Dark: '#015645',
				Gray_Light: '#e1dfdf',
				Success_hover: '#02755e',
				Lightest_gray: '#eef2f1',
				Gradient_Mob: '#ecedf2',
				white_5: '#ffffff',
				Gradient_BG_Center: '#ecedf2'
			},
			fontSize: {
				xs: '0.5rem',
				xs_1: '0.6875rem',
				sm: '0.875rem',
				base: '1rem',
				lg: '1.25rem',
				xl: '1.5rem',
				'2xl': '2.5rem'
			},
			fontFamily: { 'inter-display': 'Inter Display' },
			boxShadow: { Main_Shadow_L: '-6px 9px 51.5px 0px rgba(0,0,0,0.11)' }
		}
	},
	plugins: [forms]
};
