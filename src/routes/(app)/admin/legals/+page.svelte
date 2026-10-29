<script>
	import { onMount } from 'svelte';
	import { legalsStore } from '$lib/stores/legals';
	import { navState } from '$lib/stores';
	import { debugMode as t } from '$lib/i18n-debug';
	import Button from '$lib/components/buttons/Button.svelte';

	export let data;

	let saving = { privacyOfficer: false, jurisdiction: false };
	let savedAt = { privacyOfficer: null, jurisdiction: null };
	let errors = { privacyOfficer: '', jurisdiction: '' };

	let poName = '';
	let poEmail = '';
	let poPhone = '';
	let poMailingAddress = '';
	let selectedJurisdictionKey = '';

	let pristinePO = { name: '', email: '', phone: '', mailingAddress: '' };
	let pristineJurisdictionKey = '';

	// Map jurisdictionKey → i18n key. Falls back to the DB-supplied label when
	// a translation is missing (so a new jurisdiction added in DB still renders).
	function jurisdictionLabel(j) {
		const key = `Legal.admin.jurisdiction.${j.key}`;
		const translated = $t(key);
		return translated && translated !== key ? translated : j.label?.en || j.key;
	}

	onMount(() => {
		navState.set('Legals');
		hydrate(data.bundle);
	});

	function hydrate(bundle) {
		legalsStore.setBundle(bundle);
		const po = bundle.privacyOfficer;
		poName = po.name || '';
		poEmail = po.email || '';
		poPhone = po.phone || '';
		poMailingAddress = po.mailingAddress || '';
		pristinePO = { name: poName, email: poEmail, phone: poPhone, mailingAddress: poMailingAddress };
		selectedJurisdictionKey = bundle.activeJurisdiction.key || 'ontario';
		pristineJurisdictionKey = selectedJurisdictionKey;
	}

	$: poDirty =
		poName !== pristinePO.name ||
		poEmail !== pristinePO.email ||
		poPhone !== pristinePO.phone ||
		poMailingAddress !== pristinePO.mailingAddress;

	$: jurisdictionDirty = selectedJurisdictionKey !== pristineJurisdictionKey;

	function discardPrivacyOfficer() {
		poName = pristinePO.name;
		poEmail = pristinePO.email;
		poPhone = pristinePO.phone;
		poMailingAddress = pristinePO.mailingAddress;
		errors.privacyOfficer = '';
	}

	function discardJurisdiction() {
		selectedJurisdictionKey = pristineJurisdictionKey;
		errors.jurisdiction = '';
	}

	async function refresh() {
		const res = await fetch('/api/legal/admin', { credentials: 'include' });
		if (res.ok) {
			const j = await res.json();
			if (j.success) hydrate(j.bundle);
		}
	}

	async function savePrivacyOfficer() {
		if (saving.privacyOfficer || !poDirty) return;
		saving.privacyOfficer = true;
		errors.privacyOfficer = '';
		try {
			const res = await fetch('/api/legal/admin', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({
					type: 'privacy_officer',
					name: poName,
					email: poEmail,
					phone: poPhone,
					mailingAddress: poMailingAddress
				})
			});
			const j = await res.json();
			if (!res.ok || !j.success) throw new Error(j.error || $t('Legal.admin.error.save_failed'));
			savedAt.privacyOfficer = `v${j.updated.version}`;
			await refresh();
		} catch (e) {
			errors.privacyOfficer = e.message || $t('Legal.admin.error.save_failed');
		} finally {
			saving.privacyOfficer = false;
		}
	}

	async function saveJurisdiction() {
		if (saving.jurisdiction || !jurisdictionDirty) return;
		saving.jurisdiction = true;
		errors.jurisdiction = '';
		try {
			const res = await fetch('/api/legal/admin', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({
					type: 'active_jurisdiction',
					activeJurisdictionValue: selectedJurisdictionKey
				})
			});
			const j = await res.json();
			if (!res.ok || !j.success) throw new Error(j.error || $t('Legal.admin.error.save_failed'));
			savedAt.jurisdiction = `v${j.updated.version}`;
			await refresh();
		} catch (e) {
			errors.jurisdiction = e.message || $t('Legal.admin.error.save_failed');
		} finally {
			saving.jurisdiction = false;
		}
	}
</script>

<!-- relative + z-10 + isolate covers the (app) layout's fixed emerald blur. -->
<div class="relative z-10 isolate w-full bg-[#F4F4F5] min-h-[100dvh]">
	<div class="max-w-[1342px] mx-auto px-6 lg:px-14 py-8 lg:py-10 flex flex-col gap-8">
		<!-- Page header -->
		<header class="flex items-center gap-4">
			<div class="shrink-0">
				<h1 class="text-lg font-semibold leading-tight text-[#00A886]">
					{$t('Legal.admin.page_title')}
				</h1>
				<p class="text-sm leading-[150%] text-black mt-1">
					{$t('Legal.admin.subtitle')}
				</p>
			</div>
			<div class="flex-1 h-[1.5px] bg-[#00A886] min-w-[60px]"></div>
		</header>

		<div class="flex flex-col gap-6">
			<!-- Privacy contact card -->
			<section
				class="w-full max-w-[880px] flex flex-col rounded-[14px] overflow-clip bg-white border border-[#E4E4E7]"
			>
				<div class="flex items-start justify-between gap-4 py-6 px-7 border-b border-[#F1F5F9]">
					<div class="flex flex-col gap-1">
						<h2 class="text-lg font-bold leading-snug text-[#0A0A0A] tracking-[-0.005em]">
							{$t('Legal.admin.card.privacy_officer.title')}
						</h2>
						<p class="text-sm leading-relaxed text-[#64748B]">
							{$t('Legal.admin.card.privacy_officer.description')}
						</p>
					</div>
				</div>

				<div class="flex flex-col py-2">
					<div class="flex border-b border-[#F4F4F5]">
						<div class="flex flex-col flex-1 gap-2 py-5 px-7 border-r border-[#F4F4F5]">
							<label
								for="po-name"
								class="uppercase font-semibold tracking-[0.06em] text-xs leading-4 text-[#64748B]"
							>
								{$t('Legal.admin.privacy.field.name')}
							</label>
							<input
								id="po-name"
								type="text"
								bind:value={poName}
								placeholder={$t('Legal.admin.privacy.placeholder.name')}
								class="w-full rounded-lg py-2.5 px-3 bg-[#FAFAF9] border border-[#E4E4E7] text-base leading-6 text-[#0A0A0A] placeholder-[#94A3B8] focus:outline-none focus:border-[#00A886] focus:ring-2 focus:ring-[#00A886]/20 transition"
							/>
							<p class="text-sm leading-[150%] text-[#94A3B8]">
								{$t('Legal.admin.privacy.help.name')}
							</p>
						</div>
						<div class="flex flex-col flex-1 gap-2 py-5 px-7">
							<label
								for="po-email"
								class="uppercase font-semibold tracking-[0.06em] text-xs leading-4 text-[#64748B]"
							>
								{$t('Legal.admin.privacy.field.email')}
							</label>
							<input
								id="po-email"
								type="email"
								bind:value={poEmail}
								placeholder={$t('Legal.admin.privacy.placeholder.email')}
								class="w-full rounded-lg py-2.5 px-3 bg-[#FAFAF9] border border-[#E4E4E7] font-mono text-sm leading-6 text-[#0A0A0A] placeholder-[#94A3B8] focus:outline-none focus:border-[#00A886] focus:ring-2 focus:ring-[#00A886]/20 transition"
							/>
							<p class="text-sm leading-[150%] text-[#94A3B8]">
								{$t('Legal.admin.privacy.help.email')}
							</p>
						</div>
					</div>
					<div class="flex">
						<div class="flex flex-col flex-1 gap-2 py-5 px-7 border-r border-[#F4F4F5]">
							<label
								for="po-phone"
								class="uppercase font-semibold tracking-[0.06em] text-xs leading-4 text-[#64748B]"
							>
								{$t('Legal.admin.privacy.field.phone')}
							</label>
							<input
								id="po-phone"
								type="tel"
								bind:value={poPhone}
								placeholder={$t('Legal.admin.privacy.placeholder.phone')}
								class="w-full rounded-lg py-2.5 px-3 bg-[#FAFAF9] border border-[#E4E4E7] font-mono text-sm leading-6 text-[#0A0A0A] placeholder-[#94A3B8] focus:outline-none focus:border-[#00A886] focus:ring-2 focus:ring-[#00A886]/20 transition"
							/>
							<p class="text-sm leading-[150%] text-[#94A3B8]">
								{$t('Legal.admin.privacy.help.phone')}
							</p>
						</div>
						<div class="flex flex-col flex-1 gap-2 py-5 px-7">
							<label
								for="po-mailing"
								class="uppercase font-semibold tracking-[0.06em] text-xs leading-4 text-[#64748B]"
							>
								{$t('Legal.admin.privacy.field.mailing_address')}
							</label>
							<textarea
								id="po-mailing"
								bind:value={poMailingAddress}
								rows="3"
								placeholder={$t('Legal.admin.privacy.placeholder.mailing_address')}
								class="w-full min-h-20 rounded-lg py-2.5 px-3 bg-[#FAFAF9] border border-[#E4E4E7] text-base leading-6 text-[#0A0A0A] placeholder-[#94A3B8] focus:outline-none focus:border-[#00A886] focus:ring-2 focus:ring-[#00A886]/20 transition resize-y whitespace-pre-wrap"
							></textarea>
							<p class="text-sm leading-[150%] text-[#94A3B8]">
								{$t('Legal.admin.privacy.help.mailing_address')}
							</p>
						</div>
					</div>
				</div>

				<div class="flex items-center justify-between gap-3 py-3 px-5 bg-[#F8FAFC] border-t border-[#F1F5F9]">
					<div class="flex items-center gap-2">
						<Button
							label={$t('Legal.admin.button.discard')}
							size="small"
							variant="outline"
							disabled={!poDirty || saving.privacyOfficer}
							onClick={discardPrivacyOfficer}
						/>
						<Button
							label={saving.privacyOfficer ? $t('Legal.admin.button.saving') : $t('Legal.admin.button.save')}
							size="small"
							variant="primary"
							disabled={!poDirty}
							loading={saving.privacyOfficer}
							loadingText={$t('Legal.admin.button.saving')}
							onClick={savePrivacyOfficer}
						/>
					</div>
					{#if savedAt.privacyOfficer && !poDirty}
						<span class="text-sm text-Success">
							{$t('Legal.admin.toast.saved', { values: { version: savedAt.privacyOfficer } })}
						</span>
					{/if}
				</div>

				{#if errors.privacyOfficer}
					<div class="mx-6 my-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800">
						{errors.privacyOfficer}
					</div>
				{/if}
			</section>

			<!-- Jurisdiction Footers card -->
			<section
				class="w-full max-w-[880px] flex flex-col rounded-[14px] overflow-clip bg-white border border-[#E4E4E7]"
			>
				<div class="flex flex-col pt-6 pb-5 gap-1.5 px-7 border-b border-[#F1F5F9]">
					<h2 class="text-lg font-bold leading-snug text-[#0F172A] tracking-[-0.005em]">
						{$t('Legal.admin.card.jurisdiction.title')}
					</h2>
					<p class="text-sm leading-relaxed text-[#64748B]">
						{$t('Legal.admin.card.jurisdiction.description')}
					</p>
				</div>

				<div class="flex flex-col py-6 px-7 gap-3.5">
					{#each $legalsStore.jurisdictions as j (j.key)}
						<label
							class="flex flex-col rounded-[10px] overflow-clip bg-white border cursor-pointer transition-shadow {selectedJurisdictionKey ===
							j.key
								? 'border-[#00A886] shadow-[0_0_0_1px_#00A886]'
								: 'border-[#E2E8F0] hover:border-[#CBD5E1]'}"
						>
							<input
								type="radio"
								name="active-jurisdiction"
								value={j.key}
								bind:group={selectedJurisdictionKey}
								class="sr-only"
							/>
							<div class="flex items-center justify-start py-3.5 px-4 bg-[#F8FAFC]">
								<span
									class="flex items-center justify-center shrink-0 mr-3 rounded-full bg-white w-5 h-5 border-[1.5px] {selectedJurisdictionKey ===
									j.key
										? 'border-[#00A886]'
										: 'border-[#CBD5E1]'}"
								>
									{#if selectedJurisdictionKey === j.key}
										<span class="w-2.5 h-2.5 rounded-full bg-[#00A886]"></span>
									{/if}
								</span>
								<div class="flex items-center gap-3">
									<span class="font-bold text-base leading-6 text-[#0F172A]">
										{jurisdictionLabel(j)}
									</span>
									<span class="font-mono text-sm leading-5 text-[#94A3B8]">{j.key}</span>
								</div>
							</div>
						</label>
					{/each}
				</div>

				<div class="flex items-center justify-between gap-3 py-3 px-5 bg-[#F8FAFC] border-t border-[#F1F5F9]">
					<div class="flex items-center gap-2">
						<Button
							label={$t('Legal.admin.button.discard')}
							size="small"
							variant="outline"
							disabled={!jurisdictionDirty || saving.jurisdiction}
							onClick={discardJurisdiction}
						/>
						<Button
							label={saving.jurisdiction ? $t('Legal.admin.button.saving') : $t('Legal.admin.button.save')}
							size="small"
							variant="primary"
							disabled={!jurisdictionDirty}
							loading={saving.jurisdiction}
							loadingText={$t('Legal.admin.button.saving')}
							onClick={saveJurisdiction}
						/>
					</div>
					{#if savedAt.jurisdiction && !jurisdictionDirty}
						<span class="text-sm text-Success">
							{$t('Legal.admin.toast.saved', { values: { version: savedAt.jurisdiction } })}
						</span>
					{/if}
				</div>

				{#if errors.jurisdiction}
					<div class="mx-6 my-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800">
						{errors.jurisdiction}
					</div>
				{/if}
			</section>
		</div>
	</div>
</div>

<style>
	* {
		scrollbar-width: thin;
		scrollbar-color: rgb(180, 180, 180) transparent;
	}
	*::-webkit-scrollbar {
		width: 6px;
	}
	*::-webkit-scrollbar-thumb {
		background-color: rgb(180, 180, 180);
		border-radius: 100px;
	}
</style>
