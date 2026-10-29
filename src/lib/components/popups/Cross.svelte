<script>
	import { navState } from '$lib/stores';
	let onClick = () => {
		navState.update('Home');
	};
</script>

<button on:click={onClick}>
	<svg xmlns="http://www.w3.org/2000/svg" width="25" height="26" viewBox="0 0 25 26" fill="none">
		<path
			d="M18.75 6.75L6.25 19.25"
			stroke="black"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
		<path
			d="M6.25 6.75L18.75 19.25"
			stroke="black"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
	</svg>
</button>
