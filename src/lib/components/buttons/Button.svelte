<script>
	export let label = '',
		outline = false,
		icon = false,
		iconOnSide = 'right',
		size = 'large',
		pressed = false,
		disabled = false,
		cover = false,
		onClick = () => {},
		overide = '',
		leftAlign = false,
		loading = false,
		loadingText = '',
		success = false,
		successText = 'Success!',
		successClass = null,
		type = 'button';

	import IconRenderer from '$lib/components/IconRenderer.svelte';
	import { debugMode as t } from '$lib/i18n-debug';

	export let variant = 'primary'; // primary, outline, danger

	let btnState = {
		primary: 'bg-Success hover:bg-Success_hover text-white',
		pressed: 'bg-Success_Dark text-white',
		disabled: 'bg-Gray_Dark text-white',
		outline: 'border border-Black text-Black hover:bg-Black hover:text-white bg-opacity-[30]',
		disabledOutline: 'border border-Gray_Dark text-Gray_Dark',
		outlinePressed: `border border-Black bg-Black text-white `,
		danger: 'bg-red-600 hover:bg-red-700 text-white',
		dangerLoading: 'bg-red-600 text-white cursor-wait',
		dangerSuccess: 'bg-red-600 text-white',
		loadingPressed: 'bg-Success_Dark text-white cursor-wait',
		loadingOutlinePressed: `border border-Black ${successClass ? successClass : 'bg-Black'} text-white cursor-wait`,
		successPressed: 'bg-Success_Dark text-white',
		successOutlinePressed: `border border-Black ${successClass ? successClass : 'bg-Black'} text-white`,
		size: {
			small: 'min-h-7 text-sm p-2.5 gap-0.5',
			large: 'min-h-12 text-base px-6 py-3.5 gap-1'
		}
	};

	$: isOutline = outline || variant === 'outline';
	$: state = `${pressed ? 'pressed' : ''}${isOutline ? 'outline' : ''}${disabled ? 'disabled' : ''}${loading ? 'loading' : ''}${success ? 'success' : ''}`;
	$: console.log('Button State:', state);
	$: buttonState = (() => {
		// Handle danger variant with all states
		if (variant === 'danger') {
			if (loading) return btnState.dangerLoading;
			if (success) return btnState.dangerSuccess;
			if (disabled) return btnState.disabled;
			return btnState.danger;
		}

		switch (state) {
			case 'pressedloading':
				return btnState.loadingPressed;
			case 'pressedoutlineloading':
				return btnState.loadingOutlinePressed;
			case 'pressed':
				return btnState.pressed;
			case 'pressedoutline':
				return btnState.outlinePressed;
			case 'disabled':
				return btnState.disabled;
			case 'outline':
				return btnState.outline;
			case 'outlinedisabled':
				return btnState.disabledOutline;
			case 'loading':
				return btnState.loadingPressed;
			case 'outlineloading':
				return btnState.loadingOutlinePressed;
			case 'success':
				return btnState.successPressed;
			case 'outlinesuccess':
				return btnState.successOutlinePressed;
			default:
				return btnState.primary;
		}
	})();
</script>

<button
	on:click={(e) => {
		if (!loading && !disabled && !success) {
			onClick(e);
		}
	}}
	class="{size === 'small' ? btnState.size.small : btnState.size.large} {buttonState} {cover
		? 'w-full h-full'
		: ''} font-medium leading-none rounded-[0.5625rem] lg:rounded-l-[0.5625rem] {leftAlign
		? 'justify-normal'
		: 'justify-center'} items-center inline-flex {loading ? 'cursor-wait' : ''} {overide} {success
		? 'cursor-not-allowed'
		: ''}"
	{type}
	disabled={disabled || loading || success}
>
	{#if loading}
		<svg
			class="animate-spin mr-2"
			width={size === 'small' ? '16' : '20'}
			height={size === 'small' ? '16' : '20'}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="3"
		>
			<path
				class="opacity-25"
				d="M12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2Z"
			/>
			<path
				class="opacity-75 animate-trim"
				d="M12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2Z"
				stroke-dasharray="60"
				stroke-linecap="round"
			/>
		</svg>
	{:else if success}
		<svg
			class="mr-2"
			width={size === 'small' ? '16' : '20'}
			height={size === 'small' ? '16' : '20'}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="3"
		>
			<polyline points="20 6 9 17 4 12" />
		</svg>
	{:else if icon && iconOnSide === 'left'}
		<IconRenderer {size}>
			<slot name="icon"></slot>
		</IconRenderer>
	{/if}
	<div>
		{#if label === 'Back'}
			<span class="lg:block hidden">{label}</span>
			<svg
				viewBox="0 0 24 24"
				class="h-5 w-5 lg:hidden"
				stroke="currentColor"
				stroke-width="2"
				fill="none"
				stroke-linecap="round"
				stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg
			>
		{:else if label && !loading && !success}
			{label}
		{:else if loading}
			{loadingText ? loadingText : $t('Questionnaire.Button.loading')}
		{:else if success}
			{successText}
		{:else}
			<slot></slot>
		{/if}
	</div>
	{#if icon && iconOnSide === 'right' && !loading && !success}
		<IconRenderer {size}>
			<slot name="icon"></slot>
		</IconRenderer>
	{/if}
	{#if false}
		<svg
			class="ml-2"
			width={size === 'small' ? '16' : '20'}
			height={size === 'small' ? '16' : '20'}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="3"
		>
			<path
				class="animate-check"
				d="M20 6L9 17L4 12"
				stroke-dasharray="30"
				stroke-dashoffset="30"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
	{/if}
</button>

<style>
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@keyframes trim {
		0% {
			stroke-dashoffset: 60;
		}
		50% {
			stroke-dashoffset: 30;
		}
		100% {
			stroke-dashoffset: 60;
		}
	}

	@keyframes check {
		to {
			stroke-dashoffset: 0;
		}
	}

	.animate-spin {
		animation: spin 1s linear infinite;
	}

	.animate-trim {
		animation: trim 1.5s ease-in-out infinite;
	}

	.animate-check {
		animation: check 0.5s ease-in-out forwards;
	}
</style>
