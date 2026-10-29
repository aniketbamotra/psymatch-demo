<script>
	import { onMount, onDestroy } from 'svelte';

	export let value = '';
	export let disabled = false;
	export let label = '';
	export let required = false;
	export let variant = 'default'; // 'default' or 'intake'

	const languages = [
		{ code: 'en', label: 'English' },
		{ code: 'fr', label: 'French' }
	];

	let showDropdown = false;
	let dropdownRef;
	let buttonRef;
	let dropdownPosition = { top: 0, left: 0, width: 0 };

	// Get display text for selected language
	$: selectedLang = languages.find((l) => l.code === value);
	$: displayText = selectedLang ? selectedLang.label : value || 'Select...';

	// Calculate dropdown position for fixed positioning
	function calculateDropdownPosition() {
		if (buttonRef && variant === 'intake') {
			const rect = buttonRef.getBoundingClientRect();
			dropdownPosition = {
				top: rect.bottom + 4, // 4px gap (mt-1)
				left: rect.left,
				width: rect.width
			};
		}
	}

	// Toggle dropdown
	function toggleDropdown(e) {
		if (disabled) return;
		if (e) {
			e.preventDefault();
			e.stopPropagation();
		}
		if (!showDropdown && variant === 'intake') {
			calculateDropdownPosition();
		}
		showDropdown = !showDropdown;
	}

	// Select a language
	function selectLanguage(languageCode) {
		value = languageCode;
		showDropdown = false;
	}

	// Close dropdown when clicking outside
	function handleClickOutside(event) {
		if (
			dropdownRef &&
			!dropdownRef.contains(event.target) &&
			buttonRef &&
			!buttonRef.contains(event.target)
		) {
			showDropdown = false;
		}
	}

	function updatePosition() {
		if (showDropdown && variant === 'intake') {
			calculateDropdownPosition();
		}
	}

	onMount(() => {
		window.addEventListener('click', handleClickOutside);
		if (variant === 'intake') {
			window.addEventListener('scroll', updatePosition, true);
			window.addEventListener('resize', updatePosition);
		}
	});

	onDestroy(() => {
		if (typeof window !== 'undefined') {
			window.removeEventListener('click', handleClickOutside);
			if (variant === 'intake') {
				window.removeEventListener('scroll', updatePosition, true);
				window.removeEventListener('resize', updatePosition);
			}
		}
	});
</script>

<div class="relative w-full {variant === 'auth' ? 'flex justify-center' : ''}">
	{#if label && variant !== 'auth'}
		<label
			class={variant === 'intake'
				? 'self-stretch text-black text-sm font-normal leading-none'
				: 'block text-sm font-medium text-gray-700 mb-1'}
		>
			{label}
			{#if required}
				<span class="text-red-500">*</span>
			{/if}
		</label>
	{/if}

	<!-- Trigger Button -->
	<button
		type="button"
		bind:this={buttonRef}
		class="{variant === 'intake'
			? 'w-full px-5 py-5 text-Gray_Dark rounded-[0.5625rem] bg-[#eef2f1] text-base font-light leading-snug outline-none border-none focus:ring-0 flex items-center justify-between'
			: variant === 'auth' || variant === 'auth_mobile'
				? 'flex items-center gap-1.5 py-2 font-medium focus:outline-none'
				: 'w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-Success bg-white flex items-center justify-between'} {disabled
			? 'opacity-50 cursor-not-allowed'
			: 'cursor-pointer'}"
		on:click={toggleDropdown}
		{disabled}
	>
		<span
			class="flex items-center gap-1.5 {value
				? variant === 'intake'
					? 'text-black'
					: variant === 'auth' || variant === 'auth_mobile'
						? 'text-Success'
						: 'text-gray-900'
				: variant === 'intake'
					? 'text-Gray_Dark'
					: variant === 'auth' || variant === 'auth_mobile'
						? 'text-Success'
						: 'text-gray-500'}"
		>
			{#if variant === 'auth' || variant === 'auth_mobile'}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="h-4 w-4 text-Success"
					><circle cx="12" cy="12" r="10" /><path
						d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"
					/><path d="M2 12h20" /></svg
				>
			{/if}
			{displayText}
		</span>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="h-4 w-4 {variant === 'intake'
				? 'text-Gray_Dark'
				: variant === 'auth' || variant === 'auth_mobile'
					? 'text-Success'
					: 'text-gray-400'} transition-transform {showDropdown ? 'rotate-180' : ''}"
			viewBox="0 0 20 20"
			fill="currentColor"
		>
			<path
				fill-rule="evenodd"
				d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
				clip-rule="evenodd"
			/>
		</svg>
	</button>

	<!-- Dropdown Menu -->
	{#if showDropdown && !disabled}
		<div
			bind:this={dropdownRef}
			class="{variant === 'intake' ? 'fixed' : 'absolute'} z-[9999] {variant === 'intake'
				? ''
				: variant === 'auth'
					? 'top-full left-1/2 -translate-x-1/2 w-40 mt-2 p-[10px]'
					: variant === 'auth_mobile'
						? 'top-full left-0 w-40 mt-2 p-[10px]'
						: 'top-full left-0 mt-1 w-full p-[14px]'} bg-white {variant === 'auth' ||
			variant === 'auth_mobile'
				? 'rounded-[1.25rem] shadow-[0_10px_30px_rgba(0,0,0,0.08)]'
				: 'rounded-lg shadow-lg'} overflow-hidden"
			style={variant === 'intake'
				? `top: ${dropdownPosition.top}px; left: ${dropdownPosition.left}px; width: ${dropdownPosition.width}px;`
				: ''}
		>
			{#each languages as language, index}
				<button
					type="button"
					class="w-full text-center transition-colors {variant === 'auth' ||
					variant === 'auth_mobile'
						? value === language.code
							? 'bg-Success text-white rounded-full py-2.5 px-4 text-sm'
							: 'bg-transparent text-Success hover:bg-gray-50 rounded-full py-2.5 px-4 text-sm'
						: value === language.code
							? 'bg-Success text-white rounded-lg px-4 py-3'
							: index === 0
								? 'bg-white text-Success hover:bg-gray-100 hover:rounded-lg rounded-t-lg px-4 py-3'
								: 'bg-white text-Success hover:bg-gray-100 hover:rounded-lg px-4 py-3'}"
					on:click={() => selectLanguage(language.code)}
				>
					{language.label}
				</button>
				{#if index < languages.length - 1}
					<div
						class="h-px {variant === 'auth' || variant === 'auth_mobile'
							? 'bg-gray-100 my-1 mx-3'
							: 'bg-gray-200 my-2'}"
					></div>
				{/if}
			{/each}
		</div>
	{/if}
</div>
