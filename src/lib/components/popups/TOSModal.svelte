<script>
	import { marked } from 'marked';
	import { fly, fade } from 'svelte/transition';
	import { locale } from 'svelte-i18n';
	import { debugMode as t } from '$lib/i18n-debug';
	import { invalidateAll } from '$app/navigation';
	import { logout } from '$lib/utils/auth';
	import { showTOSModal } from '$lib/stores/tosModal';
	import Button from '$lib/components/buttons/Button.svelte';

	/** @type {{
	 *   tos: { content: { en: string, fr: string }, version: number, updatedAt?: string|Date|null },
	 *   privacyOfficer: { name: string, email: string, phone: string, mailingAddress: string },
	 *   activeJurisdiction: { key: string, label: { en: string, fr: string }, content: { en: string, fr: string }, version: number }
	 * }} */
	export let bundle;

	/** @type {'en'|'fr'} */
	export let preferredLanguage = 'en';

	let saving = false;
	let downloading = false;
	let error = '';

	$: lang = preferredLanguage === 'fr' || $locale?.startsWith('fr') ? 'fr' : 'en';

	// Strip a leading top-level `# heading` from the TOS body — the modal header
	// already shows the title.
	function stripLeadingH1(md) {
		return (md || '').replace(/^\s*#\s.*\n+/, '');
	}

	$: tosMd = stripLeadingH1(bundle?.tos?.content?.[lang] || '');
	$: jurisdictionMd = bundle?.activeJurisdiction?.content?.[lang] || '';
	$: tosHtml = marked.parse(tosMd, { headerIds: false, mangle: false });
	$: jurisdictionHtml = marked.parse(jurisdictionMd, { headerIds: false, mangle: false });

	$: privacyOfficer = bundle?.privacyOfficer || {
		name: '',
		email: '',
		phone: '',
		mailingAddress: ''
	};
	$: privacyOfficerHasAny =
		!!(
			privacyOfficer.name ||
			privacyOfficer.email ||
			privacyOfficer.phone ||
			privacyOfficer.mailingAddress
		);

	// Estimated reading time from TOS body (≈220 wpm).
	$: readingMinutes = Math.max(
		1,
		Math.round((tosMd.split(/\s+/).filter(Boolean).length || 0) / 220)
	);

	$: effectiveDate = bundle?.tos?.updatedAt
		? new Date(bundle.tos.updatedAt).toLocaleDateString(lang === 'fr' ? 'fr-CA' : 'en-CA', {
				year: 'numeric',
				month: 'short',
				day: 'numeric'
		  })
		: null;

	async function handleDownload() {
		if (downloading) return;
		downloading = true;
		error = '';
		try {
			const res = await fetch('/api/legal/download', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ locale: lang })
			});
			if (!res.ok) throw new Error(`Download failed (${res.status})`);
			const blob = await res.blob();
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `${$t('Legal.modal.download_filename')}-${lang}.pdf`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
		} catch (err) {
			console.error('Download failed:', err);
			error = $t('Legal.modal.error_download');
		} finally {
			downloading = false;
		}
	}

	async function handleAccept() {
		if (saving) return;
		saving = true;
		error = '';
		try {
			const res = await fetch('/api/legal/accept', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ acceptedLanguage: lang })
			});
			if (!res.ok) throw new Error(`Accept failed (${res.status})`);
			showTOSModal.set(false);
			await invalidateAll();
		} catch (err) {
			console.error('Accept failed:', err);
			error = $t('Legal.modal.error_generic');
		} finally {
			saving = false;
		}
	}

	async function handleLogout() {
		await logout();
	}
</script>

<!-- Backdrop -->
<div
	class="fixed inset-0 bg-black/55 z-[60] hidden lg:block"
	transition:fade={{ duration: 180 }}
	role="presentation"
></div>

<!-- Modal wrapper: full-screen on mobile, centered card on desktop -->
<div
	class="fixed inset-0 z-[70] flex flex-col lg:items-center lg:justify-center lg:p-8 bg-white lg:bg-transparent"
	transition:fly={{ y: 24, duration: 240, opacity: 0 }}
>
	<div
		class="flex flex-col w-full h-full lg:w-[720px] lg:max-w-full lg:h-auto lg:max-h-[90vh] lg:rounded-[18px] lg:shadow-[0_30px_60px_rgba(10,14,18,0.28)] bg-white overflow-hidden"
	>
		<!-- Header -->
		<div
			class="flex flex-col gap-3 lg:gap-5 px-5 lg:px-10 pt-5 lg:pt-8 pb-4 lg:pb-6 border-b border-[#E8E8E8]"
		>
			<!-- Eyebrow (desktop only) -->
			<p class="hidden lg:block text-sm font-medium text-[#888888]">
				{$t('Legal.modal.eyebrow')}
			</p>
			<div class="flex flex-col gap-1.5 lg:gap-2.5">
				<h2 class="text-2xl lg:text-[28px] font-semibold tracking-tight text-[#1A1A1A] leading-tight">
					{$t('Legal.modal.title')}
				</h2>
				<p class="hidden lg:block text-base text-[#555555] leading-relaxed">
					{$t('Legal.modal.intro')}
				</p>
			</div>
		</div>

		<!-- Body (scrollable) -->
		<div class="flex-1 min-h-0 overflow-y-auto px-5 lg:px-10 pt-4 lg:pt-6 pb-4 lg:pb-8 space-y-5 lg:space-y-6">
			<!-- Meta strip -->
			<div
				class="flex items-center justify-between gap-3 rounded-[10px] py-3 lg:py-3.5 px-4 lg:px-[18px] bg-[#F8FAFC] border border-[#E2E8F0]"
			>
				<div class="flex flex-col gap-1 min-w-0">
					{#if effectiveDate}
						<div class="flex items-center text-xs lg:text-[13px] leading-tight">
							<span class="text-[#475569] truncate">
								{$t('Legal.modal.meta.effective_prefix')} {effectiveDate}
							</span>
						</div>
					{/if}
					<p class="text-sm text-[#475569]">
						{$t('Legal.modal.meta.reading_time', {
							values: { minutes: readingMinutes }
						})}
					</p>
				</div>
				<button
					on:click={handleDownload}
					disabled={downloading}
					class="flex items-center gap-1.5 rounded-lg py-1.5 lg:py-2 px-3 bg-white border border-[#CBD5E1] text-sm font-medium text-[#334155] hover:bg-gray-50 disabled:opacity-50 disabled:cursor-wait transition-colors shrink-0 whitespace-nowrap"
				>
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
						class="shrink-0"
					>
						<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
						<polyline points="7 10 12 15 17 10" />
						<line x1="12" y1="15" x2="12" y2="3" />
					</svg>
					<span class="hidden sm:inline">
						{downloading ? $t('Legal.modal.button.downloading') : $t('Legal.modal.button.download')}
					</span>
					<span class="sm:hidden">{$t('Legal.modal.button.download_short')}</span>
				</button>
			</div>

			<!-- TOS + Privacy + Jurisdiction in one bordered scroll container -->
			<div class="rounded-xl border border-[#E2E8F0] bg-white p-5 lg:p-6 space-y-5">
				<!-- TOS markdown body -->
				<div class="tos-prose">{@html tosHtml}</div>

				<!-- Privacy Contact section -->
				{#if privacyOfficerHasAny}
					<div class="pt-5 border-t border-[#F1F5F9]">
						<h3 class="text-base font-bold text-[#0F172A] mb-2">
							{$t('Legal.modal.section.privacy_heading')}
						</h3>
						<dl class="text-sm leading-relaxed text-[#334155] space-y-1.5">
							{#if privacyOfficer.name}
								<div class="flex gap-2 flex-wrap">
									<dt class="font-semibold text-[#0F172A]">
										{$t('Legal.modal.privacy_label.name')}
									</dt>
									<dd>{privacyOfficer.name}</dd>
								</div>
							{/if}
							{#if privacyOfficer.email}
								<div class="flex gap-2 flex-wrap">
									<dt class="font-semibold text-[#0F172A]">
										{$t('Legal.modal.privacy_label.email')}
									</dt>
									<dd>
										<a href="mailto:{privacyOfficer.email}" class="text-Success hover:underline">
											{privacyOfficer.email}
										</a>
									</dd>
								</div>
							{/if}
							{#if privacyOfficer.phone}
								<div class="flex gap-2 flex-wrap">
									<dt class="font-semibold text-[#0F172A]">
										{$t('Legal.modal.privacy_label.phone')}
									</dt>
									<dd>{privacyOfficer.phone}</dd>
								</div>
							{/if}
							{#if privacyOfficer.mailingAddress}
								<div class="flex gap-2 flex-wrap">
									<dt class="font-semibold text-[#0F172A]">
										{$t('Legal.modal.privacy_label.mailing_address')}
									</dt>
									<dd class="whitespace-pre-line">{privacyOfficer.mailingAddress}</dd>
								</div>
							{/if}
						</dl>
					</div>
				{/if}

				<!-- Jurisdiction footer section -->
				{#if jurisdictionMd}
					<div class="pt-5 border-t border-[#F1F5F9]">
						<h3 class="text-base font-bold text-[#0F172A] mb-2">
							{$t('Legal.modal.section.jurisdiction_heading')}
						</h3>
						<div class="tos-prose">{@html jurisdictionHtml}</div>
					</div>
				{/if}
			</div>

			{#if error}
				<div class="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800">
					{error}
				</div>
			{/if}
		</div>

		<!-- Desktop footer: standard-size buttons; left confirmation text capped so
		     the action group always has room. -->
		<div
			class="hidden lg:flex items-center justify-between gap-6 py-5 px-10 bg-white border-t border-[#E8E8E8]"
		>
			<div class="flex items-start gap-2.5 min-w-0 max-w-[340px]">
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="#888888"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
					class="shrink-0 mt-0.5"
				>
					<rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
					<path d="M7 11V7a5 5 0 0 1 10 0v4" />
				</svg>
				<p class="text-sm text-[#888888] leading-relaxed">
					{$t('Legal.modal.footer_confirm')}
				</p>
			</div>
			<div class="flex items-center gap-3 shrink-0">
				<button
					on:click={handleLogout}
					class="rounded-[0.5625rem] min-h-12 px-6 py-3.5 text-base font-medium leading-none text-[#555555] hover:text-black hover:bg-gray-50 transition-colors whitespace-nowrap shrink-0"
				>
					{$t('Legal.modal.button.logout')}
				</button>
				<Button
					label={saving ? $t('Legal.modal.button.saving') : $t('Legal.modal.button.accept')}
					variant="primary"
					loading={saving}
					loadingText={$t('Legal.modal.button.saving')}
					onClick={handleAccept}
					icon={true}
					iconOnSide="right"
					overide="whitespace-nowrap shrink-0"
				>
					<svg
						slot="icon"
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.4"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<line x1="5" y1="12" x2="19" y2="12" />
						<polyline points="12 5 19 12 12 19" />
					</svg>
				</Button>
			</div>
		</div>

		<!-- Mobile sticky footer — tight top/bottom padding; safe-area inset only
		     when the device actually reports one (notch / home indicator). -->
		<div
			class="lg:hidden flex flex-col gap-2 px-5 pt-3 bg-white border-t border-[#E8E8E8]"
			style="padding-bottom: max(0.5rem, env(safe-area-inset-bottom));"
		>
			<button
				on:click={handleAccept}
				disabled={saving}
				class="flex items-center justify-center gap-2 rounded-xl p-3.5 bg-Success hover:bg-Success_Dark text-white font-semibold text-base shadow-[0_1px_2px_rgba(16,185,129,0.25)] disabled:opacity-70 disabled:cursor-wait transition-colors whitespace-nowrap"
			>
				<span>{saving ? $t('Legal.modal.button.saving') : $t('Legal.modal.button.accept')}</span>
				{#if !saving}
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.4"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<line x1="5" y1="12" x2="19" y2="12" />
						<polyline points="12 5 19 12 12 19" />
					</svg>
				{/if}
			</button>
			<button
				on:click={handleLogout}
				class="text-center text-sm text-[#888888] hover:text-black transition-colors"
			>
				{$t('Legal.modal.button.logout')}
			</button>
		</div>
	</div>
</div>

<style>
	/* Codebase-standard typography for the rendered TOS markdown body. */
	:global(.tos-prose) {
		color: #334155;
		font-size: 14px;
		line-height: 1.65;
	}
	:global(.tos-prose > * + *) {
		margin-top: 0.85rem;
	}
	:global(.tos-prose h1),
	:global(.tos-prose h2),
	:global(.tos-prose h3) {
		color: #0f172a;
		font-weight: 700;
		font-size: 15px;
		line-height: 1.4;
		margin-top: 1.25rem;
	}
	:global(.tos-prose h1:first-child),
	:global(.tos-prose h2:first-child),
	:global(.tos-prose h3:first-child) {
		margin-top: 0;
	}
	:global(.tos-prose p) {
		font-size: 14px;
		line-height: 1.65;
	}
	:global(.tos-prose ul),
	:global(.tos-prose ol) {
		padding-left: 1.25rem;
	}
	:global(.tos-prose li) {
		margin-top: 0.25rem;
	}
	:global(.tos-prose strong) {
		color: #0f172a;
		font-weight: 600;
	}
	:global(.tos-prose a) {
		color: #00a886;
		text-decoration: underline;
	}

	/* Slim scrollbars inside the modal */
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
