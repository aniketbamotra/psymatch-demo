<script>
	import { createEventDispatcher } from 'svelte';
	import Button from '$lib/components/buttons/Button.svelte';
	import { TextInput, TextArea, SelectInput } from '../base';
	const dispatch = createEventDispatcher();

	export let value = null;

	// Initialize value as empty array if null
	value = value || [];
	export let error = null;
	export let loading = false;
	export let success = false;
	export let fields = [];
	export let addLabel = '+ Add More';
	export let removeLabel = 'Remove';
	export let minItems = 1;
	export let maxItems = undefined;
	export let required = false;
	export let isValid = false;
	export let noItemsMessage = '';

	// New properties for styling variants
	export let variant = 'default'; // 'default' | 'children'
	export let removeButtonStyle = 'button'; // 'button' | 'icon'
	export let layoutDirection = 'vertical'; // 'vertical' | 'horizontal'

	// Track field validation states
	let fieldValidStates = {};

	// Initialize an item
	function initializeItem() {
		const item = {};
		fields.forEach((field) => {
			item[field.id] = '';
		});
		return item;
	}

	// Add new item
	function addItem() {
		if (maxItems && value.length >= maxItems) {
			error = `Maximum of ${maxItems} items allowed`;
			return;
		}

		value = [...value, initializeItem()];
		error = null;
	}

	// Remove item
	function removeItem(index) {
		value = value.filter((_, i) => i !== index);

		// Update validation states
		const newValidStates = {};
		Object.entries(fieldValidStates).forEach(([key, state]) => {
			const [itemIndex, fieldId] = key.split('_');
			if (parseInt(itemIndex) !== index) {
				const newIndex = parseInt(itemIndex) > index ? parseInt(itemIndex) - 1 : itemIndex;
				newValidStates[`${newIndex}_${fieldId}`] = state;
			}
		});
		fieldValidStates = newValidStates;
	}

	// Initialize if empty or null
	$: {
		if (!value || value.length === 0) {
			if (minItems > 0) {
				value = Array(minItems)
					.fill()
					.map(() => initializeItem());
			} else {
				value = [];
			}
		}
	}

	// Check overall validation
	$: {
		if (value.length === 0) {
			// Empty list is always valid
			isValid = true;
		} else {
			// If we have items, validate them
			const allFieldsValid = Object.entries(fieldValidStates).every(([key, state]) => {
				const [_, fieldId] = key.split('_');
				const field = fields.find((f) => f.id === fieldId);
				return !field.required || state;
			});
			isValid = allFieldsValid;
		}
	}
</script>

<div class="grid lg:grid-cols-3 flex-row items-stretch gap-5">
	{#if value.length === 0 && noItemsMessage}
		<p class="text-gray-600 text-sm italic">{noItemsMessage}</p>
	{/if}
	{#each value as item, index}
		<div class="relative border-Success border-2 rounded-lg p-5">
			{#if index >= minItems}
				<button
					class="absolute top-2 right-2 text-Gray_Dark hover:text-Black p-1"
					on:click={() => removeItem(index)}
				>
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path d="M18 6L6 18M6 6l12 12" stroke-linecap="round" stroke-linejoin="round" />
					</svg>
				</button>
			{/if}
			<div class="grid grid-cols-2 gap-6">
				{#each fields as field}
					<div class=" {field.id === 'name' ? 'col-span-2' : 'col-span-1'}">
						<label class="text-black text-sm font-medium mb-1.5">{field.label}</label>
						{#if field.type === 'textarea'}
							<TextArea
								bind:value={item[field.id]}
								placeholder={field.placeholder}
								bind:isValid={fieldValidStates[`${index}_${field.id}`]}
								error={null}
								{loading}
								{success}
								required={field.required}
								minRows={2}
								maxRows={4}
							/>
						{:else if field.type === 'select'}
							<SelectInput
								bind:value={item[field.id]}
								placeholder={field.placeholder}
								options={field.options}
								bind:isValid={fieldValidStates[`${index}_${field.id}`]}
								error={null}
								{loading}
								{success}
								required={field.required}
								class="h-9 rounded-md"
							/>
						{:else}
							<TextInput
								type={field.type || 'text'}
								bind:value={item[field.id]}
								placeholder={field.placeholder}
								bind:isValid={fieldValidStates[`${index}_${field.id}`]}
								error={null}
								{loading}
								{success}
								required={field.required}
								min={field.min}
								max={field.max}
								pattern={field.pattern}
								patternError={field.patternError}
								class="h-9 rounded-md"
							/>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{/each}

	<button
		class="w-full h-28 border-2 border-dashed border-Success rounded-lg flex items-center justify-center text-Success hover:bg-Success hover:text-white transition-colors text-sm font-medium"
		on:click={addItem}
	>
		{addLabel}
	</button>

	{#if error}
		<p class="text-red-500 text-sm">{error}</p>
	{/if}
</div>
