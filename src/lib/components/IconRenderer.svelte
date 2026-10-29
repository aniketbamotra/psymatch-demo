<script>
	export let size = 'small';
	export let class_ = '';
</script>

{#if size === 'small'}
	<span class="w-3 h-3 relative stroke-[0.14rem] {class_}"><slot></slot></span>
{/if}
{#if size === 'large'}
	<span class="w-5 h-5 relative stroke-[0.12rem] {class_}"><slot></slot></span>
{/if}
{#if size === 'large_2'}
	<span class="w-[1.75rem] h-[1.75rem] relative stroke-[0.12rem] {class_}"><slot></slot></span>
{/if}
