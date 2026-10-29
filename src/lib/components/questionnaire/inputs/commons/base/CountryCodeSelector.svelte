<script>
	import { createEventDispatcher, onMount } from 'svelte';
	const dispatch = createEventDispatcher();

	export let value = '+1'; // Default to Canada
	export let label = '';
	export let error = null;
	export let loading = false;
	export let success = false;
	export let required = false;
	export let isValid = true; // Default to valid with Canada selected

	let searchTerm = '';
	let showDropdown = false;
	let selectedCountry = null;
	let filteredCountries = [];
	let dropdownRef;
	let inputRef;

	// List of country codes with flags and names - alphabetically ordered
	const countries = [
		{ code: '+93', name: 'Afghanistan', flag: '🇦🇫' },
		{ code: '+355', name: 'Albania', flag: '🇦🇱' },
		{ code: '+213', name: 'Algeria', flag: '🇩🇿' },
		{ code: '+376', name: 'Andorra', flag: '🇦🇩' },
		{ code: '+244', name: 'Angola', flag: '🇦🇴' },
		{ code: '+1', name: 'Antigua and Barbuda', flag: '🇦🇬' },
		{ code: '+54', name: 'Argentina', flag: '🇦🇷' },
		{ code: '+374', name: 'Armenia', flag: '🇦🇲' },
		{ code: '+61', name: 'Australia', flag: '🇦🇺' },
		{ code: '+43', name: 'Austria', flag: '🇦🇹' },
		{ code: '+994', name: 'Azerbaijan', flag: '🇦🇿' },
		{ code: '+1', name: 'Bahamas', flag: '🇧🇸' },
		{ code: '+973', name: 'Bahrain', flag: '🇧🇭' },
		{ code: '+880', name: 'Bangladesh', flag: '🇧🇩' },
		{ code: '+1', name: 'Barbados', flag: '🇧🇧' },
		{ code: '+375', name: 'Belarus', flag: '🇧🇾' },
		{ code: '+32', name: 'Belgium', flag: '🇧🇪' },
		{ code: '+501', name: 'Belize', flag: '🇧🇿' },
		{ code: '+229', name: 'Benin', flag: '🇧🇯' },
		{ code: '+975', name: 'Bhutan', flag: '🇧🇹' },
		{ code: '+591', name: 'Bolivia', flag: '🇧🇴' },
		{ code: '+387', name: 'Bosnia and Herzegovina', flag: '🇧🇦' },
		{ code: '+267', name: 'Botswana', flag: '🇧🇼' },
		{ code: '+55', name: 'Brazil', flag: '🇧🇷' },
		{ code: '+673', name: 'Brunei', flag: '🇧🇳' },
		{ code: '+359', name: 'Bulgaria', flag: '🇧🇬' },
		{ code: '+226', name: 'Burkina Faso', flag: '🇧🇫' },
		{ code: '+257', name: 'Burundi', flag: '🇧🇮' },
		{ code: '+855', name: 'Cambodia', flag: '🇰🇭' },
		{ code: '+237', name: 'Cameroon', flag: '🇨🇲' },
		{ code: '+1', name: 'Canada', flag: '🇨🇦' },
		{ code: '+238', name: 'Cape Verde', flag: '🇨🇻' },
		{ code: '+236', name: 'Central African Republic', flag: '🇨🇫' },
		{ code: '+235', name: 'Chad', flag: '🇹🇩' },
		{ code: '+56', name: 'Chile', flag: '🇨🇱' },
		{ code: '+86', name: 'China', flag: '🇨🇳' },
		{ code: '+57', name: 'Colombia', flag: '🇨🇴' },
		{ code: '+269', name: 'Comoros', flag: '🇰🇲' },
		{ code: '+242', name: 'Congo', flag: '🇨🇬' },
		{ code: '+243', name: 'Congo, Democratic Republic', flag: '🇨🇩' },
		{ code: '+506', name: 'Costa Rica', flag: '🇨🇷' },
		{ code: '+225', name: "Cote d'Ivoire", flag: '🇨🇮' },
		{ code: '+385', name: 'Croatia', flag: '🇭🇷' },
		{ code: '+53', name: 'Cuba', flag: '🇨🇺' },
		{ code: '+357', name: 'Cyprus', flag: '🇨🇾' },
		{ code: '+420', name: 'Czech Republic', flag: '🇨🇿' },
		{ code: '+45', name: 'Denmark', flag: '🇩🇰' },
		{ code: '+253', name: 'Djibouti', flag: '🇩🇯' },
		{ code: '+1', name: 'Dominica', flag: '🇩🇲' },
		{ code: '+1', name: 'Dominican Republic', flag: '🇩🇴' },
		{ code: '+670', name: 'East Timor', flag: '🇹🇱' },
		{ code: '+593', name: 'Ecuador', flag: '🇪🇨' },
		{ code: '+20', name: 'Egypt', flag: '🇪🇬' },
		{ code: '+503', name: 'El Salvador', flag: '🇸🇻' },
		{ code: '+240', name: 'Equatorial Guinea', flag: '🇬🇶' },
		{ code: '+291', name: 'Eritrea', flag: '🇪🇷' },
		{ code: '+372', name: 'Estonia', flag: '🇪🇪' },
		{ code: '+251', name: 'Ethiopia', flag: '🇪🇹' },
		{ code: '+679', name: 'Fiji', flag: '🇫🇯' },
		{ code: '+358', name: 'Finland', flag: '🇫🇮' },
		{ code: '+33', name: 'France', flag: '🇫🇷' },
		{ code: '+241', name: 'Gabon', flag: '🇬🇦' },
		{ code: '+220', name: 'Gambia', flag: '🇬🇲' },
		{ code: '+995', name: 'Georgia', flag: '🇬🇪' },
		{ code: '+49', name: 'Germany', flag: '🇩🇪' },
		{ code: '+233', name: 'Ghana', flag: '🇬🇭' },
		{ code: '+30', name: 'Greece', flag: '🇬🇷' },
		{ code: '+1', name: 'Grenada', flag: '🇬🇩' },
		{ code: '+502', name: 'Guatemala', flag: '🇬🇹' },
		{ code: '+224', name: 'Guinea', flag: '🇬🇳' },
		{ code: '+245', name: 'Guinea-Bissau', flag: '🇬🇼' },
		{ code: '+592', name: 'Guyana', flag: '🇬🇾' },
		{ code: '+509', name: 'Haiti', flag: '🇭🇹' },
		{ code: '+504', name: 'Honduras', flag: '🇭🇳' },
		{ code: '+852', name: 'Hong Kong', flag: '🇭🇰' },
		{ code: '+36', name: 'Hungary', flag: '🇭🇺' },
		{ code: '+354', name: 'Iceland', flag: '🇮🇸' },
		{ code: '+91', name: 'India', flag: '🇮🇳' },
		{ code: '+62', name: 'Indonesia', flag: '🇮🇩' },
		{ code: '+98', name: 'Iran', flag: '🇮🇷' },
		{ code: '+964', name: 'Iraq', flag: '🇮🇶' },
		{ code: '+353', name: 'Ireland', flag: '🇮🇪' },
		{ code: '+972', name: 'Israel', flag: '🇮🇱' },
		{ code: '+39', name: 'Italy', flag: '🇮🇹' },
		{ code: '+1', name: 'Jamaica', flag: '🇯🇲' },
		{ code: '+81', name: 'Japan', flag: '🇯🇵' },
		{ code: '+962', name: 'Jordan', flag: '🇯🇴' },
		{ code: '+7', name: 'Kazakhstan', flag: '🇰🇿' },
		{ code: '+254', name: 'Kenya', flag: '🇰🇪' },
		{ code: '+686', name: 'Kiribati', flag: '🇰🇮' },
		{ code: '+850', name: 'North Korea', flag: '🇰🇵' },
		{ code: '+82', name: 'South Korea', flag: '🇰🇷' },
		{ code: '+965', name: 'Kuwait', flag: '🇰🇼' },
		{ code: '+996', name: 'Kyrgyzstan', flag: '🇰🇬' },
		{ code: '+856', name: 'Laos', flag: '🇱🇦' },
		{ code: '+371', name: 'Latvia', flag: '🇱🇻' },
		{ code: '+961', name: 'Lebanon', flag: '🇱🇧' },
		{ code: '+266', name: 'Lesotho', flag: '🇱🇸' },
		{ code: '+231', name: 'Liberia', flag: '🇱🇷' },
		{ code: '+218', name: 'Libya', flag: '🇱🇾' },
		{ code: '+423', name: 'Liechtenstein', flag: '🇱🇮' },
		{ code: '+370', name: 'Lithuania', flag: '🇱🇹' },
		{ code: '+352', name: 'Luxembourg', flag: '🇱🇺' },
		{ code: '+853', name: 'Macau', flag: '🇲🇴' },
		{ code: '+389', name: 'North Macedonia', flag: '🇲🇰' },
		{ code: '+261', name: 'Madagascar', flag: '🇲🇬' },
		{ code: '+265', name: 'Malawi', flag: '🇲🇼' },
		{ code: '+60', name: 'Malaysia', flag: '🇲🇾' },
		{ code: '+960', name: 'Maldives', flag: '🇲🇻' },
		{ code: '+223', name: 'Mali', flag: '🇲🇱' },
		{ code: '+356', name: 'Malta', flag: '🇲🇹' },
		{ code: '+692', name: 'Marshall Islands', flag: '🇲🇭' },
		{ code: '+222', name: 'Mauritania', flag: '🇲🇷' },
		{ code: '+230', name: 'Mauritius', flag: '🇲🇺' },
		{ code: '+52', name: 'Mexico', flag: '🇲🇽' },
		{ code: '+691', name: 'Micronesia', flag: '🇫🇲' },
		{ code: '+373', name: 'Moldova', flag: '🇲🇩' },
		{ code: '+377', name: 'Monaco', flag: '🇲🇨' },
		{ code: '+976', name: 'Mongolia', flag: '🇲🇳' },
		{ code: '+382', name: 'Montenegro', flag: '🇲🇪' },
		{ code: '+212', name: 'Morocco', flag: '🇲🇦' },
		{ code: '+258', name: 'Mozambique', flag: '🇲🇿' },
		{ code: '+95', name: 'Myanmar', flag: '🇲🇲' },
		{ code: '+264', name: 'Namibia', flag: '🇳🇦' },
		{ code: '+674', name: 'Nauru', flag: '🇳🇷' },
		{ code: '+977', name: 'Nepal', flag: '🇳🇵' },
		{ code: '+31', name: 'Netherlands', flag: '🇳🇱' },
		{ code: '+64', name: 'New Zealand', flag: '🇳🇿' },
		{ code: '+505', name: 'Nicaragua', flag: '🇳🇮' },
		{ code: '+227', name: 'Niger', flag: '🇳🇪' },
		{ code: '+234', name: 'Nigeria', flag: '🇳🇬' },
		{ code: '+47', name: 'Norway', flag: '🇳🇴' },
		{ code: '+968', name: 'Oman', flag: '🇴🇲' },
		{ code: '+92', name: 'Pakistan', flag: '🇵🇰' },
		{ code: '+680', name: 'Palau', flag: '🇵🇼' },
		{ code: '+970', name: 'Palestine', flag: '🇵🇸' },
		{ code: '+507', name: 'Panama', flag: '🇵🇦' },
		{ code: '+675', name: 'Papua New Guinea', flag: '🇵🇬' },
		{ code: '+595', name: 'Paraguay', flag: '🇵🇾' },
		{ code: '+51', name: 'Peru', flag: '🇵🇪' },
		{ code: '+63', name: 'Philippines', flag: '🇵🇭' },
		{ code: '+48', name: 'Poland', flag: '🇵🇱' },
		{ code: '+351', name: 'Portugal', flag: '🇵🇹' },
		{ code: '+974', name: 'Qatar', flag: '🇶🇦' },
		{ code: '+40', name: 'Romania', flag: '🇷🇴' },
		{ code: '+7', name: 'Russia', flag: '🇷🇺' },
		{ code: '+250', name: 'Rwanda', flag: '🇷🇼' },
		{ code: '+1', name: 'Saint Kitts and Nevis', flag: '🇰🇳' },
		{ code: '+1', name: 'Saint Lucia', flag: '🇱🇨' },
		{ code: '+1', name: 'Saint Vincent and the Grenadines', flag: '🇻🇨' },
		{ code: '+685', name: 'Samoa', flag: '🇼🇸' },
		{ code: '+378', name: 'San Marino', flag: '🇸🇲' },
		{ code: '+239', name: 'Sao Tome and Principe', flag: '🇸🇹' },
		{ code: '+966', name: 'Saudi Arabia', flag: '🇸🇦' },
		{ code: '+221', name: 'Senegal', flag: '🇸🇳' },
		{ code: '+381', name: 'Serbia', flag: '🇷🇸' },
		{ code: '+248', name: 'Seychelles', flag: '🇸🇨' },
		{ code: '+232', name: 'Sierra Leone', flag: '🇸🇱' },
		{ code: '+65', name: 'Singapore', flag: '🇸🇬' },
		{ code: '+421', name: 'Slovakia', flag: '🇸🇰' },
		{ code: '+386', name: 'Slovenia', flag: '🇸🇮' },
		{ code: '+677', name: 'Solomon Islands', flag: '🇸🇧' },
		{ code: '+252', name: 'Somalia', flag: '🇸🇴' },
		{ code: '+27', name: 'South Africa', flag: '🇿🇦' },
		{ code: '+211', name: 'South Sudan', flag: '🇸🇸' },
		{ code: '+34', name: 'Spain', flag: '🇪🇸' },
		{ code: '+94', name: 'Sri Lanka', flag: '🇱🇰' },
		{ code: '+249', name: 'Sudan', flag: '🇸🇩' },
		{ code: '+597', name: 'Suriname', flag: '🇸🇷' },
		{ code: '+268', name: 'Eswatini', flag: '🇸🇿' },
		{ code: '+46', name: 'Sweden', flag: '🇸🇪' },
		{ code: '+41', name: 'Switzerland', flag: '🇨🇭' },
		{ code: '+963', name: 'Syria', flag: '🇸🇾' },
		{ code: '+886', name: 'Taiwan', flag: '🇹🇼' },
		{ code: '+992', name: 'Tajikistan', flag: '🇹🇯' },
		{ code: '+255', name: 'Tanzania', flag: '🇹🇿' },
		{ code: '+66', name: 'Thailand', flag: '🇹🇭' },
		{ code: '+228', name: 'Togo', flag: '🇹🇬' },
		{ code: '+676', name: 'Tonga', flag: '🇹🇴' },
		{ code: '+1', name: 'Trinidad and Tobago', flag: '🇹🇹' },
		{ code: '+216', name: 'Tunisia', flag: '🇹🇳' },
		{ code: '+90', name: 'Turkey', flag: '🇹🇷' },
		{ code: '+993', name: 'Turkmenistan', flag: '🇹🇲' },
		{ code: '+688', name: 'Tuvalu', flag: '🇹🇻' },
		{ code: '+256', name: 'Uganda', flag: '🇺🇬' },
		{ code: '+380', name: 'Ukraine', flag: '🇺🇦' },
		{ code: '+971', name: 'United Arab Emirates', flag: '🇦🇪' },
		{ code: '+44', name: 'United Kingdom', flag: '🇬🇧' },
		{ code: '+1', name: 'United States', flag: '🇺🇸' },
		{ code: '+598', name: 'Uruguay', flag: '🇺🇾' },
		{ code: '+998', name: 'Uzbekistan', flag: '🇺🇿' },
		{ code: '+678', name: 'Vanuatu', flag: '🇻🇺' },
		{ code: '+379', name: 'Vatican City', flag: '🇻🇦' },
		{ code: '+58', name: 'Venezuela', flag: '🇻🇪' },
		{ code: '+84', name: 'Vietnam', flag: '🇻🇳' },
		{ code: '+967', name: 'Yemen', flag: '🇾🇪' },
		{ code: '+260', name: 'Zambia', flag: '🇿🇲' },
		{ code: '+263', name: 'Zimbabwe', flag: '🇿🇼' }
	];

	// Set initial selected country (Canada)
	onMount(() => {
		selectedCountry = countries.find(
			(country) => country.code === '+1' && country.name === 'Canada'
		);
		if (selectedCountry) {
			value = selectedCountry.code;
		}
		updateFilteredCountries();
	});

	// Filter countries based on search term
	function updateFilteredCountries() {
		if (!searchTerm.trim()) {
			filteredCountries = countries;
			return;
		}

		const term = searchTerm.toLowerCase();
		filteredCountries = countries.filter(
			(country) => country.name.toLowerCase().includes(term) || country.code.includes(term)
		);
	}

	// Handle search input change
	function handleSearchInput(event) {
		searchTerm = event.target.value;
		updateFilteredCountries();
	}

	// Select a country
	function selectCountry(country) {
		selectedCountry = country;
		value = country.code;
		showDropdown = false;
		searchTerm = '';
		updateFilteredCountries();
		dispatch('change', { value: country.code });
	}

	// Toggle dropdown
	function toggleDropdown(e) {
		if (e) {
			e.preventDefault();
			e.stopPropagation();
		}
		showDropdown = !showDropdown;
		if (showDropdown) {
			setTimeout(() => {
				if (inputRef) inputRef.focus();
			}, 100);
		}
	}

	// Close dropdown when clicking outside
	function handleClickOutside(event) {
		if (dropdownRef && !dropdownRef.contains(event.target)) {
			showDropdown = false;
		}
	}

	$: {
		if (selectedCountry) {
			isValid = true;
		} else {
			isValid = !required;
		}
	}

	// Base styles (matching other components)
	const baseStyles = {
		input:
			'w-full text-black text-base font-light leading-snug px-5 py-2 bg-High-fed-white rounded-[0.5625rem] outline-none border-none focus:ring-0',
		label: 'text-black text-sm font-normal leading-none',
		container:
			'relative self-stretch rounded-[0.5625rem] justify-start items-center gap-2 inline-flex',
		group:
			'self-stretch flex-col justify-start lg:w-full items-start gap-3 flex border-[1px] border-[#ccc] h-[2.5rem] rounded-[0.25rem]',
		dropdown:
			'absolute z-50 top-full left-0 mt-1 w-full max-h-60 overflow-y-auto bg-white shadow-lg overflow-hidden',
		dropdownItem: 'px-4 py-2 hover:bg-gray-100 cursor-pointer flex items-center',
		selectedDisplay: 'flex items-center cursor-pointer w-full justify-between',
		searchInput: 'w-full p-2 border-b focus:outline-none'
	};
</script>

<svelte:window on:click={handleClickOutside} />

<div class={baseStyles.group}>
	{#if label}
		<label class={baseStyles.label}>{label}</label>
	{/if}
	<div class={baseStyles.container}>
		<button
			type="button"
			class={baseStyles.input}
			on:click={toggleDropdown}
			style="cursor: pointer; text-align: left; display: block;"
		>
			<div class={baseStyles.selectedDisplay}>
				<div class="flex items-center">
					{#if selectedCountry}
						<span class="mr-2">{selectedCountry.flag}</span>
						<span>{selectedCountry.code}</span>
					{:else}
						<span>Country</span>
					{/if}
				</div>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-5 w-5"
					viewBox="0 0 20 20"
					fill="currentColor"
				>
					<path
						fill-rule="evenodd"
						d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
						clip-rule="evenodd"
					/>
				</svg>
			</div>
		</button>

		{#if showDropdown}
			<div class={baseStyles.dropdown} bind:this={dropdownRef}>
				<input
					type="text"
					class={baseStyles.searchInput}
					placeholder="Search..."
					on:input={handleSearchInput}
					bind:value={searchTerm}
					bind:this={inputRef}
				/>
				{#each filteredCountries as country}
					<div
						class={baseStyles.dropdownItem}
						on:click={() => selectCountry(country)}
						class:bg-gray-100={selectedCountry &&
							selectedCountry.code === country.code &&
							selectedCountry.name === country.name}
					>
						<span class="mr-2">{country.flag}</span>
						<span class="mr-2">{country.code}</span>
						<!-- <span>{country.name}</span> -->
					</div>
				{/each}
				{#if filteredCountries.length === 0}
					<div class="px-4 py-2 text-gray-500">No countries found</div>
				{/if}
			</div>
		{/if}
	</div>
	{#if error}
		<p class="text-red-500 text-sm">{error}</p>
	{/if}
</div>
