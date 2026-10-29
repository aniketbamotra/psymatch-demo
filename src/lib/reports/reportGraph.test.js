import { describe, it, expect } from 'vitest';
import {
	FORMATS,
	LANGUAGES,
	GRAPH,
	allVariants,
	roots,
	variantKey,
	parseKey,
	parentsOf,
	childrenOf,
	ancestorsOf,
	chainTo,
	descendantsOf,
	invalidatedBy,
	isDerivable,
	structureFor,
	validateGraph
} from './reportGraph.js';

describe('reportGraph — cross-check', () => {
	it('validateGraph passes (no mis-wired parents, dangling refs, or cycles)', () => {
		const { ok, errors } = validateGraph();
		expect(errors).toEqual([]);
		expect(ok).toBe(true);
	});

	it('has exactly the 8 expected variants (4 formats × 2 languages)', () => {
		expect(allVariants()).toHaveLength(FORMATS.length * LANGUAGES.length);
		for (const f of FORMATS) for (const l of LANGUAGES) expect(GRAPH[variantKey(f, l)]).toBeTruthy();
	});

	it('comprehensive_en is the single root (built from case data)', () => {
		expect(roots().map((r) => r.key)).toEqual(['comprehensive_en']);
	});

	it('parseKey round-trips a two-word format', () => {
		expect(parseKey('patient_summary_fr')).toEqual({ format: 'patient_summary', language: 'fr' });
		expect(variantKey('patient_summary', 'fr')).toBe('patient_summary_fr');
	});
});

describe('reportGraph — parents / who derives from whom', () => {
	it('every EN derived report is built from comprehensive_en', () => {
		expect(parentsOf('concise', 'en')).toEqual(['comprehensive_en']);
		expect(parentsOf('referral', 'en')).toEqual(['comprehensive_en']);
		expect(parentsOf('patient_summary', 'en')).toEqual(['comprehensive_en']);
	});

	it('each FR report is built from its EN sibling (comprehensive_fr from the root)', () => {
		expect(parentsOf('comprehensive', 'fr')).toEqual(['comprehensive_en']);
		expect(parentsOf('concise', 'fr')).toEqual(['concise_en']);
		expect(parentsOf('referral', 'fr')).toEqual(['referral_en']);
		expect(parentsOf('patient_summary', 'fr')).toEqual(['patient_summary_en']);
	});

	it('comprehensive_en directly feeds its 3 EN derivatives + comprehensive_fr', () => {
		expect(childrenOf('comprehensive', 'en').sort()).toEqual(
			['comprehensive_fr', 'concise_en', 'patient_summary_en', 'referral_en'].sort()
		);
	});
});

describe('reportGraph — build chain (lazy ensure order)', () => {
	it('comprehensive_en resolves to just itself', () => {
		expect(chainTo('comprehensive', 'en').map((n) => n.key)).toEqual(['comprehensive_en']);
	});

	it('a derived EN report resolves parent-first', () => {
		expect(chainTo('referral', 'en').map((n) => n.key)).toEqual(['comprehensive_en', 'referral_en']);
	});

	it('a French leaf resolves the full 3-step chain in order', () => {
		expect(chainTo('concise', 'fr').map((n) => n.key)).toEqual([
			'comprehensive_en',
			'concise_en',
			'concise_fr'
		]);
	});

	it('ancestorsOf is deepest-first and excludes the node', () => {
		expect(ancestorsOf('patient_summary', 'fr')).toEqual(['comprehensive_en', 'patient_summary_en']);
	});
});

describe('reportGraph — cascade / invalidation', () => {
	it('regenerating comprehensive_en is downstream of all 7 other variants', () => {
		const d = descendantsOf('comprehensive', 'en');
		expect(d).toHaveLength(7);
		expect(d).not.toContain('comprehensive_en');
		expect(d).toContain('concise_fr'); // reached transitively via concise_en
	});

	it('regenerating an EN report cascades only to its FR child', () => {
		expect(descendantsOf('referral', 'en')).toEqual(['referral_fr']);
	});

	it('a French leaf has no descendants', () => {
		expect(descendantsOf('concise', 'fr')).toEqual([]);
	});

	it('invalidatedBy lists only the GENERATED downstream reports', () => {
		// Comprehensive + concise_en + referral_en generated; the rest not.
		const ready = new Set(['comprehensive_en', 'concise_en', 'referral_en']);
		const isReady = (k) => ready.has(k);
		expect(invalidatedBy('comprehensive', 'en', isReady).sort()).toEqual(
			['concise_en', 'referral_en'].sort()
		);
	});
});

describe('reportGraph — derivability gate', () => {
	const readySet = (keys) => {
		const s = new Set(keys);
		return (k) => s.has(k);
	};

	it('a report is derivable only when its parent exists', () => {
		expect(isDerivable('concise', 'en', readySet(['comprehensive_en']))).toBe(true);
		expect(isDerivable('concise', 'en', readySet([]))).toBe(false);
		expect(isDerivable('concise', 'fr', readySet(['comprehensive_en']))).toBe(false); // needs concise_en
		expect(isDerivable('concise', 'fr', readySet(['comprehensive_en', 'concise_en']))).toBe(true);
	});

	it('the root is always derivable (comes from case data)', () => {
		expect(isDerivable('comprehensive', 'en', readySet([]))).toBe(true);
	});
});

describe('reportGraph — structure manifest', () => {
	it('comprehensive and concise share the 11-section clinical structure', () => {
		const comp = structureFor('comprehensive');
		expect(comp.kind).toBe('clinical-report');
		expect(comp.sections).toHaveLength(11);
		expect(comp.sections.map((s) => s.key)).toContain('diagnostic');
		expect(structureFor('concise').sections).toBe(comp.sections);
	});

	it('referral is a business-letter structure', () => {
		expect(structureFor('referral').kind).toBe('business-letter');
		expect(structureFor('referral').sections.map((s) => s.key)).toContain('closing');
	});

	it('patient_summary is a dynamic 6-section warm summary with an italic final section', () => {
		const st = structureFor('patient_summary');
		expect(st.kind).toBe('warm-summary');
		expect(st.structure).toMatchObject({ dynamic: true, sectionCount: 6, italicSectionId: 6 });
	});
});
