// Cross-check tool for the AI-report dependency flow.
//
//   node scripts/report-graph.mjs
//
// Prints every report variant with the report(s) it is BUILT FROM (its parents),
// what it feeds (children), the lazy build chain to produce it, and the cascade
// set that gets invalidated if it is regenerated — then runs validateGraph() so a
// mis-wired parent, dangling reference, or cycle fails loudly. Pure read-only.

import {
	allVariants,
	roots,
	parentsOf,
	childrenOf,
	chainTo,
	descendantsOf,
	structureFor,
	FORMATS,
	validateGraph
} from '../src/lib/reports/reportGraph.js';

const pad = (s, n) => String(s).padEnd(n);
const arrow = ' → ';

console.log('\n══ REPORT DEPENDENCY GRAPH ══════════════════════════════════════════\n');

console.log('SOURCES (built from case data):', roots().map((r) => r.key).join(', '), '\n');

console.log(pad('VARIANT', 20), pad('KIND', 10), pad('BUILT FROM', 22), 'FEEDS');
console.log('─'.repeat(78));
for (const v of allVariants()) {
	console.log(
		pad(v.key, 20),
		pad(v.kind, 10),
		pad(v.parents.length ? v.parents.join(', ') : '— (source)', 22),
		childrenOf(v.key).join(', ') || '—'
	);
}

console.log('\n── BUILD CHAINS (lazy ensure order, parents first) ──────────────────\n');
for (const v of allVariants()) {
	console.log(pad(v.key, 20), chainTo(v.key).map((n) => n.key).join(arrow));
}

console.log('\n── CASCADE (regenerate X → these are invalidated) ───────────────────\n');
for (const v of allVariants()) {
	const d = descendantsOf(v.key);
	console.log(pad(v.key, 20), d.length ? d.join(', ') : '(nothing downstream)');
}

console.log('\n── RENDER STRUCTURE (sections per format) ───────────────────────────\n');
for (const f of FORMATS) {
	const st = structureFor(f);
	if (st.sections) {
		console.log(pad(f, 18), `${st.kind} · ${st.sections.length} sections`);
		console.log('   ', st.sections.map((s) => s.key).join(', '));
	} else {
		console.log(pad(f, 18), `${st.kind} · ${JSON.stringify(st.structure)}`);
	}
}

console.log('\n── VALIDATION ───────────────────────────────────────────────────────\n');
const { ok, errors } = validateGraph();
if (ok) {
	console.log('✓ graph is valid — every derived report has a real parent, no cycles, all formats have a structure.\n');
	process.exit(0);
} else {
	console.error('✗ graph is INVALID:');
	for (const e of errors) console.error('  •', e);
	console.error('');
	process.exit(1);
}
