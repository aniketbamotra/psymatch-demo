<script>
	import { onMount, onDestroy } from 'svelte';
	import { showRedactionProfile, selectedPatient, redactionRegenerating } from '$lib/stores';
	import * as api from '$lib/api';

	// ── State ──────────────────────────────────────────────────────────────
	let mode = 'view'; // 'view' | 'edit'
	let loading = true;
	let saving = false;
	let regenerating = false;
	let error = '';

	let profile = null; // { status, version, generatedAt, fieldRewrites, searchReplace }
	let originals = null; // { patientInfo: {...}, ADULT_BIO: {...} }
	let patientName = '';

	// Edit mode working copies
	let editedFieldRewrites = {};
	let editedSearchReplace = [];

	// Change tracking
	let dirtyPaths = new Set();
	let deletedPaths = new Set();
	let addedPaths = new Set();
	let srDirtyIndices = new Set();
	let srDeletedCount = 0;
	let srAddedCount = 0;

	// Add-row inputs
	let newRowQuestionnaire = '';
	let newRowPath = '';
	let newFindText = '';
	let newReplaceText = '';
	let newDescText = '';

	// Search / regenerate
	let searchQuery = '';
	let searchInputEl;
	let regeneratePrompt = '';
	let regenPercent = 0;
	let regenStep = '';

	// ── Derived ────────────────────────────────────────────────────────────
	$: changedCount =
		dirtyPaths.size +
		deletedPaths.size +
		addedPaths.size +
		srDirtyIndices.size +
		srDeletedCount +
		srAddedCount;

	$: currentFieldRewrites = mode === 'edit' ? editedFieldRewrites : (profile?.fieldRewrites ?? {});
	$: currentSearchReplace = mode === 'edit' ? editedSearchReplace : (profile?.searchReplace ?? []);

	$: groupedFieldRewrites = buildGroups(currentFieldRewrites, searchQuery);
	$: filteredSearchReplace = filterSR(currentSearchReplace, searchQuery);

	function buildGroups(rewrites, query) {
		const q = query.toLowerCase();
		const groups = { patientInfo: [], ADULT_BIO: [], other: [] };
		for (const [path, newVal] of Object.entries(rewrites)) {
			if (q) {
				const orig = String(getOriginal(path));
				const val = typeof newVal === 'object' ? JSON.stringify(newVal) : String(newVal ?? '');
				if (
					!path.toLowerCase().includes(q) &&
					!val.toLowerCase().includes(q) &&
					!orig.toLowerCase().includes(q)
				)
					continue;
			}
			const ns = path.startsWith('patientInfo.')
				? 'patientInfo'
				: path.startsWith('ADULT_BIO.')
					? 'ADULT_BIO'
					: 'other';
			groups[ns].push([path, newVal]);
		}
		return groups;
	}

	function filterSR(rules, query) {
		if (!query) return rules.map((r, i) => ({ ...r, _idx: i }));
		const q = query.toLowerCase();
		return rules
			.map((r, i) => ({ ...r, _idx: i }))
			.filter(
				(r) => r.find.toLowerCase().includes(q) || (r.replace || '').toLowerCase().includes(q)
			);
	}

	// ── Helpers ────────────────────────────────────────────────────────────
	function getOriginal(dotPath) {
		if (!originals) return '';
		if (dotPath.startsWith('patientInfo.')) {
			const key = dotPath.slice('patientInfo.'.length);
			return originals.patientInfo?.[key] ?? '';
		}
		if (dotPath.startsWith('ADULT_BIO.')) {
			return walkPath(originals.ADULT_BIO, dotPath.slice('ADULT_BIO.'.length)) ?? '';
		}
		return '';
	}

	function walkPath(obj, path) {
		return path.split('.').reduce((o, k) => {
			if (o == null) return undefined;
			const idx = Number(k);
			return isNaN(idx) ? o?.[k] : o?.[idx];
		}, obj);
	}

	function formatDate(d) {
		if (!d) return '';
		return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function displayValue(val) {
		if (val == null || val === '') return '—';
		if (typeof val === 'object') return JSON.stringify(val);
		return String(val);
	}

	function shortPath(fullPath) {
		return fullPath.replace(/^(patientInfo|ADULT_BIO)\./, '.');
	}

	// ── Data loading ───────────────────────────────────────────────────────
	async function loadProfile() {
		loading = true;
		error = '';
		try {
			const res = await api.get(`/api/anonymization/profile/${$selectedPatient}`);
			if (!res.ok) {
				const d = await res.json().catch(() => ({}));
				throw new Error(d.error || 'Failed to load profile');
			}
			const data = await res.json();
			profile = data.profile;
			originals = data.originals;
			patientName = data.patientName;
		} catch (e) {
			error = e.message;
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		loadProfile();

		// ⌘K / Ctrl+K to focus search
		function onKeydown(e) {
			if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
				e.preventDefault();
				searchInputEl?.focus();
			}
			if (e.key === 'Escape') close();
		}
		window.addEventListener('keydown', onKeydown);
		return () => window.removeEventListener('keydown', onKeydown);
	});

	// ── Mode transitions ───────────────────────────────────────────────────
	function enterEditMode() {
		editedFieldRewrites = { ...profile.fieldRewrites };
		editedSearchReplace = profile.searchReplace.map((r) => ({ ...r }));
		dirtyPaths = new Set();
		deletedPaths = new Set();
		addedPaths = new Set();
		srDirtyIndices = new Set();
		srDeletedCount = 0;
		srAddedCount = 0;
		mode = 'edit';
	}

	function cancelEdit() {
		editedFieldRewrites = {};
		editedSearchReplace = [];
		mode = 'view';
	}

	function close() {
		if (mode === 'edit' && changedCount > 0) {
			if (!confirm('Discard unsaved changes?')) return;
		}
		$showRedactionProfile = false;
		mode = 'view';
	}

	// ── Edit handlers — field rewrites ─────────────────────────────────────
	function onFieldChange(path, value) {
		editedFieldRewrites[path] = value;
		editedFieldRewrites = editedFieldRewrites;
		dirtyPaths.add(path);
		dirtyPaths = dirtyPaths;
	}

	function deleteFieldRow(path) {
		const copy = { ...editedFieldRewrites };
		delete copy[path];
		editedFieldRewrites = copy;
		if (addedPaths.has(path)) {
			addedPaths.delete(path);
			addedPaths = addedPaths;
		} else {
			deletedPaths.add(path);
			deletedPaths = deletedPaths;
		}
		dirtyPaths.delete(path);
		dirtyPaths = dirtyPaths;
	}

	function addFieldRow() {
		if (!newRowQuestionnaire || !newRowPath.trim()) return;
		const fullPath = `${newRowQuestionnaire}.${newRowPath.trim()}`;
		editedFieldRewrites = { ...editedFieldRewrites, [fullPath]: '' };
		addedPaths.add(fullPath);
		addedPaths = addedPaths;
		newRowQuestionnaire = '';
		newRowPath = '';
	}

	// ── Edit handlers — search/replace ─────────────────────────────────────
	function onSRChange(idx) {
		srDirtyIndices.add(idx);
		srDirtyIndices = srDirtyIndices;
	}

	function deleteSRRow(idx) {
		editedSearchReplace = editedSearchReplace.filter((_, i) => i !== idx);
		srDeletedCount++;
	}

	function addSRRow() {
		if (!newFindText.trim()) return;
		const rule = { find: newFindText.trim(), replace: newReplaceText.trim(), caseSensitive: true };
		if (newDescText.trim()) rule.desc = newDescText.trim();
		editedSearchReplace = [...editedSearchReplace, rule];
		srAddedCount++;
		newFindText = '';
		newReplaceText = '';
		newDescText = '';
	}

	// ── Save ───────────────────────────────────────────────────────────────
	async function saveChanges() {
		saving = true;
		error = '';
		try {
			const res = await api.patch(`/api/anonymization/profile/${$selectedPatient}`, {
				fieldRewrites: editedFieldRewrites,
				searchReplace: editedSearchReplace
			});
			if (!res.ok) {
				const d = await res.json().catch(() => ({}));
				throw new Error(d.error || 'Save failed');
			}
			profile = { ...profile, fieldRewrites: editedFieldRewrites, searchReplace: editedSearchReplace };
			mode = 'view';
		} catch (e) {
			error = e.message;
		} finally {
			saving = false;
		}
	}

	// ── Regenerate ─────────────────────────────────────────────────────────
	async function handleRegenerate() {
		if (regenerating) return;
		regenerating = true;
		error = '';
		regenPercent = 2;
		regenStep = 'Starting…';
		$redactionRegenerating = { active: true, percent: 2, step: 'Starting…' };

		try {
			const response = await fetch('/api/anonymization/process', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					patientId: $selectedPatient,
					regenerateReason: regeneratePrompt.trim()
				})
			});

			if (!response.ok) {
				const errData = await response.json().catch(() => ({}));
				throw new Error(errData.error || 'Regeneration failed');
			}

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop();
				for (const line of lines) {
					if (!line.startsWith('data: ')) continue;
					const data = JSON.parse(line.slice(6));
					if (data.percent !== undefined) {
						regenPercent = data.percent;
						$redactionRegenerating = { active: true, percent: data.percent, step: regenStep };
					}
					if (data.label) {
						regenStep = data.label;
						$redactionRegenerating = { active: true, percent: regenPercent, step: data.label };
					}
					if (data.error) throw new Error(data.error);
					if (data.done) {
						regenPercent = 100;
						regenStep = 'Profile ready';
						$redactionRegenerating = { active: true, percent: 100, step: 'Profile ready' };
						await new Promise(r => setTimeout(r, 800));
					}
				}
			}

			regeneratePrompt = '';
			await loadProfile();
		} catch (e) {
			error = e.message;
		} finally {
			regenerating = false;
			regenPercent = 0;
			regenStep = '';
			$redactionRegenerating = { active: false, percent: 0, step: '' };
		}
	}
</script>

<!-- Overlay -->
<div
	class="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm"
	role="presentation"
	on:click={close}
/>

<!-- Panel -->
<div
	class="fixed z-[61] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl w-[900px] overflow-hidden flex flex-col shadow-2xl"
	role="dialog"
	aria-modal="true"
>
	{#if loading}
		<div class="flex items-center justify-center h-64 text-gray-500 text-sm">Loading profile…</div>
	{:else if error && !profile}
		<div class="flex flex-col items-center justify-center h-64 gap-3">
			<p class="text-red-500 text-sm">{error}</p>
			<button on:click={close} class="text-sm text-gray-500 underline">Close</button>
		</div>
	{:else if regenerating}
		<!-- Regeneration loading state -->
		<div class="flex flex-col items-center justify-center py-20 px-8 gap-6 min-h-[500px]">
			<!-- Close button in top right -->
			<button
				on:click={close}
				class="absolute top-6 right-6 flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
				aria-label="Close"
			>
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
			</button>

			<!-- Animated visualization -->
			<div class="relative w-40 h-40 flex items-center justify-center">
				<!-- Outer ring — dashed, slow spin -->
				<div class="absolute inset-0 regen-ring-outer">
					<svg viewBox="0 0 160 160" class="w-full h-full">
						<circle cx="80" cy="80" r="74" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="8 6" class="text-Success/20" />
					</svg>
				</div>
				<!-- Middle ring — solid arc, reverse spin -->
				<div class="absolute inset-3 regen-ring-mid">
					<svg viewBox="0 0 140 140" class="w-full h-full">
						<circle cx="70" cy="70" r="64" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="100 300" stroke-linecap="round" class="text-Success/40" />
					</svg>
				</div>
				<!-- Inner ring — thick arc, fast spin -->
				<div class="absolute inset-7 regen-ring-inner">
					<svg viewBox="0 0 120 120" class="w-full h-full">
						<circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="60 280" stroke-linecap="round" class="text-Success/70" />
					</svg>
				</div>
				<!-- Glow pulse behind icon -->
				<div class="absolute w-20 h-20 rounded-full bg-Success/10 regen-glow"></div>
				<!-- Center icon — shield with lock -->
				<div class="relative z-10 w-14 h-14 rounded-2xl bg-white shadow-lg shadow-Success/10 flex items-center justify-center regen-icon-breathe">
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-7 h-7 text-Success">
						<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
						<rect x="9" y="11" width="6" height="5" rx="1"/>
						<path d="M10 11V9a2 2 0 1 1 4 0v2"/>
					</svg>
				</div>
				<!-- Floating particles -->
				<div class="absolute w-1.5 h-1.5 rounded-full bg-Success/50 regen-particle regen-p1"></div>
				<div class="absolute w-1 h-1 rounded-full bg-Success/40 regen-particle regen-p2"></div>
				<div class="absolute w-1.5 h-1.5 rounded-full bg-Success/30 regen-particle regen-p3"></div>
				<div class="absolute w-1 h-1 rounded-full bg-Success/60 regen-particle regen-p4"></div>
				<div class="absolute w-2 h-2 rounded-full bg-Success/20 regen-particle regen-p5"></div>
				<div class="absolute w-1 h-1 rounded-full bg-Success/50 regen-particle regen-p6"></div>
			</div>

			<!-- Title & step -->
			<div class="text-center space-y-2">
				<h3 class="text-lg font-semibold text-gray-900">Regenerating Redaction Profile</h3>
				<p class="text-sm text-gray-500 max-w-sm">
					Analyzing patient data and building anonymization mappings. This may take a moment.
				</p>
			</div>

			<!-- Progress bar -->
			<div class="w-full max-w-md space-y-2">
				<div class="h-2 bg-gray-100 rounded-full overflow-hidden">
					<div
						class="h-full bg-Success rounded-full"
						style="width: {regenPercent}%; transition: width 2s ease-in-out;"
					></div>
				</div>
				<div class="flex justify-between items-center">
					<span class="text-xs text-gray-400 font-medium truncate max-w-[70%]">{regenStep}</span>
					<span class="text-xs font-semibold text-Success tabular-nums">{regenPercent}%</span>
				</div>
			</div>

			<!-- Shimmer skeleton placeholders -->
			<div class="w-full max-w-md space-y-3 mt-4 opacity-30">
				{#each [85, 70, 60, 90, 50] as w}
					<div class="h-3 rounded-full bg-gray-200 regen-shimmer" style="width: {w}%;"></div>
				{/each}
			</div>
		</div>
	{:else}
		<!-- Header -->
		{#if mode === 'view'}
			<header class="px-8 pt-7 pb-5 flex-shrink-0">
				<div class="flex items-start justify-between gap-4">
					<div>
						<h2 class="text-lg font-bold text-gray-900">Redaction Profile</h2>
						<p class="text-sm text-gray-400 mt-0.5">
							{patientName} &bull; Version {profile.version} &bull; Generated {formatDate(profile.generatedAt)}
						</p>
					</div>
					<div class="flex items-center gap-2 flex-shrink-0">
						<button
							on:click={enterEditMode}
							class="inline-flex items-center gap-1.5 border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
						>
							<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
							Edit Manually
						</button>
						<button
							on:click={close}
							class="flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
							aria-label="Close"
						>
							<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
						</button>
					</div>
				</div>
			</header>
		{:else}
			<header class="px-8 pt-7 pb-5 flex-shrink-0 border-b-2 border-amber-400">
				<div class="flex items-center justify-between gap-4">
					<div class="flex items-center gap-3 min-w-0">
						<h2 class="text-lg font-bold text-gray-900 flex-shrink-0">Redaction Profile</h2>
						<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-600 text-xs font-semibold border border-amber-300 flex-shrink-0">
							<span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
							EDITING
						</span>
						<span class="text-amber-600 font-medium text-sm flex-shrink-0">{changedCount} {changedCount === 1 ? 'change' : 'changes'}</span>
					</div>
					<div class="flex items-center gap-2 flex-shrink-0">
						<button
							on:click={cancelEdit}
							class="px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
						>
							Cancel
						</button>
						<button
							on:click={saveChanges}
							disabled={saving}
							class="inline-flex items-center gap-1.5 bg-Success text-white rounded-lg px-4 py-1.5 text-sm font-medium hover:bg-Success/90 transition-colors disabled:opacity-60"
						>
							{#if saving}
								Saving…
							{:else}
								<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
								Save Changes
							{/if}
						</button>
					</div>
				</div>
				<p class="text-sm text-gray-400 mt-0.5">
					{patientName} &bull; Version {profile.version} &bull; Unsaved edits in progress
				</p>
			</header>
		{/if}

		<!-- Search bar -->
		<div class="px-8 py-3 flex-shrink-0 border-b border-gray-100 relative">
			<div class="relative flex items-center">
				<svg class="absolute left-3 text-gray-300 pointer-events-none" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
				<input
					bind:this={searchInputEl}
					bind:value={searchQuery}
					placeholder={mode === 'edit' ? 'Search field or value…' : 'Search field or value… e.g. "doctor", "phone", "Pedro"'}
					class="w-full pl-9 pr-14 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-Success/30 focus:border-Success transition-colors"
				/>
				<kbd class="absolute right-3 text-[10px] text-gray-300 font-medium bg-white border border-gray-200 rounded px-1.5 py-0.5">⌘K</kbd>
			</div>
		</div>

		{#if error}
			<div class="mx-8 mt-4 flex-shrink-0 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
		{/if}

		<!-- Body grows with content — panel itself scrolls -->
		<div class="px-8 pt-5 pb-2 flex flex-col gap-5">

			<!-- ── TIER 1: Field Replacements/Rewrites ── -->
			<section>
				<div class="flex items-center justify-between mb-3">
					<div class="flex items-center gap-2">
						<span class="text-[11px] font-bold tracking-widest uppercase text-gray-800">
							{mode === 'edit' ? 'Field Rewrites' : 'Field Replacements'}
						</span>
						{#if mode === 'edit'}
							{#if dirtyPaths.size + addedPaths.size > 0}
								<span class="bg-amber-100 text-amber-700 text-[11px] font-semibold px-2 py-0.5 rounded-full">
									{dirtyPaths.size + addedPaths.size} edited
								</span>
							{/if}
							<span class="text-gray-400 text-xs">{Object.keys(editedFieldRewrites).length} fields total</span>
						{:else}
							<span class="bg-teal-50 text-Success text-[11px] font-semibold px-2 py-0.5 rounded-full border border-Success/20">
								{Object.keys(profile?.fieldRewrites ?? {}).length} fields
							</span>
						{/if}
					</div>
					{#if mode === 'view'}
						<span class="text-xs text-gray-400">Direct field changes</span>
					{/if}
				</div>

				<!-- Table with its own independent scroll -->
				<div class="relative rounded-xl border border-gray-200 overflow-hidden">
					<!-- Sticky header outside the scroll zone -->
					<table class="w-full table-fixed">
						<colgroup>
							<col class="w-[28%]" />
							<col class="w-[32%]" />
							<col />
							{#if mode === 'edit'}<col class="w-9" />{/if}
						</colgroup>
						<thead>
							<tr class="bg-[#F3F4F2]">
								<th class="text-left py-2.5 px-4 text-[11px] font-semibold text-[#AAAAAA] uppercase tracking-wide">Field</th>
								<th class="text-left py-2.5 px-4 text-[11px] font-semibold text-[#AAAAAA] uppercase tracking-wide">Original</th>
								<th class="text-left py-2.5 px-4 text-[11px] font-semibold text-[#AAAAAA] uppercase tracking-wide">
									{mode === 'edit' ? 'New Value' : 'Anonymized'}
								</th>
								{#if mode === 'edit'}<th></th>{/if}
							</tr>
						</thead>
					</table>
					<!-- Scrollable rows -->
					<div class="overflow-y-auto max-h-[280px]">
						<table class="w-full table-fixed">
							<colgroup>
								<col class="w-[28%]" />
								<col class="w-[32%]" />
								<col />
								{#if mode === 'edit'}<col class="w-9" />{/if}
							</colgroup>
							<tbody>
								{#each [['patientInfo', 'Patient Profile', 'Intake Info'], ['ADULT_BIO', 'Adult Biographical Interview', 'ADULT_BIO']] as [ns, label, sublabel]}
									{#if groupedFieldRewrites[ns]?.length > 0}
										<tr class="bg-gray-50 border-t border-gray-100">
											<td colspan={mode === 'edit' ? 4 : 3} class="px-4 py-2">
												<div class="flex items-center justify-between">
													<span class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
													<span class="text-[11px] text-gray-400">{sublabel}</span>
												</div>
											</td>
										</tr>
										{#each groupedFieldRewrites[ns] as [path, newVal]}
											{@const orig = getOriginal(path)}
											{@const isDirty = dirtyPaths.has(path) || addedPaths.has(path)}
											<tr class="border-t border-gray-100 hover:bg-gray-50/50 {isDirty ? 'border-l-2 border-l-amber-400 bg-amber-50/20' : ''}">
												<td class="py-2 px-4 font-mono text-[13px] text-gray-500 align-top break-all">{shortPath(path)}</td>
												<td class="py-2 px-4 align-top">
													{#if orig !== ''}
														<s class="text-red-400 text-[13px] break-all">{displayValue(orig)}</s>
													{/if}
												</td>
												<td class="py-2 px-4 align-top">
													{#if mode === 'edit'}
														<div class="flex items-start gap-1.5">
															<span class="text-{isDirty ? 'amber' : 'gray'}-400 text-[13px] flex-shrink-0 mt-1.5">→</span>
															<textarea
																rows="1"
																class="flex-1 min-w-0 border rounded-md px-2 py-1 text-[13px] text-gray-800 resize-none overflow-hidden {isDirty ? 'border-amber-300 bg-amber-50/30 focus:ring-amber-300' : 'border-gray-200 focus:ring-Success/30'} focus:outline-none focus:ring-2 focus:border-transparent"
																value={newVal ?? ''}
																on:input={(e) => { e.currentTarget.style.height = 'auto'; e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px'; onFieldChange(path, e.currentTarget.value); }}
															></textarea>
														</div>
													{:else}
														<div class="flex items-start gap-1.5">
															<span class="text-gray-300 text-[13px] flex-shrink-0 mt-0.5">→</span>
															<span class="text-Success text-[13px] font-medium break-all">{displayValue(newVal)}</span>
														</div>
													{/if}
												</td>
												{#if mode === 'edit'}
													<td class="py-2.5 pr-3 align-middle">
														<button
															on:click={() => deleteFieldRow(path)}
															class="flex items-center justify-center w-6 h-6 text-gray-300 hover:text-red-400 transition-colors rounded"
															title="Remove field"
														>
															<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
														</button>
													</td>
												{/if}
											</tr>
										{/each}
									{/if}
								{/each}
							</tbody>
						</table>
					</div>
					<!-- Scroll fade indicator -->
					<div class="pointer-events-none absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-white to-transparent rounded-b-xl"></div>
				</div>

				{#if mode === 'edit'}
					<div class="flex gap-2 mt-3">
						<div class="relative flex-shrink-0 w-[260px]">
							<select
								bind:value={newRowQuestionnaire}
								class="w-full appearance-none border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-Success/30 focus:border-Success bg-white"
							>
								<option value="">Select questionnaire…</option>
								<option value="ADULT_BIO">Adult Biographical Interview</option>
								<option value="patientInfo">Patient Profile</option>
								<option value="" disabled>PHQ-9 — disabled</option>
								<option value="" disabled>GAD-7 — disabled</option>
							</select>
							<svg class="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
						</div>
						<input
							bind:value={newRowPath}
							placeholder="field.path"
							class="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-Success/30 focus:border-Success font-mono"
							on:keydown={(e) => e.key === 'Enter' && addFieldRow()}
						/>
						<button
							on:click={addFieldRow}
							class="flex items-center justify-center w-9 h-9 bg-Success text-white rounded-lg hover:bg-Success/90 transition-colors font-bold text-lg flex-shrink-0"
							title="Add field"
						>+</button>
					</div>
				{/if}
			</section>

			<!-- ── TIER 2: Search & Replace ── -->
			<section>
				<div class="flex items-center justify-between mb-3">
					<div class="flex items-center gap-2">
						<span class="text-[11px] font-bold tracking-widest uppercase text-gray-800">
							Tier 2 — Search &amp; Replace
						</span>
						<span class="bg-teal-50 text-Success text-[11px] font-semibold px-2 py-0.5 rounded-full border border-Success/20">
							{filteredSearchReplace.length} rules
						</span>
					</div>
					{#if mode === 'view'}
						<span class="text-xs text-gray-400">Cross-questionnaire catch-all</span>
					{/if}
				</div>

				<!-- Table with its own independent scroll -->
				<div class="relative rounded-xl border border-gray-200 overflow-hidden">
					<table class="w-full font-mono">
						<thead>
							<tr class="bg-[#F3F4F2]">
								<th class="text-left py-2.5 px-4 text-[11px] font-semibold text-[#AAAAAA] uppercase tracking-wide">Find</th>
								<th class="text-left py-2.5 px-4 text-[11px] font-semibold text-[#AAAAAA] uppercase tracking-wide">Replace</th>
								{#if mode === 'edit'}<th class="w-9"></th>{/if}
							</tr>
						</thead>
					</table>
					<div class="overflow-y-auto max-h-[180px]">
						<table class="w-full font-mono">
							<tbody>
								{#each filteredSearchReplace as rule}
									<tr class="border-t border-gray-100 hover:bg-gray-50/50">
										<td class="py-2 px-4 align-middle">
											{#if mode === 'edit'}
												<input
													class="w-full border border-gray-200 rounded-md px-2 py-1 text-[13px] text-red-500 focus:outline-none focus:ring-2 focus:ring-Success/30 focus:border-Success"
													bind:value={editedSearchReplace[rule._idx].find}
													on:input={() => onSRChange(rule._idx)}
												/>
												{#if rule.desc}
													<span class="block mt-1 text-[10px] text-gray-400 font-sans">{rule.desc}</span>
												{/if}
											{:else}
												<span class="text-red-400 text-[13px]">"{rule.find}"</span>
												{#if rule.desc}
													<span class="block mt-0.5 text-[10px] text-gray-400 font-sans">{rule.desc}</span>
												{/if}
											{/if}
										</td>
										<td class="py-2 px-4 align-middle">
											{#if mode === 'edit'}
												<div class="flex items-center gap-1.5">
													<span class="text-gray-300 text-[13px] flex-shrink-0">→</span>
													<input
														class="flex-1 min-w-0 border border-gray-200 rounded-md px-2 py-1 text-[13px] text-Success focus:outline-none focus:ring-2 focus:ring-Success/30 focus:border-Success"
														bind:value={editedSearchReplace[rule._idx].replace}
														on:input={() => onSRChange(rule._idx)}
													/>
												</div>
											{:else}
												<div class="flex items-center gap-1.5">
													<span class="text-gray-300 text-[13px]">→</span>
													<span class="text-Success text-[13px]">"{rule.replace}"</span>
												</div>
											{/if}
										</td>
										{#if mode === 'edit'}
											<td class="py-2.5 pr-3 align-middle">
												<button
													on:click={() => deleteSRRow(rule._idx)}
													class="flex items-center justify-center w-6 h-6 text-gray-300 hover:text-red-400 transition-colors rounded"
													title="Remove rule"
												>
													<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
												</button>
											</td>
										{/if}
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					<!-- Scroll fade indicator -->
					<div class="pointer-events-none absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-white to-transparent rounded-b-xl"></div>
				</div>

				{#if mode === 'edit'}
					<div class="flex gap-2 mt-3">
						<input
							bind:value={newFindText}
							placeholder="find text"
							class="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono text-red-500 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-Success/30 focus:border-Success"
							on:keydown={(e) => e.key === 'Enter' && addSRRow()}
						/>
						<input
							bind:value={newReplaceText}
							placeholder="replace with"
							class="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono text-Success placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-Success/30 focus:border-Success"
							on:keydown={(e) => e.key === 'Enter' && addSRRow()}
						/>
						<input
							bind:value={newDescText}
							placeholder="role (optional) — e.g. Name of Child"
							class="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-Success/30 focus:border-Success"
							on:keydown={(e) => e.key === 'Enter' && addSRRow()}
						/>
						<button
							on:click={addSRRow}
							class="flex items-center justify-center w-9 h-9 bg-Success text-white rounded-lg hover:bg-Success/90 transition-colors font-bold text-lg flex-shrink-0"
							title="Add rule"
						>+</button>
					</div>
				{/if}
			</section>

		</div>

		<!-- ── Regenerate Profile — always visible, pinned at bottom ── -->
		<div class="flex-shrink-0 border-t border-gray-100 px-8 py-4">
			<div class="flex items-center gap-2 mb-3">
				<span class="text-[11px] font-bold tracking-widest uppercase text-gray-800">Regenerate Profile</span>
				<span class="text-xs text-gray-400">Optional — appended to master prompt</span>
			</div>

			{#if mode === 'edit'}
				<div class="flex items-center gap-3">
					<div class="flex items-center gap-1.5 text-xs text-gray-400">
						<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
						Save or cancel edits before regenerating the profile.
					</div>
					<button
						disabled
						class="inline-flex items-center gap-2 opacity-40 border border-gray-200 text-gray-500 rounded-lg px-4 py-2 text-sm font-medium cursor-not-allowed ml-auto flex-shrink-0"
					>
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;flex-shrink:0;"><path d="M9.738 10.78L5.847 14.757C4.677 15.953 4.092 16.551 4.013 17.28C3.996 17.434 3.996 17.59 4.013 17.744C4.092 18.473 4.677 19.071 5.847 20.267L5.996 20.419C6.62 21.058 6.933 21.377 7.306 21.591C7.524 21.716 7.755 21.813 7.995 21.882C8.408 22 8.851 22 9.738 22C10.624 22 11.068 22 11.481 21.882C11.721 21.813 11.952 21.716 12.169 21.591C12.543 21.377 12.855 21.058 13.48 20.419L16.324 17.512M9.738 10.78L13.32 7.123C14.707 5.708 15.4 5 16.263 5C17.126 5 17.819 5.708 19.204 7.125L19.947 7.885C21.316 9.283 22 9.983 22 10.85C22 11.717 21.315 12.416 19.946 13.814L16.324 17.512M9.738 10.78L16.324 17.512" /><path d="M5.5 2L5.758 2.697C6.096 3.611 6.265 4.068 6.599 4.401C6.932 4.735 7.389 4.904 8.303 5.242L9 5.5L8.303 5.758C7.389 6.096 6.932 6.265 6.599 6.599C6.265 6.932 6.096 7.389 5.758 8.303L5.5 9L5.242 8.303C4.904 7.389 4.735 6.932 4.401 6.599C4.068 6.265 3.611 6.096 2.697 5.758L2 5.5L2.697 5.242C3.611 4.904 4.068 4.735 4.401 4.401C4.735 4.068 4.904 3.611 5.242 2.697L5.5 2Z" /></svg>
						Regenerate Profile
					</button>
				</div>
			{:else}
				<div class="flex gap-2">
					<input
						bind:value={regeneratePrompt}
						placeholder="e.g. 'Ensure the patient's employer name is replaced throughout...'"
						class="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-Success/30 focus:border-Success"
						on:keydown={(e) => e.key === 'Enter' && handleRegenerate()}
					/>
					<button
						on:click={handleRegenerate}
						disabled={regenerating}
						class="inline-flex items-center gap-2 bg-Success text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-Success/90 transition-colors disabled:opacity-60 flex-shrink-0"
					>
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;flex-shrink:0;"><path d="M9.738 10.78L5.847 14.757C4.677 15.953 4.092 16.551 4.013 17.28C3.996 17.434 3.996 17.59 4.013 17.744C4.092 18.473 4.677 19.071 5.847 20.267L5.996 20.419C6.62 21.058 6.933 21.377 7.306 21.591C7.524 21.716 7.755 21.813 7.995 21.882C8.408 22 8.851 22 9.738 22C10.624 22 11.068 22 11.481 21.882C11.721 21.813 11.952 21.716 12.169 21.591C12.543 21.377 12.855 21.058 13.48 20.419L16.324 17.512M9.738 10.78L13.32 7.123C14.707 5.708 15.4 5 16.263 5C17.126 5 17.819 5.708 19.204 7.125L19.947 7.885C21.316 9.283 22 9.983 22 10.85C22 11.717 21.315 12.416 19.946 13.814L16.324 17.512M9.738 10.78L16.324 17.512" /><path d="M5.5 2L5.758 2.697C6.096 3.611 6.265 4.068 6.599 4.401C6.932 4.735 7.389 4.904 8.303 5.242L9 5.5L8.303 5.758C7.389 6.096 6.932 6.265 6.599 6.599C6.265 6.932 6.096 7.389 5.758 8.303L5.5 9L5.242 8.303C4.904 7.389 4.735 6.932 4.401 6.599C4.068 6.265 3.611 6.096 2.697 5.758L2 5.5L2.697 5.242C3.611 4.904 4.068 4.735 4.401 4.401C4.735 4.068 4.904 3.611 5.242 2.697L5.5 2Z" /></svg>
						{regenerating ? 'Regenerating…' : 'Regenerate'}
					</button>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	/* ── Concentric rings ── */
	.regen-ring-outer { animation: regen-spin 12s linear infinite; }
	.regen-ring-mid   { animation: regen-spin 8s linear infinite reverse; }
	.regen-ring-inner { animation: regen-spin 4s linear infinite; }

	/* ── Center icon breathe ── */
	.regen-icon-breathe {
		animation: regen-breathe 3s ease-in-out infinite;
	}

	/* ── Glow pulse behind icon ── */
	.regen-glow {
		animation: regen-glow-pulse 3s ease-in-out infinite;
	}

	/* ── Floating particles ── */
	.regen-particle {
		animation-timing-function: ease-in-out;
		animation-iteration-count: infinite;
	}
	.regen-p1 { animation: regen-float-1 5s 0s infinite; }
	.regen-p2 { animation: regen-float-2 6s 0.8s infinite; }
	.regen-p3 { animation: regen-float-3 5.5s 1.5s infinite; }
	.regen-p4 { animation: regen-float-4 4.5s 0.3s infinite; }
	.regen-p5 { animation: regen-float-5 7s 2s infinite; }
	.regen-p6 { animation: regen-float-6 5s 1s infinite; }

	/* ── Shimmer rows ── */
	.regen-shimmer {
		animation: regen-shimmer 1.5s ease-in-out infinite;
	}

	/* ── Keyframes ── */
	@keyframes regen-spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}
	@keyframes regen-breathe {
		0%, 100% { transform: scale(1); }
		50% { transform: scale(1.08); }
	}
	@keyframes regen-glow-pulse {
		0%, 100% { transform: scale(1); opacity: 0.4; }
		50% { transform: scale(1.6); opacity: 0; }
	}
	@keyframes regen-shimmer {
		0%, 100% { opacity: 0.2; }
		50% { opacity: 0.5; }
	}

	/* Each particle follows a unique looping path */
	@keyframes regen-float-1 {
		0%   { transform: translate(50px, -20px); opacity: 0; }
		15%  { opacity: 1; }
		50%  { transform: translate(-40px, -55px); opacity: 0.7; }
		85%  { opacity: 1; }
		100% { transform: translate(50px, -20px); opacity: 0; }
	}
	@keyframes regen-float-2 {
		0%   { transform: translate(-55px, 10px); opacity: 0; }
		15%  { opacity: 0.8; }
		50%  { transform: translate(-20px, 60px); opacity: 0.5; }
		85%  { opacity: 0.8; }
		100% { transform: translate(-55px, 10px); opacity: 0; }
	}
	@keyframes regen-float-3 {
		0%   { transform: translate(30px, 50px); opacity: 0; }
		20%  { opacity: 0.6; }
		50%  { transform: translate(65px, -10px); opacity: 0.4; }
		80%  { opacity: 0.6; }
		100% { transform: translate(30px, 50px); opacity: 0; }
	}
	@keyframes regen-float-4 {
		0%   { transform: translate(-60px, -40px); opacity: 0; }
		20%  { opacity: 0.9; }
		50%  { transform: translate(10px, -70px); opacity: 0.5; }
		80%  { opacity: 0.9; }
		100% { transform: translate(-60px, -40px); opacity: 0; }
	}
	@keyframes regen-float-5 {
		0%   { transform: translate(60px, 30px); opacity: 0; }
		15%  { opacity: 0.5; }
		50%  { transform: translate(-50px, 40px); opacity: 0.3; }
		85%  { opacity: 0.5; }
		100% { transform: translate(60px, 30px); opacity: 0; }
	}
	@keyframes regen-float-6 {
		0%   { transform: translate(-30px, 60px); opacity: 0; }
		20%  { opacity: 0.7; }
		50%  { transform: translate(55px, 50px); opacity: 0.4; }
		80%  { opacity: 0.7; }
		100% { transform: translate(-30px, 60px); opacity: 0; }
	}
</style>
