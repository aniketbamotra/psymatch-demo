<script>
	import { createEventDispatcher, onMount, onDestroy } from 'svelte';
	import { navState, selectedPatient } from '$lib/stores';
	import Cross from './Cross.svelte';
	import Help from '../feather/help.svelte';
	import InfoTooltip from './InfoTooltip.svelte';
	import DocxIcon from '../feather/docx.svelte';
	import PdfIcon from '../feather/pdf.svelte';
	import { debugMode as t } from '$lib/i18n-debug';
	import { showRedactionProfile, redactionRegenerating } from '$lib/stores';
	// Single source of truth for the report dependency graph (who derives from whom).
	import { parentsOf, invalidatedBy } from '$lib/reports/reportGraph.js';

	const dispatch = createEventDispatcher();
	import MultiSelector from '../form/MultiSelector.svelte';
	import Button from '../buttons/Button.svelte';
	import * as api from '$lib/api';
	let assignments = [];
	let loading = false;
	let error = '';
	let selected = [];
	let summaryReport = false;
	let debugMode = false;
	let debugResults = null;
	let patientName = '';
	let patientPronouns = '';
	let showTooltip = false;

	let generatingAnonymization = false;
	let anonymizationProfile = null;
	let redactPii = false;
	let progressPercent = 0;
	let currentStep = '';

	$: adultBioComplete = assignments.some((a) => a.testCode === 'ADULT_BIO');
	$: profileStatus = anonymizationProfile?.status ?? null;

	async function handleGenerateAnonymization() {
		if (!$selectedPatient) return;
		try {
			generatingAnonymization = true;
			error = '';
			progressPercent = 2;
			currentStep = 'Starting…';

			const response = await fetch('/api/anonymization/process', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ patientId: $selectedPatient })
			});

			if (!response.ok) {
				const errData = await response.json().catch(() => ({}));
				throw new Error(errData.error || 'Failed to generate redaction profile');
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
					if (data.percent !== undefined) progressPercent = data.percent;
					if (data.label) currentStep = data.label;
					if (data.error) throw new Error(data.error);
					if (data.done) {
						progressPercent = 100;
						currentStep = 'Profile ready';
						await new Promise(r => setTimeout(r, 800));
						anonymizationProfile = { status: 'completed' };
					}
				}
			}
		} catch (err) {
			console.error('Anonymization generation error:', err);
			error = err.message || 'Error generating redaction profile';
		} finally {
			generatingAnonymization = false;
			// A fresh profile may change AI Report readiness — refresh.
			loadAiReport();
		}
	}

	// ── AI Report (comprehensive report) — 5-state flow ──────────────────────────
	// Backend: POST /api/comprehensive-report/[id] (dispatch), GET (poll status +
	// readiness + staleness + aiCost), GET /api/download-generative-summary/[id].
	let aiLatest = null; // { status, jobId, costUsd, ... } for the most recent run
	let aiReadiness = null; // { ready, required[], completedCount, requiredCount }
	let aiStaleness = null; // { stale, newInterviews[] }
	let aiCostTotal = 0; // patient-wide "AI credit used"
	let aiGenerating = false; // optimistic until a poll reflects a terminal status
	let aiError = '';
	let aiPollTimer = null;
	// Per-variant elapsed timer: when a variant first appears 'generating' we stamp
	// `${key}_${lang}` here, and a 1s ticker advances `aiNow` so the row can show mm:ss.
	let aiGenStartedAt = {};
	let aiNow = Date.now();
	let aiTickTimer = null;
	function startAiTick() {
		if (aiTickTimer) return;
		aiTickTimer = setInterval(() => (aiNow = Date.now()), 1000);
	}
	function stopAiTick() {
		if (aiTickTimer) {
			clearInterval(aiTickTimer);
			aiTickTimer = null;
		}
	}
	function fmtElapsed(ms) {
		const s = Math.max(0, Math.floor(ms / 1000));
		return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
	}

	// disabled → ready → generating → ready_to_download / regenerate_suggested
	$: aiReportState =
		aiGenerating || aiLatest?.status === 'generating'
			? 'generating'
			: aiLatest?.status === 'successful'
				? aiStaleness?.stale
					? 'regenerate_suggested'
					: 'ready_to_download'
				: aiReadiness?.ready
					? 'ready'
					: 'disabled';

	function startAiPolling() {
		if (aiPollTimer) return;
		aiPollTimer = setInterval(loadAiReport, 4000);
	}
	function stopAiPolling() {
		if (aiPollTimer) {
			clearInterval(aiPollTimer);
			aiPollTimer = null;
		}
	}

	async function loadAiReport() {
		if (!$selectedPatient) return;
		try {
			const res = await fetch(`/api/comprehensive-report/${$selectedPatient}`, {
				headers: { Accept: 'application/json' }
			});
			if (!res.ok) return;
			const data = await res.json();
			aiLatest = data.latest ?? null;
			aiReadiness = data.readiness ?? null;
			aiStaleness = data.staleness ?? null;
			aiVariants = data.variants ?? {};
			letter = data.referralLetter ?? { state: 'absent' };
			if (letter.state !== 'ready') letterSelected = false;
			aiCostTotal = data.aiCost?.totalUsd ?? 0;
			// Clear per-variant Manage status once its variant reaches a terminal state.
			for (const k of Object.keys(aiVarStatus)) {
				if (aiVariants[k] === 'ready' || aiVariants[k] === 'failed') delete aiVarStatus[k];
			}
			aiVarStatus = { ...aiVarStatus };
			// Stamp/clear each variant's generating start so its row can show an elapsed timer.
			const nowTs = Date.now();
			for (const [k, s] of Object.entries({ ...aiVariants, [LETTER.vkey]: letter.state })) {
				if (s === 'generating') {
					if (!aiGenStartedAt[k]) aiGenStartedAt[k] = nowTs;
				} else if (aiGenStartedAt[k]) delete aiGenStartedAt[k];
			}
			aiGenStartedAt = { ...aiGenStartedAt };
			// Resolve the optimistic flag once the server reflects a terminal state.
			if (aiLatest?.status === 'successful' || aiLatest?.status === 'failed') aiGenerating = false;
			// Keep polling while the base run OR any derived variant is still generating.
			const variantsPending =
				Object.values(aiVariants).some((s) => s === 'generating') || letter.state === 'generating';
			if (aiGenerating || aiLatest?.status === 'generating' || variantsPending) {
				startAiPolling();
				startAiTick();
			} else {
				stopAiPolling();
				stopAiTick();
			}
		} catch (err) {
			console.error('loadAiReport error:', err);
		}
	}

	// Dispatch the base comprehensive run. Returns true when the agent ACCEPTED the
	// request (→ generation is now in progress), false on any dispatch failure.
	async function handleGenerateAiReport() {
		if (!$selectedPatient) return false;
		try {
			aiError = '';
			aiGenerating = true; // optimistic → Generating immediately
			const res = await fetch(`/api/comprehensive-report/${$selectedPatient}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: '{}'
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok || data.accepted === false) {
				aiGenerating = false;
				aiError =
					res.status === 422
						? 'Could not redact safely — review the redaction profile before generating.'
						: data.error || 'Failed to start AI Report generation.';
				return false;
			}
			startAiPolling();
			return true;
		} catch (err) {
			aiGenerating = false;
			aiError = err.message || 'Failed to start AI Report generation.';
			return false;
		}
	}

	// ── AI reports: the agent produces four formats, each in EN/FR, PDF or DOCX. ──
	const AI_REPORTS = [
		{ key: 'comprehensive', name: 'Comprehensive', sub: 'Full clinical report' },
		{ key: 'concise', name: 'Concise', sub: 'Shorter summary' },
		{ key: 'referral', name: 'Referral letter', sub: 'For referring clinician' },
		{ key: 'patient_summary', name: 'Patient Summary', sub: 'For the patient' }
	];
	let aiLang = 'en'; // 'en' | 'fr'
	let aiType = 'pdf'; // 'pdf' | 'docx' — output format for AI report downloads
	let aiSelected = { comprehensive: true, concise: true, referral: false, patient_summary: false };
	// Per-report action status for the current run: 'idle' | 'processing' | 'done' | 'error'.
	let aiDlStatus = { comprehensive: 'idle', concise: 'idle', referral: 'idle', patient_summary: 'idle' };
	let aiBusy = false; // any report currently processing
	let aiAction = ''; // '' | 'generate' | 'download' | 'regenerate' — drives the button spinner
	// { `${format}_${language}`: 'ready'|'generating'|'failed'|'absent' } from the poll.
	let aiVariants = {};

	// ── Standalone referral letter (new engine, `referral_letter_en`) ──
	// Not part of the report graph: generated straight from the interview case by
	// its own agent workflow, English only. Kept apart from AI_REPORTS so the
	// existing reports (including the old referral letter, the rollback) keep
	// their exact behaviour.
	const LETTER = { key: 'referral_letter', vkey: 'referral_letter_en', name: 'Referral letter (new)', sub: 'Revision 4 design · English only' };
	// { state:'absent'|'generating'|'ready'|'failed', reviewWarnings, error, staleness, onOlderJob }
	let letter = { state: 'absent' };
	let letterSelected = false;
	let letterRequesting = false;
	let letterDisabled = false; // agent answered referral_letter_disabled (switch off)
	let letterConfirm = false; // regenerate confirmation open
	$: letterState = letter?.state ?? 'absent';
	$: letterDownloadable = aiLang === 'en' && letterState === 'ready';

	// ── Split AI rail: Download (default, read-only) vs Manage (build/regenerate) ──
	// The mode governs only the AI rail; Standard reports are instant/download-only.
	// Toggling never resizes the modal (min-height is locked to the taller state).
	let aiMode = 'download'; // 'download' | 'manage'
	function setAiMode(m) {
		aiMode = m;
	}
	// Optional: download a REDACTED (de-identified) copy of the AI report.
	let redactAiDownload = false;
	// From Download, "Generate" on a not-yet-built report selects it and hands off
	// to Manage, where the (credit-spending) build is confirmed — download itself
	// never generates.
	function requestGenerateInManage(key) {
		if (!aiSelectable(key)) return;
		aiSelected = { ...aiSelected, [key]: true };
		aiMode = 'manage';
	}

	// A report row is selectable while it is NOT mid-generation.
	$: aiSelectable = (key) => aiVariants[`${key}_${aiLang}`] !== 'generating';

	// Source-of-truth (comprehensive_en) presence gates every derived report — they
	// can only be built or downloaded once it exists.
	$: aiSourceReady = aiVariants['comprehensive_en'] === 'ready';
	// Comprehensive's status in the active language (drives the Manage source row).
	$: aiCompStatus = aiVariants[`comprehensive_${aiLang}`] ?? 'absent';
	// Per-report variant status in the active language ('ready'|'generating'|'failed'|'absent').
	$: aiVariantStatus = (key) => aiVariants[`${key}_${aiLang}`] ?? 'absent';
	// Download set = reports the user has ticked that are actually ready to render.
	// Download never builds, so this is independent of the regenerate logic.
	$: aiDownloadSet = [
		...AI_REPORTS.filter((r) => aiSelected[r.key] && aiVariants[`${r.key}_${aiLang}`] === 'ready').map(
			(r) => r.key
		),
		...(letterSelected && letterDownloadable ? [LETTER.key] : [])
	];

	// ── Left-nav sections: Standard reports · AI reports · Redaction profile ──
	let navSection = 'standard'; // 'standard' | 'ai' | 'redaction'

	// Reports partitioned by build status for the Manage surface (active language).
	$: aiGenerated = AI_REPORTS.filter((r) => aiVariants[`${r.key}_${aiLang}`] === 'ready');
	$: aiNotGenerated = AI_REPORTS.filter((r) => aiVariants[`${r.key}_${aiLang}`] !== 'ready');
	// A report is (re)buildable only when every parent it derives from is ready.
	// Roots (comprehensive) have no parents ⇒ always buildable.
	function canGenerate(key) {
		return parentsOf(key, aiLang).every((pk) => aiVariants[pk] === 'ready');
	}
	// The report(s) a variant is BUILT FROM, as display names (empty ⇒ a source).
	function parentNames(key) {
		return parentsOf(key, aiLang).map((pk) => {
			const f = pk.slice(0, pk.lastIndexOf('_'));
			return AI_REPORTS.find((r) => r.key === f)?.name ?? f;
		});
	}

	// Manage lists ALL variants — every format in EN and FR (FR derives from its EN
	// sibling), so the French reports are visible + independently buildable.
	const MANAGE_VARIANTS = AI_REPORTS.flatMap((r) =>
		['en', 'fr'].map((lang) => ({
			format: r.key,
			language: lang,
			vkey: `${r.key}_${lang}`,
			name: r.name,
			lang: lang.toUpperCase()
		}))
	);
	$: mvGenerated = MANAGE_VARIANTS.filter((v) => aiVariants[v.vkey] === 'ready');
	$: mvNotGenerated = MANAGE_VARIANTS.filter((v) => aiVariants[v.vkey] !== 'ready');
	// Per-variant Manage build status: 'requesting' (dispatch in flight) → 'processing'
	// (agent accepted, generating) → done/error. Keyed by vkey `${format}_${language}`.
	let aiVarStatus = {};
	function mvCanGenerate(v) {
		return parentsOf(v.format, v.language).every((pk) => aiVariants[pk] === 'ready');
	}
	function mvParentNames(v) {
		return parentsOf(v.format, v.language).map((pk) => {
			const f = pk.slice(0, pk.lastIndexOf('_'));
			const l = pk.slice(pk.lastIndexOf('_') + 1);
			return `${AI_REPORTS.find((r) => r.key === f)?.name ?? f}${l === 'fr' ? ' (FR)' : ''}`;
		});
	}

	// ── Regenerate confirmation popup (shows the cascade before spending credits) ──
	let pendingRegen = null; // { format, language } awaiting confirm, or null
	function askRegen(format, language) {
		pendingRegen = { format, language };
	}
	function cancelRegen() {
		pendingRegen = null;
	}
	function confirmRegen() {
		const p = pendingRegen;
		pendingRegen = null;
		if (p) runVariantAction(p.format, p.language, true);
	}
	// Already-GENERATED reports downstream of pendingRegen — the ones that get
	// invalidated + rebuilt. Not-yet-generated descendants are unaffected.
	$: invalidatedNames = pendingRegen
		? invalidatedBy(pendingRegen.format, pendingRegen.language, (k) => aiVariants[k] === 'ready').map((pk) => {
				const f = pk.slice(0, pk.lastIndexOf('_'));
				const l = pk.slice(pk.lastIndexOf('_') + 1);
				return `${AI_REPORTS.find((r) => r.key === f)?.name ?? f}${l === 'fr' ? ' (FR)' : ''}`;
			})
		: [];
	$: pendingRegenName = pendingRegen
		? `${AI_REPORTS.find((r) => r.key === pendingRegen.format)?.name ?? pendingRegen.format}${pendingRegen.language === 'fr' ? ' (FR)' : ''}`
		: '';

	// ── Redaction profile detail (fetched on demand for the redaction pane) ──
	let redactionProfile = null; // { version, generatedAt, searchReplace, fieldRewrites, mappings[] }
	let redactionProfileLoading = false;
	async function loadRedactionProfile() {
		if (!$selectedPatient || redactionProfileLoading) return;
		redactionProfileLoading = true;
		try {
			const res = await fetch(`/api/anonymization/profile/${$selectedPatient}`);
			if (!res.ok) {
				redactionProfile = null;
				return;
			}
			const data = await res.json();
			const sr = data.profile?.searchReplace ?? [];
			const fr = data.profile?.fieldRewrites ?? {};
			// Example original→redacted mappings for the "what it redacts" preview.
			const mappings = sr
				.filter((r) => r && (r.find ?? r.original) && (r.replace ?? r.replacement))
				.slice(0, 4)
				.map((r) => ({ from: String(r.find ?? r.original), to: String(r.replace ?? r.replacement) }));
			redactionProfile = {
				version: data.profile?.version,
				generatedAt: data.profile?.generatedAt,
				ruleCount: sr.length,
				fieldCount: Object.keys(fr).length,
				mappings
			};
		} catch (err) {
			console.error('loadRedactionProfile error:', err);
			redactionProfile = null;
		} finally {
			redactionProfileLoading = false;
		}
	}
	// Fetch the profile the first time the redaction pane is opened with a ready profile.
	$: if (navSection === 'redaction' && profileStatus === 'completed' && !redactionProfile && !redactionProfileLoading) {
		loadRedactionProfile();
	}

	function toggleAiSelect(key) {
		if (!aiSelectable(key)) return;
		aiSelected = { ...aiSelected, [key]: !aiSelected[key] };
	}
	function setAiLang(l) {
		if (aiLang === l) return;
		aiLang = l;
		// A language switch invalidates any prior per-report results.
		aiDlStatus = { comprehensive: 'idle', concise: 'idle', referral: 'idle', patient_summary: 'idle' };
	}
	function setAiType(ty) {
		if (aiType === ty) return;
		aiType = ty;
		// Switching output format invalidates the prior per-report results.
		aiDlStatus = { comprehensive: 'idle', concise: 'idle', referral: 'idle', patient_summary: 'idle' };
	}

	// Download one variant in the chosen output type. Returns `{ preparing:true }`
	// (NOT a throw) when the server answers 409 — the variant isn't built yet, so
	// the caller can ensure+poll and retry. Throws on real errors (403/404/5xx).
	async function downloadOneAiReport(format, language, type = 'pdf', redact = false) {
		const res = await fetch(
			`/api/download-generative-summary/${$selectedPatient}?format=${format}&language=${language}&type=${type}${redact ? '&redact=1' : ''}`
		);
		if (res.status === 409) {
			// Not ready yet — { preparing:true, status:'absent'|'generating' }.
			const data = await res.json().catch(() => ({}));
			return { preparing: true, status: data.status ?? 'generating' };
		}
		if (!res.ok) {
			const data = await res.json().catch(() => ({}));
			throw new Error(data.error || `Could not download ${format}.`);
		}
		const blob = await res.blob();
		const url = window.URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		const ext = type === 'docx' ? 'docx' : 'pdf';
		let filename = `psymatch-${format}-${language}-${$selectedPatient}.${ext}`;
		const cd = res.headers.get('Content-Disposition');
		if (cd) {
			const m = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(cd);
			if (m && m[1]) filename = m[1].replace(/['"]/g, '');
		}
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		window.URL.revokeObjectURL(url);
		document.body.removeChild(a);
		return { downloaded: true };
	}

	// Ask the server to build (or rebuild) a variant. "Advance-one-step": each
	// call kicks the next runnable node in the dependency chain; re-call after the
	// in-flight variant completes to advance further. Returns parsed `{ state }`.
	async function ensureAiReport(format, language, regenerate = false) {
		const res = await fetch(`/api/ai-report/${$selectedPatient}/ensure`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ format, language, regenerate })
		});
		const data = await res.json().catch(() => ({}));
		if (res.status === 409 && data.error === 'generate_first') {
			aiError = 'Generate the AI report first.';
			return { state: 'generate_first' };
		}
		if (res.status === 202 || res.ok) {
			startAiPolling();
		}
		return data;
	}

	// Wait until the poll reports a terminal state for one variant. Resolves with
	// 'ready' | 'failed', or 'timeout' once the cap is exceeded. Relies on the 4s
	// `loadAiReport` poll keeping `aiVariants` fresh while we await.
	function waitForVariant(format, language, { timeoutMs = 5 * 60 * 1000, intervalMs = 1500 } = {}) {
		const key = `${format}_${language}`;
		const deadline = Date.now() + timeoutMs;
		return new Promise((resolve) => {
			const tick = () => {
				const status = aiVariants[key];
				if (status === 'ready') return resolve('ready');
				if (status === 'failed') return resolve('failed');
				if (Date.now() > deadline) return resolve('timeout');
				setTimeout(tick, intervalMs);
			};
			tick();
		});
	}

	// Build one variant to completion, advancing the dependency chain one step at
	// a time. Returns 'ready' | 'failed' | 'timeout' | 'generate_first'.
	async function buildVariant(format, language, regenerate = false) {
		// Already done and not regenerating? Nothing to build.
		if (!regenerate && aiVariants[`${format}_${language}`] === 'ready') return 'ready';
		let firstPass = true;
		const overallDeadline = Date.now() + 5 * 60 * 1000;
		// Cap iterations so a stuck chain can't loop forever; each iteration kicks
		// the next runnable node and waits for it before re-calling ensure.
		for (let i = 0; i < 200 && Date.now() < overallDeadline; i++) {
			const data = await ensureAiReport(format, language, regenerate && firstPass);
			firstPass = false;
			const state = data?.state;
			if (state === 'generate_first') return 'generate_first';
			if (state === 'ready') return 'ready';
			// Dispatch failed (e.g. the report agent is unreachable) — fail fast
			// instead of polling for a node the server never actually kicked.
			if (data?.error) return 'failed';
			// 202 generating — wait for the node the server actually kicked (which may
			// be an ANCESTOR of the target), then re-call ensure to advance further.
			const t = data?.triggered ?? { format, language };
			const settled = await waitForVariant(t.format, t.language);
			if (settled === 'timeout') return 'timeout';
			if (settled === 'failed') {
				// The target itself failed — report it. An ancestor failure also blocks
				// the target, so surface that too.
				return 'failed';
			}
			// Ancestor became ready — loop to ensure() to kick the next node. When the
			// target itself becomes ready, the next ensure() returns 200 → 'ready'.
		}
		return 'timeout';
	}

	// Lazy, dependency-driven download. For each ticked + ready report (in the active
	// language + output type): download it. Sequential — browsers drop rapid
	// concurrent programmatic downloads.
	async function downloadSelectedAiReports() {
		if (!$selectedPatient || aiBusy) return;
		const keys = aiDownloadSet; // ticked + ready; download never builds
		if (keys.length === 0) return;
		aiError = '';
		aiBusy = true;
		aiAction = 'download';
		for (const k of keys) aiDlStatus[k] = 'processing';
		aiDlStatus = { ...aiDlStatus };
		for (const k of keys) {
			try {
				const isLetter = k === LETTER.key;
				let result = await downloadOneAiReport(k, isLetter ? 'en' : aiLang, aiType, redactAiDownload);
				// Rare 409 race: the variant flipped back to building between the poll
				// and the request — rebuild once, then retry the download. Never for
				// the new letter: a download must not start a paid run.
				if (result?.preparing && !isLetter) {
					const built = await buildVariant(k, aiLang, false);
					if (built === 'ready') result = await downloadOneAiReport(k, aiLang, aiType, redactAiDownload);
				}
				if (result?.preparing) {
					aiDlStatus[k] = 'error';
					aiError = `Could not download ${k} — still preparing.`;
				} else {
					aiDlStatus[k] = 'done';
				}
			} catch (err) {
				aiDlStatus[k] = 'error';
				aiError = err.message || `Failed to download ${k}.`;
			}
			aiDlStatus = { ...aiDlStatus };
		}
		aiBusy = false;
		aiAction = '';
	}

	// Per-report action for the Manage surface. Builds or regenerates ONE report,
	// walking the dependency chain. Comprehensive-from-scratch uses the base
	// dispatch (POST comprehensive-report) since the chain builder can't create the
	// SoT root; everything else uses buildVariant.
	async function runVariantAction(format, language, regenerate) {
		if (!$selectedPatient || aiBusy) return;
		const vkey = `${format}_${language}`;
		const status = aiVariants[vkey];
		aiError = '';
		// State 1 — request being sent to the agent.
		aiVarStatus[vkey] = 'requesting';
		aiVarStatus = { ...aiVarStatus };

		const isRoot = format === 'comprehensive' && language === 'en';
		if (isRoot && status !== 'ready' && !regenerate) {
			// Comprehensive-EN from scratch → base dispatch (creates the SoT root);
			// the poll then flips the row to State 2 (Generating). Non-blocking.
			const ok = await handleGenerateAiReport();
			if (!ok) aiVarStatus[vkey] = 'error';
			aiVarStatus = { ...aiVarStatus };
			loadAiReport();
			return;
		}

		// Derived / regenerate — build the chain to completion. Regenerate
		// confirmation + cascade preview are handled by the popup before this runs.
		aiBusy = true;
		aiAction = regenerate ? 'regenerate' : 'generate';
		try {
			// State 2 — once the poll reports `generating`, the row shows the timer.
			const built = await buildVariant(format, language, regenerate);
			if (built === 'generate_first') aiError = 'Generate the Comprehensive report first.';
			else if (built === 'failed') aiError = `Could not build ${format} — is the report agent running?`;
			else if (built === 'timeout') aiError = `Timed out building ${format}.`;
			aiVarStatus[vkey] = built === 'ready' ? 'done' : 'error';
		} catch (err) {
			aiVarStatus[vkey] = 'error';
			aiError = err.message || `Failed to build ${format}.`;
		}
		aiVarStatus = { ...aiVarStatus };
		aiBusy = false;
		aiAction = '';
		loadAiReport();
	}

	// Dispatch the standalone referral letter. The agent owns its status from the
	// moment it accepts; the poll then drives the row. `regenerate` is only sent
	// after the confirmation popup, so a click can't silently replace a letter.
	async function generateLetter(regenerate = false) {
		if (!$selectedPatient || letterRequesting) return;
		aiError = '';
		letterRequesting = true;
		try {
			const res = await fetch(`/api/ai-report/${$selectedPatient}/referral-letter`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ regenerate })
			});
			const data = await res.json().catch(() => ({}));
			if (res.status === 202) {
				letterDisabled = false;
				letter = { ...letter, state: 'generating' };
				startAiPolling();
				startAiTick();
				return;
			}
			aiError = letterErrorMessage(data);
			if (data.error === 'referral_letter_disabled') letterDisabled = true;
			if (data.error === 'letter_exists') letterConfirm = true;
		} catch (err) {
			aiError = err.message || 'Could not start the referral letter.';
		} finally {
			letterRequesting = false;
			loadAiReport();
		}
	}

	function letterErrorMessage(data) {
		switch (data?.error) {
			case 'referral_letter_disabled':
				return 'The new referral letter is switched off on the report agent.';
			case 'redaction_blocked':
				return 'Could not redact safely — review the redaction profile before generating.';
			case 'case_build_failed':
				return 'Could not build the interview case for this patient.';
			case 'already_generating':
				return 'A referral letter is already being generated.';
			case 'letter_exists':
				return '';
			case 'agent_conflict':
				return 'The report agent is busy with this patient (for example a Comprehensive run). Try again when it finishes.';
			case 'agent_rejected':
				return data.detail?.error === 'invalid_referral_case_or_metadata'
					? 'The report agent rejected this case: an administered interview has no standard report.'
					: `The report agent rejected this case (${data.detail?.error ?? 'invalid request'}).`;
			default:
				return 'Could not start the referral letter — is the report agent running?';
		}
	}

	function confirmLetterRegen() {
		letterConfirm = false;
		generateLetter(true);
	}

	onDestroy(() => {
		stopAiPolling();
		stopAiTick();
	});

	async function loadAssignments() {
		if (!$selectedPatient) {
			error = $t('Popups.PrintReport.error_no_patient');
			return;
		}

		try {
			loading = true;
			error = '';

			// Use GET endpoint with includeResponses=false for faster loading
			const response = await api.get(
				`/api/questionnaire-results/${$selectedPatient}?includeResponses=false`
			);

			if (response.ok) {
				const data = await response.json();
				console.log('Questionnaire results loaded:', data);

				anonymizationProfile = data.anonymizationProfile ?? null;

				// Set patient name from API response
				patientName = data.patientName || $t('Popups.PrintReport.default_patient_name');

				// TODO: Backend team to add patientPronouns field to API response
				// Once available, uncomment: patientPronouns = data.patientPronouns || '';
				patientPronouns = data.patientPronouns || '';

				// Transform assignments from new API format
				// Include status to style downloaded assignments differently
				assignments = data.assignments.map((assignment) => ({
					id: assignment.assignmentId,
					title: assignment.assignmentName,
					testName: assignment.assignmentName,
					testCode: assignment.testCode,
					status: assignment.status // 'completed' or 'downloaded'
				}));
			} else {
				const errorData = await response.json().catch(() => ({}));
				error = errorData.error || $t('Popups.PrintReport.error_load_assignments');
				assignments = [];
			}
		} catch (err) {
			error = err.message || $t('Popups.PrintReport.error_load_assignments');
			assignments = [];
		} finally {
			loading = false;
		}
	}

	function closeModal() {
		$selectedPatient = null;
		if (typeof window !== 'undefined') {
			window.localStorage.removeItem('selectedPatientId');
		}
		dispatch('close');
		$navState = 'SearchPatient';
	}

	async function handlePrintReport(type = 'pdf') {
		if (!$selectedPatient) {
			error = $t('Popups.PrintReport.error_no_patient');
			return;
		}

		if (selected.length === 0) {
			error = $t('Popups.PrintReport.error_select_item');
			return;
		}

		try {
			loading = true;
			error = '';
			debugResults = null;

			// Map selected assignments with selected flag
			const selectedAssignments = assignments
				.map((assignment) => ({
					...assignment,
					selected: selected.some((s) => s.id === assignment.id)
				}))
				.sort((a, b) => {
					// Ensure 'Therapist Matching' is always at the start of the array
					if (a.title === 'Therapist Matching' && b.title !== 'Therapist Matching') {
						return -1;
					}
					if (b.title === 'Therapist Matching' && a.title !== 'Therapist Matching') {
						return 1;
					}
					return 0;
				});
			console.log('Selected assignments:', selectedAssignments);

			// Use regular POST for both debug and normal mode, passing the type
			const response = await api.post('/api/print', {
				assignments: selectedAssignments,
				userId: $selectedPatient,
				summary: summaryReport,
				debug: debugMode,
				type: type,
				redactPii: redactPii && profileStatus === 'completed'
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new Error(errorData.error || $t('Popups.PrintReport.error_generate_report'));
			}

			if (debugMode) {
				const data = await response.json();
				debugResults = data.allEvaluatedResults;

				// Handle file download in debug mode if buffer exists
				if (data.pdfBuffer) {
					const mimeType =
						type === 'docx'
							? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
							: 'application/pdf';
					const extension = type === 'docx' ? 'docx' : 'pdf';

					const blob = new Blob([new Uint8Array(data.pdfBuffer)], { type: mimeType });
					const url = window.URL.createObjectURL(blob);
					const a = document.createElement('a');
					a.href = url;
					a.download = `diagnostic_report_${Date.now()}.${extension}`;
					document.body.appendChild(a);
					a.click();
					window.URL.revokeObjectURL(url);
					document.body.removeChild(a);
				}
			} else {
				// Normal mode - response is the file blob
				const blob = await response.blob();
				const url = window.URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url;

				// Get filename from header or default
				const contentDisposition = response.headers.get('Content-Disposition');
				let filename = `diagnostic_report_${Date.now()}.${type === 'docx' ? 'docx' : 'pdf'}`;
				if (contentDisposition) {
					const matches = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(contentDisposition);
					if (matches != null && matches[1]) {
						filename = matches[1].replace(/['"]/g, '');
					}
				}

				a.download = filename;
				document.body.appendChild(a);
				a.click();
				window.URL.revokeObjectURL(url);
				document.body.removeChild(a);

				closeModal();
			}
		} catch (err) {
			console.error('Print error:', err);
			error = err.message || $t('Popups.PrintReport.error_print_items');
		} finally {
			loading = false;
		}
	}

	// Watch for selectedPatient changes and load assignments
	$: if ($selectedPatient) {
		console.log('Selected patient changed, loading assignments for:', $selectedPatient);
		loadAssignments();
		loadAiReport();
	}

	// Reload assignments when regeneration from RedactionProfile finishes
	let prevRegenActive = false;
	$: {
		if (prevRegenActive && !$redactionRegenerating.active && $selectedPatient) {
			loadAssignments();
		}
		prevRegenActive = $redactionRegenerating.active;
	}
</script>

<!-- Top bar: patient name · AI credit · close -->
<div class="flex items-center gap-3">
	<h3 class="text-xl font-semibold leading-relaxed">
		{patientName || $t('Popups.PrintReport.patient_selection')}{patientPronouns ? ` (${patientPronouns})` : ''}
	</h3>
	{#if aiCostTotal > 0}
		<span
			class="inline-flex items-center rounded-full"
			style="background-color: #f9fafb; border: 1px solid #e5e7eb; padding: 5px 11px; gap: 7px;"
			title="Total AI spend for this patient (redaction profiles + AI reports)"
		>
			<span style="font-size: 11px; line-height: 14px; font-weight: 500; color: #6b7280;">AI credit used</span>
			<span style="font-size: 13px; line-height: 14px; font-weight: 700; color: #111111;">${aiCostTotal.toFixed(2)}</span>
		</span>
	{/if}
	<div class="flex-grow"></div>
	<button on:click={closeModal}><Cross /></button>
</div>

<div class="mt-4 flex flex-grow flex-col gap-3">
	{#if loading}
		<p class="text-gray-600">{$t('Popups.PrintReport.loading')}</p>
	{:else if error}
		<div class="rounded-md bg-red-50 p-4">
			<p class="text-sm font-medium text-red-800">{error}</p>
		</div>
	{:else if assignments.length === 0}
		<p class="text-gray-600">{$t('Popups.PrintReport.no_assignments')}</p>
	{:else if debugResults}
		<div class="max-h-[400px] overflow-auto rounded-lg bg-gray-100 p-4">
			<pre class="whitespace-pre-wrap text-xs">{JSON.stringify(debugResults, null, 2)}</pre>
		</div>
	{:else}
		<!-- Left-nav shell: fixed height so switching sections never resizes the modal; each pane scrolls. -->
		<div class="flex overflow-hidden rounded-xl border border-gray-200" style="height: 520px;">
			<!-- Nav -->
			<nav class="flex w-[212px] shrink-0 flex-col gap-1 border-r border-gray-100 bg-[#fafbfc] p-3">
				<button
					type="button"
					on:click={() => (navSection = 'standard')}
					class="relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition-colors {navSection ===
					'standard'
						? 'bg-Success/10'
						: 'hover:bg-gray-100'}"
				>
					{#if navSection === 'standard'}<span class="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r bg-Success"></span>{/if}
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={navSection === 'standard' ? '#00A886' : '#9ca3af'} stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
					<span class="flex flex-col">
						<span class="text-[13px] {navSection === 'standard' ? 'font-bold text-Success' : 'font-semibold text-gray-700'}">Standard reports</span>
						<span class="text-[11px] text-gray-400">{assignments.length} available · instant</span>
					</span>
				</button>
				<button
					type="button"
					on:click={() => (navSection = 'ai')}
					class="relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition-colors {navSection ===
					'ai'
						? 'bg-Success/10'
						: 'hover:bg-gray-100'}"
				>
					{#if navSection === 'ai'}<span class="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r bg-Success"></span>{/if}
					<svg width="16" height="16" viewBox="0 0 24 24" fill={navSection === 'ai' ? '#00A886' : '#9ca3af'}><path d="M12 2l1.6 6.4L20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6z" /></svg>
					<span class="flex flex-col">
						<span class="text-[13px] {navSection === 'ai' ? 'font-bold text-Success' : 'font-semibold text-gray-700'}">AI reports</span>
						<span class="text-[11px] text-gray-400">
							{#if profileStatus !== 'completed'}needs redaction{:else if aiReportState === 'disabled'}complete interviews{:else}{aiGenerated.length} ready · on-demand{/if}
						</span>
					</span>
				</button>
				<button
					type="button"
					on:click={() => (navSection = 'redaction')}
					class="relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition-colors {navSection ===
					'redaction'
						? 'bg-Success/10'
						: 'hover:bg-gray-100'}"
				>
					{#if navSection === 'redaction'}<span class="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r bg-Success"></span>{/if}
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={navSection === 'redaction' ? '#00A886' : '#9ca3af'} stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
					<span class="flex flex-col">
						<span class="text-[13px] {navSection === 'redaction' ? 'font-bold text-Success' : 'font-semibold text-gray-700'}">Redaction profile</span>
						<span class="flex items-center gap-1.5 text-[11px] text-gray-400">
							{#if profileStatus === 'completed'}<span class="h-1.5 w-1.5 rounded-full bg-Success"></span>Ready{:else if profileStatus === 'processing' || generatingAnonymization}Processing…{:else if !adultBioComplete}Needs Adult Bio{:else}Not created{/if}
						</span>
					</span>
				</button>
			</nav>

			<!-- Pane -->
			<div class="flex min-h-0 flex-1 flex-col">
				{#if navSection === 'standard'}
					<div class="flex min-h-0 flex-1 flex-col gap-3 p-4">
						<div class="flex items-baseline gap-2">
							<span class="text-xs font-bold uppercase tracking-wide text-gray-600">Standard reports</span>
							<span class="text-[11px] text-gray-400">per interview · instant · free</span>
						</div>
						<div class="flex min-h-0 w-full flex-1 justify-stretch">
							<MultiSelector
								form="print-report"
								options={assignments}
								bind:selected
								field1={$t('Popups.PrintReport.field_available')}
								field2={$t('Popups.PrintReport.field_selected')}
							>
								<div slot="field1-icon" class="relative">
									<button on:mouseenter={() => (showTooltip = true)} on:mouseleave={() => (showTooltip = false)} class="text-gray-500 transition-colors hover:text-gray-700">
										<Help size={16} />
									</button>
									<InfoTooltip visible={showTooltip} position="bottom" />
								</div>
							</MultiSelector>
						</div>
						<div class="flex items-center justify-between pt-1">
							<div class="flex items-center gap-5">
								<label class="flex items-center gap-2">
									<input type="checkbox" bind:checked={summaryReport} class="form-checkbox h-4 w-4 text-Success" />
									<span class="text-sm font-medium">{$t('Popups.PrintReport.summary_report')}</span>
								</label>
								<label class="flex items-center gap-2 {profileStatus !== 'completed' ? 'pointer-events-none opacity-40' : ''}">
									<input type="checkbox" bind:checked={redactPii} class="form-checkbox h-4 w-4 text-Success" disabled={profileStatus !== 'completed'} />
									<span class="text-sm font-medium">Redact PII</span>
								</label>
							</div>
							<div class="flex items-center gap-2.5">
								<Button onClick={() => handlePrintReport('pdf')} disabled={loading || generatingAnonymization || selected.length === 0} icon={true} iconOnSide="left">
									<span slot="icon"><PdfIcon /></span>{$t('Popups.PrintReport.download_pdf')}
								</Button>
								<Button onClick={() => handlePrintReport('docx')} disabled={loading || generatingAnonymization || selected.length === 0} icon={true} iconOnSide="left">
									<span slot="icon"><DocxIcon /></span>{$t('Popups.PrintReport.download_docx')}
								</Button>
							</div>
						</div>
					</div>
				{:else if navSection === 'ai'}
					{#if profileStatus !== 'completed'}
						<div class="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
							<svg width="22" height="22" viewBox="0 0 24 24" fill="#cbd5e1"><path d="M12 2l1.6 6.4L20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6z" /></svg>
							<span class="text-sm font-semibold text-gray-600">Create a redaction profile to enable AI reports</span>
							<button type="button" on:click={() => (navSection = 'redaction')} class="rounded-full border border-Success px-3 py-1 text-xs font-medium text-Success hover:bg-Success/5">Go to Redaction profile</button>
						</div>
					{:else if aiReportState === 'disabled'}
						<div class="flex flex-col gap-2.5 p-5">
							<span class="text-xs font-bold uppercase tracking-wide text-Success">AI reports</span>
							<p class="text-sm font-semibold text-gray-800">Complete 5 interviews to generate</p>
							{#if aiReadiness}
								<ul class="space-y-1.5">
									{#each aiReadiness.required as r}
										<li class="flex items-center gap-2 text-sm {r.done ? 'text-gray-400' : 'font-medium text-gray-800'}">
											{#if r.done}<span class="text-Success"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5" /></svg></span>{:else}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" stroke-width="2"><circle cx="12" cy="12" r="9" /></svg>{/if}
											{r.label}
										</li>
									{/each}
								</ul>
								<p class="text-xs text-gray-500">{aiReadiness.completedCount} of {aiReadiness.requiredCount} complete · {aiReadiness.requiredCount - aiReadiness.completedCount} still needed</p>
							{/if}
						</div>
					{:else}
						<!-- Head: Download | Manage toggle -->
						<div class="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 pb-3 pt-4">
							<div class="flex gap-1 rounded-lg bg-gray-100 p-1">
								<button type="button" on:click={() => setAiMode('download')} class="flex items-center gap-1.5 rounded-md px-4 py-1.5 text-xs font-semibold transition-colors {aiMode === 'download' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}">
									<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>Download
								</button>
								<button type="button" on:click={() => setAiMode('manage')} class="flex items-center gap-1.5 rounded-md px-4 py-1.5 text-xs font-semibold transition-colors {aiMode === 'manage' ? 'bg-Success text-white shadow-sm' : 'text-gray-500'}">
									<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>Manage
								</button>
							</div>
							{#if aiMode === 'manage'}
								<span class="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700"><span class="h-1.5 w-1.5 rounded-full bg-amber-500"></span>Building uses credits</span>
							{:else}
								<div class="flex items-center gap-1.5">
									<div class="flex rounded-md bg-gray-100 p-0.5">
										<button type="button" on:click={() => setAiLang('en')} class="rounded px-2 py-0.5 text-xs font-bold {aiLang === 'en' ? 'bg-Success text-white' : 'text-gray-500'}">EN</button>
										<button type="button" on:click={() => setAiLang('fr')} class="rounded px-2 py-0.5 text-xs font-bold {aiLang === 'fr' ? 'bg-Success text-white' : 'text-gray-500'}">FR</button>
									</div>
									<div class="flex rounded-md bg-gray-100 p-0.5">
										<button type="button" on:click={() => setAiType('pdf')} class="rounded px-2 py-0.5 text-xs font-bold {aiType === 'pdf' ? 'bg-Success text-white' : 'text-gray-500'}">PDF</button>
										<button type="button" on:click={() => setAiType('docx')} class="rounded px-2 py-0.5 text-xs font-bold {aiType === 'docx' ? 'bg-Success text-white' : 'text-gray-500'}">DOCX</button>
									</div>
								</div>
							{/if}
						</div>

						{#if aiMode === 'download'}
							<div class="min-h-0 flex-1 overflow-y-auto p-4">
								<div class="grid grid-cols-2 gap-2.5">
									{#each AI_REPORTS as r (r.key)}
										{@const vstatus = aiVariantStatus(r.key)}
										<div class="flex items-center gap-2.5 rounded-lg border border-gray-100 px-3 py-2.5">
											{#if vstatus === 'ready'}
												<button type="button" on:click={() => toggleAiSelect(r.key)} class="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md border-[1.5px] {aiSelected[r.key] ? 'border-Success bg-Success' : 'border-gray-300'}">
													{#if aiSelected[r.key]}<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg>{/if}
												</button>
											{:else}
												<span class="h-[18px] w-[18px] shrink-0 rounded-md border-[1.5px] border-gray-200 bg-gray-50"></span>
											{/if}
											<span class="flex min-w-0 flex-1 flex-col">
												<span class="truncate text-[13px] font-semibold text-gray-800">{r.name}</span>
												<span class="truncate text-[11px] text-gray-400">{r.sub}</span>
											</span>
											{#if vstatus === 'ready'}
												<span class="flex shrink-0 items-center gap-1"><span class="h-1.5 w-1.5 rounded-full bg-Success"></span><span class="text-[11px] font-semibold text-Success">Ready</span></span>
											{:else if vstatus === 'generating'}
												{@const startedAt = aiGenStartedAt[`${r.key}_${aiLang}`]}
												<span class="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-600"><svg class="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><circle cx="12" cy="12" r="9" stroke-opacity="0.3" /><path d="M21 12a9 9 0 0 0-9-9" stroke-linecap="round" /></svg>{#if startedAt}<span class="tabular-nums">{fmtElapsed(aiNow - startedAt)}</span>{:else}…{/if}</span>
											{:else if vstatus === 'failed'}
												<button type="button" on:click={() => requestGenerateInManage(r.key)} class="shrink-0 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-500">Retry</button>
											{:else}
												<button type="button" on:click={() => requestGenerateInManage(r.key)} class="inline-flex shrink-0 items-center gap-1 rounded-full border-[1.5px] border-Success px-3 py-1 text-[11px] font-semibold text-Success hover:bg-Success/5"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14" /></svg>Generate</button>
											{/if}
										</div>
									{/each}
								</div>
								{#if aiLang === 'en'}
									<!-- Standalone referral letter (new engine) — separate from the grid above -->
									<div class="mt-2.5 flex items-center gap-2.5 rounded-lg border border-gray-100 px-3 py-2.5">
										{#if letterDownloadable}
											<button type="button" on:click={() => (letterSelected = !letterSelected)} class="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md border-[1.5px] {letterSelected ? 'border-Success bg-Success' : 'border-gray-300'}">
												{#if letterSelected}<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg>{/if}
											</button>
										{:else}
											<span class="h-[18px] w-[18px] shrink-0 rounded-md border-[1.5px] border-gray-200 bg-gray-50"></span>
										{/if}
										<span class="flex min-w-0 flex-1 flex-col">
											<span class="truncate text-[13px] font-semibold text-gray-800">{LETTER.name}</span>
											<span class="truncate text-[11px] text-gray-400">{LETTER.sub}</span>
										</span>
										{#if letterState === 'ready'}
											<span class="flex shrink-0 items-center gap-1"><span class="h-1.5 w-1.5 rounded-full bg-Success"></span><span class="text-[11px] font-semibold text-Success">Ready</span></span>
										{:else if letterState === 'generating'}
											{@const startedAt = aiGenStartedAt[LETTER.vkey]}
											<span class="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-600"><svg class="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><circle cx="12" cy="12" r="9" stroke-opacity="0.3" /><path d="M21 12a9 9 0 0 0-9-9" stroke-linecap="round" /></svg>{#if startedAt}<span class="tabular-nums">{fmtElapsed(aiNow - startedAt)}</span>{:else}…{/if}</span>
										{:else if letterDisabled}
											<span class="shrink-0 text-[11px] font-semibold text-gray-400">Switched off</span>
										{:else if letterState === 'failed'}
											<button type="button" on:click={() => setAiMode('manage')} class="shrink-0 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-500">Retry</button>
										{:else}
											<button type="button" on:click={() => setAiMode('manage')} class="inline-flex shrink-0 items-center gap-1 rounded-full border-[1.5px] border-Success px-3 py-1 text-[11px] font-semibold text-Success hover:bg-Success/5"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14" /></svg>Generate</button>
										{/if}
									</div>
								{/if}
							</div>
							<div class="flex shrink-0 items-center justify-between border-t border-gray-100 px-4 py-3">
								<label class="flex items-center gap-2">
									<input type="checkbox" bind:checked={redactAiDownload} class="form-checkbox h-4 w-4 text-Success" />
									<span class="text-xs font-medium text-gray-600">Redact PII in downloaded report</span>
								</label>
								<div class="flex items-center gap-3">
									<span class="text-[11px] text-gray-400">No credits used</span>
									{#if aiBusy && aiAction === 'download'}
										<button type="button" disabled class="inline-flex items-center justify-center gap-2 rounded-lg bg-Success px-4 py-2.5 text-[13px] font-semibold text-white opacity-60"><svg class="animate-spin" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="12" cy="12" r="9" stroke-opacity="0.3" /><path d="M21 12a9 9 0 0 0-9-9" stroke-linecap="round" /></svg>Downloading…</button>
									{:else}
										<button type="button" on:click={downloadSelectedAiReports} disabled={aiDownloadSet.length === 0} class="inline-flex items-center justify-center gap-2 rounded-lg bg-Success px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-Success_hover disabled:opacity-50"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>Download{aiDownloadSet.length ? ` ${aiDownloadSet.length} reports` : ''}</button>
									{/if}
								</div>
							</div>
						{:else}
							<!-- MANAGE: grouped by build status; each row shows its FROM dependencies -->
							<div class="min-h-0 flex-1 overflow-y-auto px-4 pt-3">
								<div class="flex items-baseline gap-2 pb-1">
									<span class="text-[11px] font-bold uppercase tracking-wide text-gray-600">Reports &amp; dependencies</span>
									<span class="text-[11px] text-gray-400">grouped by build status</span>
								</div>
								{#if mvGenerated.length}
									<span class="mt-2 block text-[10.5px] font-bold uppercase tracking-[0.08em] text-Success">Generated · ready to download or regenerate</span>
									{#each mvGenerated as v (v.vkey)}
										{@const names = mvParentNames(v)}
										{@const astatus = aiVarStatus[v.vkey]}
										{@const vstatus = aiVariants[v.vkey] ?? 'absent'}
										{@const st = aiGenStartedAt[v.vkey]}
										<div class="mb-1.5 mt-1.5 flex items-center gap-3 rounded-xl border border-gray-200 px-3.5 py-2.5">
											<span class="h-2.5 w-2.5 shrink-0 rounded-full bg-Success"></span>
											<div class="flex shrink-0 flex-col gap-1">
												<div class="flex items-center gap-2">
													<span class="text-[15px] font-semibold text-gray-900">{v.name}</span>
													<span class="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">{v.lang}</span>
													{#if names.length === 0}<span class="rounded bg-Success/10 px-1.5 py-0.5 text-[9.5px] font-bold tracking-wide text-Success">SOURCE</span>{/if}
												</div>
												{#if names.length}
													<div class="flex items-center gap-1.5">
														<span class="text-[9.5px] font-bold tracking-wide text-gray-300">FROM</span>
														{#each names as n}<span class="rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] text-gray-600">{n}</span>{/each}
													</div>
												{/if}
											</div>
											<div class="flex-1"></div>
											{#if astatus === 'requesting' && vstatus !== 'generating'}
												<span class="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-600"><svg class="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><circle cx="12" cy="12" r="9" stroke-opacity="0.3" /><path d="M21 12a9 9 0 0 0-9-9" stroke-linecap="round" /></svg>Sending request…</span>
											{:else if vstatus === 'generating' || astatus === 'processing'}
												<span class="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-600"><svg class="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><circle cx="12" cy="12" r="9" stroke-opacity="0.3" /><path d="M21 12a9 9 0 0 0-9-9" stroke-linecap="round" /></svg>Regenerating…{#if st}<span class="tabular-nums">{fmtElapsed(aiNow - st)}</span>{/if}</span>
											{:else}
												<span class="text-[12.5px] font-medium text-Success">Ready</span>
												<button type="button" on:click={() => askRegen(v.format, v.language)} disabled={aiBusy} class="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-[13px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" /></svg>Regenerate</button>
											{/if}
										</div>
									{/each}
								{/if}
								{#if mvNotGenerated.length}
									<span class="mt-3 block text-[10.5px] font-bold uppercase tracking-[0.08em] text-gray-400">Not generated · build on demand</span>
									{#each mvNotGenerated as v (v.vkey)}
										{@const names = mvParentNames(v)}
										{@const astatus = aiVarStatus[v.vkey]}
										{@const vstatus = aiVariants[v.vkey] ?? 'absent'}
										{@const st = aiGenStartedAt[v.vkey]}
										{@const buildable = mvCanGenerate(v)}
										<div class="mb-1.5 mt-1.5 flex items-center gap-3 rounded-xl border border-gray-200 px-3.5 py-2.5">
											<span class="h-2.5 w-2.5 shrink-0 rounded-full {astatus === 'requesting' ? 'bg-blue-400' : vstatus === 'generating' || astatus === 'processing' ? 'bg-amber-500' : vstatus === 'failed' || astatus === 'error' ? 'bg-red-400' : 'border-[1.5px] border-gray-300'}"></span>
											<div class="flex shrink-0 flex-col gap-1">
												<div class="flex items-center gap-2">
													<span class="text-[15px] font-semibold text-gray-900">{v.name}</span>
													<span class="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">{v.lang}</span>
												</div>
												{#if names.length}
													<div class="flex items-center gap-1.5">
														<span class="text-[9.5px] font-bold tracking-wide text-gray-300">FROM</span>
														{#each names as n}<span class="rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] text-gray-600">{n}</span>{/each}
													</div>
												{/if}
											</div>
											<div class="flex-1"></div>
											{#if astatus === 'requesting' && vstatus !== 'generating'}
												<span class="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-600"><svg class="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><circle cx="12" cy="12" r="9" stroke-opacity="0.3" /><path d="M21 12a9 9 0 0 0-9-9" stroke-linecap="round" /></svg>Sending request…</span>
											{:else if vstatus === 'generating' || astatus === 'processing'}
												<span class="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-600"><svg class="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><circle cx="12" cy="12" r="9" stroke-opacity="0.3" /><path d="M21 12a9 9 0 0 0-9-9" stroke-linecap="round" /></svg>Generating…{#if st}<span class="tabular-nums">{fmtElapsed(aiNow - st)}</span>{/if}</span>
											{:else if astatus === 'error'}
												<button type="button" on:click={() => runVariantAction(v.format, v.language, false)} disabled={aiBusy || !buildable} class="shrink-0 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-[12px] font-semibold text-red-500 disabled:opacity-50">Retry</button>
											{:else}
												<span class="text-[12.5px] text-gray-400">{buildable ? 'Not generated' : `Needs ${names[0] ?? 'source'}`}</span>
												<button type="button" on:click={() => runVariantAction(v.format, v.language, false)} disabled={!buildable || aiBusy} class="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-Success px-3 py-2 text-[13px] font-semibold text-white hover:bg-Success_hover disabled:bg-gray-200 disabled:text-gray-400"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14" /></svg>Generate</button>
											{/if}
										</div>
									{/each}
								{/if}
								<!-- Standalone referral letter (new engine): not built from other reports -->
								<span class="mt-3 block text-[10.5px] font-bold uppercase tracking-[0.08em] text-gray-400">Standalone · written from the interview case</span>
								<div class="mb-3 mt-1.5 flex flex-col gap-2 rounded-xl border border-gray-200 px-3.5 py-2.5">
									<div class="flex items-center gap-3">
										<span class="h-2.5 w-2.5 shrink-0 rounded-full {letterRequesting ? 'bg-blue-400' : letterState === 'ready' ? 'bg-Success' : letterState === 'generating' ? 'bg-amber-500' : letterState === 'failed' ? 'bg-red-400' : 'border-[1.5px] border-gray-300'}"></span>
										<div class="flex shrink-0 flex-col gap-1">
											<div class="flex items-center gap-2">
												<span class="text-[15px] font-semibold text-gray-900">{LETTER.name}</span>
												<span class="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">EN</span>
											</div>
											<div class="flex items-center gap-1.5">
												<span class="text-[9.5px] font-bold tracking-wide text-gray-300">FROM</span>
												<span class="rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] text-gray-600">Interview case</span>
											</div>
										</div>
										<div class="flex-1"></div>
										{#if letterRequesting}
											<span class="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-600"><svg class="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><circle cx="12" cy="12" r="9" stroke-opacity="0.3" /><path d="M21 12a9 9 0 0 0-9-9" stroke-linecap="round" /></svg>Sending request…</span>
										{:else if letterState === 'generating'}
											{@const st = aiGenStartedAt[LETTER.vkey]}
											<span class="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-600"><svg class="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><circle cx="12" cy="12" r="9" stroke-opacity="0.3" /><path d="M21 12a9 9 0 0 0-9-9" stroke-linecap="round" /></svg>Generating…{#if st}<span class="tabular-nums">{fmtElapsed(aiNow - st)}</span>{/if}</span>
										{:else if letterDisabled}
											<span class="text-[12.5px] font-medium text-gray-400">Switched off on the report agent</span>
										{:else if letterState === 'ready'}
											<span class="text-[12.5px] font-medium text-Success">Ready</span>
											<button type="button" on:click={() => (letterConfirm = true)} disabled={aiBusy} class="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-[13px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" /></svg>Regenerate</button>
										{:else if letterState === 'failed'}
											<span class="text-[12.5px] font-medium text-red-500">Failed</span>
											<button type="button" on:click={() => generateLetter(false)} disabled={aiBusy} class="shrink-0 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-[12px] font-semibold text-red-500 disabled:opacity-50">Retry</button>
										{:else}
											<span class="text-[12.5px] text-gray-400">Not generated</span>
											<button type="button" on:click={() => generateLetter(false)} disabled={aiBusy} class="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-Success px-3 py-2 text-[13px] font-semibold text-white hover:bg-Success_hover disabled:bg-gray-200 disabled:text-gray-400"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14" /></svg>Generate</button>
										{/if}
									</div>
									{#if letterState === 'failed' && letter.error}
										<span class="text-[11.5px] text-red-500">Last attempt failed ({letter.error}).</span>
									{/if}
									{#if letter.staleness?.stale && letterState !== 'generating'}
										<span class="text-[11.5px] text-gray-500">New interviews since the case this letter uses: {letter.staleness.newInterviews.map((i) => i.label).join(', ')}. Regenerate the Comprehensive report first to include them.</span>
									{/if}
								</div>
							</div>
							<div class="flex shrink-0 flex-col gap-1.5 border-t border-gray-100 px-4 py-3">
								<div class="flex items-center gap-2">
									<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#B6801F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
									<span class="text-[12px] text-[#57606A]">Regenerating a report invalidates every report downstream of it — you'll see the list before confirming.</span>
								</div>
								<span class="pl-6 text-[11.5px] text-gray-400">Building never downloads — switch to Download to save the files.</span>
							</div>
						{/if}
					{/if}
				{:else}
					<!-- Redaction profile -->
					<div class="min-h-0 flex-1 overflow-y-auto p-4">
						<div class="flex items-baseline gap-2 pb-3">
							<span class="text-xs font-bold uppercase tracking-wide text-gray-600">Redaction profile</span>
							<span class="text-[11px] text-gray-400">shared · redacts PHI before it leaves PsyMatch</span>
						</div>
						{#if !adultBioComplete}
							<div class="flex flex-col items-center gap-2 rounded-xl border border-gray-200 p-6 text-center">
								<span class="text-sm font-semibold text-gray-600">Needs the Adult Biographical interview</span>
								<span class="text-[11px] text-gray-400">A redaction profile is generated from Adult Bio.</span>
							</div>
						{:else if $redactionRegenerating.active || generatingAnonymization}
							<div class="rounded-xl border border-gray-200 p-4">
								<div class="relative h-9 w-full overflow-hidden rounded-full bg-gray-200">
									<div class="absolute inset-0 origin-left rounded-full bg-Success" style="transform: scaleX({($redactionRegenerating.active ? $redactionRegenerating.percent : progressPercent) / 100}); transition: transform 4s ease-in-out"></div>
									<span class="absolute inset-0 flex items-center justify-center text-xs font-medium text-gray-700">{$redactionRegenerating.active ? $redactionRegenerating.step : currentStep}</span>
								</div>
							</div>
						{:else if profileStatus === 'completed'}
							<div class="flex items-center gap-3.5 rounded-xl border border-[#D6EFE7] bg-[#F4FBF8] px-4 py-3.5">
								<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-Success"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" /></svg></div>
								<div class="flex flex-1 flex-col gap-0.5">
									<div class="flex items-center gap-2"><span class="text-base font-bold text-gray-900">Ready</span>{#if redactionProfile?.version}<span class="rounded bg-[#DBF3EA] px-2 py-0.5 text-xs font-medium text-[#0A7A63]">Version {redactionProfile.version}</span>{/if}</div>
									<span class="text-[13px] text-gray-500">{#if redactionProfile}{redactionProfile.ruleCount + redactionProfile.fieldCount} values redacted · built from the Adult Bio interview{:else}Loading profile…{/if}</span>
								</div>
								<div class="flex shrink-0 items-center gap-2">
									<button type="button" on:click={() => ($showRedactionProfile = true)} class="inline-flex items-center gap-1.5 rounded-lg border border-[#C7E7DE] bg-white px-3.5 py-2 text-[13px] font-semibold text-[#0A7A63]"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>View</button>
									<button type="button" on:click={() => ($showRedactionProfile = true)} class="rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-[13px] font-semibold text-gray-700">Edit</button>
								</div>
							</div>
							<span class="mt-4 block text-[10.5px] font-bold uppercase tracking-[0.07em] text-gray-400">Applied in 3 places</span>
							<div class="mt-2 flex gap-2.5">
								<div class="flex-1 rounded-lg border border-gray-200 bg-white px-3.5 py-3"><span class="block text-[13px] font-semibold text-gray-800">Standard download</span><span class="mt-1 flex items-center gap-1.5 text-[11px] text-gray-500"><span class="h-1.5 w-1.5 rounded-full bg-gray-400"></span>Optional toggle</span></div>
								<div class="flex-1 rounded-lg border border-[#C7E7DE] bg-[#F5FCF9] px-3.5 py-3"><span class="block text-[13px] font-semibold text-gray-800">AI generation</span><span class="mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-[#0A7A63]"><span class="h-1.5 w-1.5 rounded-full bg-Success"></span>Always on</span></div>
								<div class="flex-1 rounded-lg border border-gray-200 bg-white px-3.5 py-3"><span class="block text-[13px] font-semibold text-gray-800">AI download</span><span class="mt-1 flex items-center gap-1.5 text-[11px] text-gray-500"><span class="h-1.5 w-1.5 rounded-full bg-gray-400"></span>Optional toggle</span></div>
							</div>
							{#if redactionProfile && redactionProfile.mappings.length}
								<span class="mt-4 block text-[10.5px] font-bold uppercase tracking-[0.07em] text-gray-400">What it redacts · {redactionProfile.ruleCount + redactionProfile.fieldCount} items</span>
								<div class="mt-2 overflow-hidden rounded-xl border border-gray-200">
									{#each redactionProfile.mappings as m, i}
										<div class="flex items-center gap-3 px-4 py-2.5 {i < redactionProfile.mappings.length - 1 ? 'border-b border-gray-100' : ''}">
											<span class="truncate font-mono text-[12px] text-gray-500">{m.from}</span>
											<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" class="shrink-0"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
											<span class="truncate font-mono text-[12px] text-gray-800">{m.to}</span>
										</div>
									{/each}
								</div>
							{/if}
							<div class="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
								<span class="text-[12px] text-gray-400">Edit rewrites values · Regenerate rebuilds from the latest interviews.</span>
								<button type="button" on:click={handleGenerateAnonymization} disabled={generatingAnonymization} class="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-[13px] font-semibold text-gray-700 disabled:opacity-50"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" /></svg>Regenerate profile</button>
							</div>
						{:else}
							<div class="flex flex-col items-center gap-3 rounded-xl border border-gray-200 p-6 text-center">
								<span class="text-sm font-semibold text-gray-600">No redaction profile yet</span>
								<button type="button" on:click={handleGenerateAnonymization} disabled={generatingAnonymization} class="inline-flex items-center gap-1.5 rounded-full bg-Success px-4 py-2 text-sm font-medium text-white hover:bg-Success/90 disabled:opacity-60">Create Redaction Profile</button>
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>

		{#if aiError}<p class="text-right text-xs text-red-600">{aiError}</p>{/if}

		<!-- Invalidation confirm popup (fires on Regenerate in Manage) -->
		{#if pendingRegen}
			<div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-6">
				<div class="w-[468px] overflow-hidden rounded-2xl bg-white shadow-2xl">
					<div class="flex items-start gap-3 p-6 pb-0">
						<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-amber-50"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#B6801F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" /></svg></div>
						<div class="flex flex-col gap-1">
							<span class="text-lg font-bold text-gray-900">Regenerate {pendingRegenName}?</span>
							<span class="text-[13px] leading-5 text-[#57606A]">Every generated report built from it goes out of date and is rebuilt in the same run.</span>
						</div>
					</div>
					{#if invalidatedNames.length}
						<div class="flex flex-col gap-2 p-6 pb-0 pt-5">
							<span class="text-[10.5px] font-bold uppercase tracking-[0.07em] text-[#B6801F]">Will be invalidated &amp; rebuilt · {invalidatedNames.length}</span>
							<div class="flex flex-col gap-0.5 rounded-xl border border-[#F0E4C8] bg-[#FFFDF7] p-1.5">
								{#each invalidatedNames as name}
									<div class="flex items-center gap-2.5 px-2.5 py-2"><span class="h-2 w-2 rounded-full bg-[#D99A2B]"></span><span class="flex-1 text-[14px] font-semibold text-gray-800">{name}</span><span class="text-[11.5px] font-semibold text-[#B6801F]">Ready → will rebuild</span></div>
								{/each}
							</div>
						</div>
					{/if}
					<div class="px-6 pt-3">
						<span class="text-[12px] text-gray-400">{invalidatedNames.length === 0 ? 'Nothing generated downstream — only this report rebuilds.' : 'Not-yet-generated reports are unaffected.'} Uses credits.</span>
					</div>
					<div class="mt-4 flex items-center justify-end gap-2.5 border-t border-[#EFF1F3] px-6 py-4">
						<button type="button" on:click={cancelRegen} class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-[13px] font-semibold text-gray-700">Cancel</button>
						<button type="button" on:click={confirmRegen} class="inline-flex items-center gap-1.5 rounded-lg bg-Success px-4 py-2 text-[13px] font-semibold text-white hover:bg-Success_hover"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" /></svg>Regenerate {invalidatedNames.length + 1} report{invalidatedNames.length ? 's' : ''}</button>
					</div>
				</div>
			</div>
		{/if}
		<!-- Regenerate confirm for the standalone referral letter (replaces only the letter) -->
		{#if letterConfirm}
			<div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-6">
				<div class="w-[468px] overflow-hidden rounded-2xl bg-white shadow-2xl">
					<div class="flex items-start gap-3 p-6 pb-0">
						<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-amber-50"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#B6801F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" /></svg></div>
						<div class="flex flex-col gap-1">
							<span class="text-lg font-bold text-gray-900">Regenerate {LETTER.name}?</span>
							<span class="text-[13px] leading-5 text-[#57606A]">A new letter replaces the current one. No other report is affected.</span>
						</div>
					</div>
					<div class="px-6 pt-3">
						<span class="text-[12px] text-gray-400">Uses credits.</span>
					</div>
					<div class="mt-4 flex items-center justify-end gap-2.5 border-t border-[#EFF1F3] px-6 py-4">
						<button type="button" on:click={() => (letterConfirm = false)} class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-[13px] font-semibold text-gray-700">Cancel</button>
						<button type="button" on:click={confirmLetterRegen} class="inline-flex items-center gap-1.5 rounded-lg bg-Success px-4 py-2 text-[13px] font-semibold text-white hover:bg-Success_hover"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" /></svg>Regenerate letter</button>
					</div>
				</div>
			</div>
		{/if}
	{/if}
</div>
