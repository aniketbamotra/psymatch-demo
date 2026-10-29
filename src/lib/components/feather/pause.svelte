<script>
	export let size = 24;
	export let strokeWidth = 2;
	let className = '';
	export { className as class };
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="currentColor"
	stroke="none"
	stroke-width={strokeWidth}
	stroke-linecap="round"
	stroke-linejoin="round"
	class={className}
>
	<rect x="6" y="4" width="4" height="16" />
	<rect x="14" y="4" width="4" height="16" />
</svg>
