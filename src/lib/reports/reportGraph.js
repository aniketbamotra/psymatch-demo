// Single source of truth for the AI-report family: which reports exist, which
// report each one is BUILT FROM (its parent(s)), and the section STRUCTURE each
// format renders. Everything about "what derives from what" lives here so the
// flow (ensure / download / readiness) and the renderers (PDFKit + docx) agree.
//
// Pure data + pure functions — NO framework imports ($env/$app/$lib) — so it is
// node-testable and importable from both API routes and the render utils.
//
// ─── Why a graph, not a tree ────────────────────────────────────────────────
// Today the derivation is a linear chain (each variant has exactly one parent),
// but a report can in principle be built from MORE THAN ONE parent (e.g. a future
// "care plan" built from Comprehensive + an Intake source). A tree can't place a
// node under two parents; an adjacency list (each node names its parents) can.
// So `parents` is always an array, and every traversal here handles multi-parent.
// This mirrors the Manage-popup design (grouped by build status, each row shows
// the source(s) it is built from).

/** The report formats we produce. */
export const FORMATS = ['comprehensive', 'concise', 'referral', 'patient_summary'];

/** Languages. English is authored first; French is a translation of its EN sibling. */
export const LANGUAGES = ['en', 'fr'];

/** `${format}_${language}` — the canonical variant key used across Mongo + the flow. */
export function variantKey(format, language) {
	return `${format}_${language}`;
}

/** Split a variant key back into { format, language }. */
export function parseKey(key) {
	const i = String(key).lastIndexOf('_');
	return { format: String(key).slice(0, i), language: String(key).slice(i + 1) };
}

// ─── The graph ──────────────────────────────────────────────────────────────
// One entry per variant. `parents` = the variant keys this one is derived from
// (empty ⇒ a SOURCE / root, built from case data). `kind` = how it is produced,
// mirroring the agent's variantKind (root | translate | condense | letter |
// summarize). `label` is the human name shown in the UI.

const FORMAT_LABEL = {
	comprehensive: 'Comprehensive',
	concise: 'Concise',
	referral: 'Referral letter',
	patient_summary: 'Patient Summary'
};

/**
 * Build the full variant graph. Derived once (below) and frozen; exposed via the
 * query functions rather than mutated.
 * @returns {Record<string, {key:string, format:string, language:string, parents:string[], kind:string, label:string}>}
 */
function buildGraph() {
	/** @type {Record<string, any>} */
	const g = {};
	const add = (format, language, parents, kind) => {
		const key = variantKey(format, language);
		g[key] = {
			key,
			format,
			language,
			parents,
			kind,
			label: `${FORMAT_LABEL[format]}${language === 'fr' ? ' (FR)' : ''}`
		};
	};

	// Root: the single expensive synthesis from case data.
	add('comprehensive', 'en', [], 'root');

	// English derivations of the root.
	add('concise', 'en', ['comprehensive_en'], 'condense');
	add('referral', 'en', ['comprehensive_en'], 'letter');
	add('patient_summary', 'en', ['comprehensive_en'], 'summarize');

	// French = a translation of the same-format English variant.
	// Comprehensive FR translates the root; the others translate their EN sibling.
	add('comprehensive', 'fr', ['comprehensive_en'], 'translate');
	add('concise', 'fr', ['concise_en'], 'translate');
	add('referral', 'fr', ['referral_en'], 'translate');
	add('patient_summary', 'fr', ['patient_summary_en'], 'translate');

	return g;
}

export const GRAPH = Object.freeze(buildGraph());

/** Every variant, in a stable order (roots first, then by format/language). */
export function allVariants() {
	return Object.values(GRAPH);
}

/** The root variants (no parents — built from case data). */
export function roots() {
	return allVariants().filter((v) => v.parents.length === 0);
}

/** Look a variant up by (format, language) or by key. Throws on unknown. */
export function getVariant(formatOrKey, language) {
	const key = language === undefined ? formatOrKey : variantKey(formatOrKey, language);
	const v = GRAPH[key];
	if (!v) throw new Error(`Unknown report variant: ${key}`);
	return v;
}

/** True when the variant exists in the graph. */
export function isKnownVariant(formatOrKey, language) {
	const key = language === undefined ? formatOrKey : variantKey(formatOrKey, language);
	return Boolean(GRAPH[key]);
}

/** Direct parent keys of a variant. */
export function parentsOf(formatOrKey, language) {
	return getVariant(formatOrKey, language).parents.slice();
}

/** Direct children — the variants that name this one as a parent. */
export function childrenOf(formatOrKey, language) {
	const key = getVariant(formatOrKey, language).key;
	return allVariants()
		.filter((v) => v.parents.includes(key))
		.map((v) => v.key);
}

/**
 * All ancestors (transitive parents), de-duplicated. Order is parents-before-
 * children (a topological order upward), so the last element is closest to the
 * target. Handles multi-parent (a node reachable via two paths appears once).
 */
export function ancestorsOf(formatOrKey, language) {
	const start = getVariant(formatOrKey, language).key;
	const seen = new Set();
	const order = [];
	const visit = (key) => {
		for (const p of GRAPH[key].parents) {
			if (!seen.has(p)) {
				seen.add(p);
				visit(p);
				order.push(p); // push AFTER recursing ⇒ deepest ancestor first
			}
		}
	};
	visit(start);
	return order;
}

/**
 * Ordered ancestors → target: the exact build order to produce (format,language),
 * parents first, target last. This is what the lazy `ensure` flow walks, one step
 * per call. Replaces the hand-rolled chain() that used to live in the ensure route.
 */
export function chainTo(formatOrKey, language) {
	const target = getVariant(formatOrKey, language).key;
	return [...ancestorsOf(target), target].map((k) => GRAPH[k]);
}

/**
 * Downstream closure: every variant that (transitively) derives from this one.
 * This is the CASCADE set — regenerating `key` invalidates all of these. The
 * result excludes the node itself.
 */
export function descendantsOf(formatOrKey, language) {
	const start = getVariant(formatOrKey, language).key;
	const out = new Set();
	const stack = [start];
	while (stack.length) {
		const cur = stack.pop();
		for (const child of childrenOf(cur)) {
			if (!out.has(child)) {
				out.add(child);
				stack.push(child);
			}
		}
	}
	return [...out];
}

/**
 * Which of a node's descendants are actually generated right now — i.e. the
 * reports that would really be INVALIDATED (and must be rebuilt) if you regenerate
 * it. `isReady(key)` decides whether a given variant currently exists. Not-yet-
 * generated descendants are unaffected (nothing to invalidate), which is exactly
 * why the Manage popup groups by build status.
 */
export function invalidatedBy(formatOrKey, language, isReady) {
	return descendantsOf(formatOrKey, language).filter((k) => isReady(k));
}

/**
 * Can this variant be built right now? True when every parent is present in the
 * ready set. Roots are always derivable (they come from case data, not a parent).
 * @param {(key:string)=>boolean} isReady
 */
export function isDerivable(formatOrKey, language, isReady) {
	return getVariant(formatOrKey, language).parents.every((p) => isReady(p));
}

// ─── Structure manifest ─────────────────────────────────────────────────────
// The ordered sections each FORMAT renders. This is the canonical "report
// structure" both renderers (aiReportPdf.js / aiReportDocx.js) realize from the
// same `data` object (see buildReportData.js SHARED CONTRACT). Keeping it here
// lets tests assert that a data object carries the right sections and that PDF +
// DOCX stay in lockstep. `key` matches the field on the render `data` object.

/** @typedef {{key:string, title:string, type:'pairs'|'list'|'paras'|'snapshot'|'risk'|'diagnostic'|'phases'|'text'|'closing'|'letterhead'}} SectionSpec */

const COMPREHENSIVE_SECTIONS = [
	{ key: 'identification', title: 'Patient Identification', type: 'pairs' },
	{ key: 'interviews', title: 'Structured Interviews Administered', type: 'list' },
	{ key: 'snapshot', title: 'Clinical Snapshot', type: 'snapshot' },
	{ key: 'clinicalSummary', title: 'Clinical Summary', type: 'paras' },
	{ key: 'history', title: 'Autobiographical & Psychosocial History', type: 'paras' },
	{ key: 'risk', title: 'Risk Assessment', type: 'risk' },
	{ key: 'diagnostic', title: 'Diagnostic Considerations', type: 'diagnostic' },
	{ key: 'caseConceptualization', title: 'Case Conceptualization', type: 'paras' },
	{ key: 'treatment', title: 'Treatment Rationale', type: 'phases' },
	{ key: 'medication', title: 'Medication Considerations', type: 'text' },
	{ key: 'prognosis', title: 'Prognosis', type: 'text' }
];

const REFERRAL_SECTIONS = [
	{ key: 'opening', title: 'Opening', type: 'paras' },
	{ key: 'snapshot', title: 'Clinical Snapshot', type: 'snapshot' },
	{ key: 'riskNote', title: 'Risk Note', type: 'paras' },
	{ key: 'psychosocial', title: 'Psychosocial History', type: 'paras' },
	{ key: 'primary', title: 'Primary Diagnosis', type: 'diagnostic' },
	{ key: 'comorbid', title: 'Comorbid Considerations', type: 'diagnostic' },
	{ key: 'subthreshold', title: 'Subthreshold Features', type: 'paras' },
	{ key: 'conceptualization', title: 'Case Conceptualization', type: 'paras' },
	{ key: 'treatment', title: 'Treatment Recommendations', type: 'paras' },
	{ key: 'closing', title: 'Closing', type: 'closing' }
];

// Patient summary is a dynamic 6-section warm document (titles authored by the
// agent). We record the count + the italic-final rule rather than fixed titles.
const PATIENT_SUMMARY_STRUCTURE = {
	dynamic: true,
	sectionCount: 6,
	italicSectionId: 6
};

/** @type {Record<string, {kind:string, sections?:SectionSpec[], structure?:object}>} */
export const STRUCTURE = Object.freeze({
	comprehensive: { kind: 'clinical-report', sections: COMPREHENSIVE_SECTIONS },
	concise: { kind: 'clinical-report', sections: COMPREHENSIVE_SECTIONS },
	referral: { kind: 'business-letter', sections: REFERRAL_SECTIONS },
	patient_summary: { kind: 'warm-summary', structure: PATIENT_SUMMARY_STRUCTURE }
});

/** The section manifest for a format (defaults to comprehensive). */
export function structureFor(format) {
	return STRUCTURE[format] || STRUCTURE.comprehensive;
}

// ─── Cross-check / validation ───────────────────────────────────────────────

/**
 * Validate the whole graph + structure. Returns { ok, errors }. Run in a test (and
 * safe to call at boot) to catch a mis-wired parent, a dangling reference, a cycle,
 * or a format with no structure BEFORE it reaches a patient.
 */
export function validateGraph() {
	const errors = [];
	const keys = new Set(Object.keys(GRAPH));

	for (const v of allVariants()) {
		// Format + language must be recognised.
		if (!FORMATS.includes(v.format)) errors.push(`${v.key}: unknown format "${v.format}"`);
		if (!LANGUAGES.includes(v.language)) errors.push(`${v.key}: unknown language "${v.language}"`);
		// Every parent reference must resolve to a real variant, and not be self.
		for (const p of v.parents) {
			if (!keys.has(p)) errors.push(`${v.key}: parent "${p}" does not exist`);
			if (p === v.key) errors.push(`${v.key}: is its own parent`);
		}
		// Non-roots must have a way to be produced; roots must have a kind.
		if (v.parents.length === 0 && v.kind !== 'root')
			errors.push(`${v.key}: has no parents but kind is "${v.kind}" (expected "root")`);
		if (v.parents.length > 0 && v.kind === 'root')
			errors.push(`${v.key}: has parents but is marked "root"`);
	}

	// Exactly one root today (comprehensive_en); flag if that assumption breaks so
	// it's a conscious change, not an accident.
	const rootKeys = roots().map((r) => r.key);
	if (!rootKeys.includes('comprehensive_en'))
		errors.push('comprehensive_en must be a root (built from case data)');

	// No cycles: every variant's ancestor walk must terminate without revisiting.
	for (const v of allVariants()) {
		try {
			const anc = ancestorsOf(v.key);
			if (anc.includes(v.key)) errors.push(`${v.key}: cycle detected (is its own ancestor)`);
		} catch (e) {
			errors.push(`${v.key}: cycle/traversal error — ${e.message}`);
		}
	}

	// Every format must declare a render structure.
	for (const f of FORMATS) {
		const st = STRUCTURE[f];
		if (!st) errors.push(`format "${f}" has no STRUCTURE entry`);
		else if (!st.sections && !st.structure)
			errors.push(`format "${f}" STRUCTURE has neither sections nor structure`);
	}

	return { ok: errors.length === 0, errors };
}
