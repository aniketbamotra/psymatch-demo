#!/usr/bin/env node
/**
 * Regenerate src/lib/server/agentInput/outcomeCatalog.js from the live
 * `reportlogics` collection.
 *
 * Every diagnostic questionnaire's report logic already states its verdict in
 * clinician-authored prose — "{first_name} meets DSM-5 criteria for Borderline
 * Personality Disorder (301.83) (F60.31) ICD11: …". That prose is the single
 * source of truth for what a fired outcome MEANS, so the catalog is derived from
 * it rather than hand-maintained: hand-maintained tables are how insomnia,
 * adult ADHD and the suicide module went missing for months.
 *
 * The generated file is committed and unit-tested. Re-run this (and review the
 * diff) whenever a test's report logic changes:
 *
 *   npx vite-node scripts/generate-outcome-catalog.mjs
 *
 * READ-ONLY against Mongo.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import mongoose from 'mongoose';

import { connectToDatabase } from '../src/lib/database/connection.js';

const OUT = resolve(process.cwd(), 'src/lib/server/agentInput/outcomeCatalog.js');

// ── Polarity / name detection over the raw (un-substituted) summary prose ──────
//
// Placeholders are left in place on purpose: the phrasing that decides polarity
// sits outside them in every case but one (generalized_anxiety_test hides "meets"
// inside a they/them ternary), and that one is covered by the override table.

const NEGATIVE =
	/\b(fail(?:s|ed)? to meet|does not meet|do not meet|did not meet|not meet|never (?:consumed|used))\b/i;
const POSITIVE = /\b(?:meets?|meet)\b\s+(?:the\s+)?(?:DSM|diagnostic|criteria)/i;

const NAME =
	/(?:diagnostic criteria|criteria|diagnosis)\s+for\s+(?:the\s+|a\s+)?(.*?)(?=\s*\(?\d{3}\.\d|\s*\(?[FG]\d{2}\.|\s*\(ICD|\s*ICD|\s*\bbecause\b|\s*\bsince\b|\s*\bwith\b|\s*\bat least\b|\.\s|\.$|$)/s;

const DSM = /\b(\d{3}\.\d{1,2})\b/;
const ICD10 = /\(([FGZ]\d{2}(?:\.\d+)?)\)/;
const ICD11 = /ICD-?\s?11\s*:?\s*\(?([0-9][A-Z][A-Z0-9]*(?:\.\d+)?)\)?/i;

// ── Overrides ────────────────────────────────────────────────────────────────
//
// Eight outcomes the prose cannot classify on its own. Each is listed with the
// reason so a future reader can tell a deliberate override from a stale one.
const OVERRIDES = {
	// Continuation block: this outcome's first summary line is the *reason*
	// sentence, and the "does not meet" statement lands in a later block.
	'panic_test::Panic Negative A': { diagnosis: 'Panic Disorder', polarity: 'negative' },
	// The disorder name is chosen at runtime by a single_word block
	// (Post Traumatic Stress Disorder 6B40 vs Complex PTSD 6B41).
	'PTSD_test::PTSD positive': {
		diagnosis: 'Post Traumatic Stress Disorder',
		polarity: 'positive',
		dsm: '309.81',
		icd10: 'F43.10',
		icd11: '6B40'
	},
	// "{first_name} {pronouns.subject == 'they' ? 'meet' : 'meets'} DSM-5 criteria"
	// — the verb is inside the placeholder, so the raw prose reads as neither.
	'generalized_anxiety_test::Generalized anxiety positive': {
		diagnosis: 'Generalized Anxiety Disorder',
		polarity: 'positive'
	},
	// The ONE branch whose summary quotes a SECOND disorder's codes: Bipolar II is
	// stated as "…Bipolar II Disorder ICD11: (6A61) (at least one Hypomanic Episode
	// F31.81 and at least one Depressive Episode <296.2x/296.3x…>)". Its
	// single_word list is therefore the co-occurring depressive episode's code, not
	// Bipolar II's, so run-time parsing must be switched OFF here or Section 7
	// would print a depression code against a bipolar diagnosis.
	'manic_test::Bipolar II Positive': {
		diagnosis: 'Bipolar II Disorder',
		polarity: 'positive',
		icd10: 'F31.81',
		icd11: '6A61',
		graded: false
	},
	// Not diagnostic instruments: no verdict to classify.
	'stressful_beliefs_index::Stressful_Beliefs_Report': { diagnosis: null, polarity: 'none' },
	'suicide_interview::Suicide Ideation and Planning': { diagnosis: null, polarity: 'none' },
	// "never consumed X" outcomes: the substance was never used, so the disorder
	// is ruled out. Without this they fire with no negation phrase at all and the
	// old label heuristic scored them as SUPPORTED use disorders.
	'hallucinogen_use_disorder::Hallucinogen never used': {
		diagnosis: 'Hallucinogen Use Disorder',
		polarity: 'negative'
	},
	'pcp_use_disorder::PCP Use Disorder - No Use Reported': {
		diagnosis: 'PCP Use Disorder',
		polarity: 'negative'
	},
	'sedative_hypnotic_anxiolytic_use_disorder::Never Used Sedatives, hypnotics or anxiolytics': {
		diagnosis: 'Sedative, Hypnotic or Anxiolytic Use Disorder',
		polarity: 'negative'
	},
	'stimulant_use_disorder::Stimulant Use Disorder - No Use Reported': {
		diagnosis: 'Stimulant Use Disorder',
		polarity: 'negative'
	}
};

// Names the source prose spells inconsistently between its own positive and
// negative branches. Normalised so a patient never sees two spellings of one
// disorder across the algorithmic and the AI report.
const NAME_ALIASES = {
	'Sedatives, hypnotic or anxiolytic Use Disorder': 'Sedative, Hypnotic or Anxiolytic Use Disorder',
	'Sedative, hypnotic or anxiolytic Use Disorder': 'Sedative, Hypnotic or Anxiolytic Use Disorder',
	'Bipolar 1 (Manic Episode)': 'Bipolar I Disorder (Manic Episode)'
};

function firstSummaryText(outcome) {
	for (const s of outcome.report_sections ?? []) {
		if (!s.summary) continue;
		const t = s.text?.en;
		if (t && t.trim()) return t;
	}
	return null;
}

/**
 * Prose from the summary `text` blocks only.
 *
 * Codes are read from here and NEVER from `single_word`: a single_word list is a
 * run-time CHOICE between codes (alcohol 303.00/303.90, depression 296.21…296.33,
 * bipolar I 296.41…296.53, adjustment 309.0/309.24/309.28), so baking any one of
 * them into the catalog would print a code the algorithmic report disagrees with.
 */
function summaryTextOnly(outcome) {
	const parts = [];
	for (const s of outcome.report_sections ?? []) {
		if (!s.summary) continue;
		if (s.text?.en) parts.push(s.text.en);
	}
	return parts.join(' ');
}

// A single_word variant "carries a code" if it states a DSM number, an ICD-10
// F/G code, a bare ICD-11 code, or an explicit "ICD11:" reference. ADHD's
// presentation variants ("Predominantly Inattentive Presentation (F90.0).") only
// match the ICD-10 form; the ten personality modules grade ICD-11 severity and
// emit nothing but "(6D10.1)", which matches only the third.
// (antisocial_personality_test writes its grade bare — "6D10.0", no parentheses.)
const CODE_SHAPED =
	/\d{3}\.?\d*\s*\(|\([FGZ]\d{2}(?:\.\d+)?\)|\b[0-9][A-Z]\d{1,2}(?:\.\d+)?\b|\bICD/i;

/** Does this outcome pick its codes at run time from a single_word list? */
function hasGradedCodes(outcome) {
	for (const s of outcome.report_sections ?? []) {
		if (!s.summary) continue;
		const variants = new Set(
			(s.single_word ?? []).map((w) => w.text?.en).filter((t) => t && CODE_SHAPED.test(t))
		);
		if (variants.size >= 2) return true;
	}
	return false;
}

function classify(testCode, outcome) {
	const key = `${testCode}::${outcome.type}`;
	const override = OVERRIDES[key] ?? {};

	const first = firstSummaryText(outcome) ?? '';
	const stable = summaryTextOnly(outcome);
	const graded = override.graded ?? hasGradedCodes(outcome);

	let polarity = override.polarity;
	if (!polarity) {
		if (NEGATIVE.test(first)) polarity = 'negative';
		else if (POSITIVE.test(first)) polarity = 'positive';
		else polarity = 'unknown';
	}

	let diagnosis = override.diagnosis;
	if (diagnosis === undefined) {
		const m = NAME.exec(first);
		diagnosis = m ? m[1].replace(/\s+/g, ' ').trim().replace(/[.,]$/, '') : null;
	}
	if (diagnosis && NAME_ALIASES[diagnosis]) diagnosis = NAME_ALIASES[diagnosis];

	const dsm = override.dsm ?? DSM.exec(stable)?.[1] ?? null;
	const icd10 = override.icd10 ?? ICD10.exec(stable)?.[1] ?? null;
	const icd11 = override.icd11 ?? ICD11.exec(stable)?.[1] ?? null;

	return { diagnosis, polarity, dsm, icd10, icd11, graded };
}

const q = (v) => (v == null ? 'null' : JSON.stringify(v));

async function main() {
	await connectToDatabase();
	const db = mongoose.connection.db;

	const questionnaires = await db.collection('questionnaires').find({}).toArray();
	questionnaires.sort((a, b) => String(a.test_code).localeCompare(String(b.test_code)));

	const blocks = [];
	let nOutcomes = 0;
	let nUnknown = 0;

	for (const questionnaire of questionnaires) {
		const logic = await db.collection('reportlogics').findOne({ questionnaire: questionnaire._id });
		const outcomes = logic?.test_evaluation?.outcomes ?? [];
		if (!outcomes.length) continue;

		const lines = [];
		for (const outcome of outcomes) {
			const c = classify(questionnaire.test_code, outcome);
			nOutcomes++;
			if (c.polarity === 'unknown') {
				nUnknown++;
				console.error(`  ! unknown polarity: ${questionnaire.test_code} :: ${outcome.type}`);
			}
			lines.push(
				`\t\t${JSON.stringify(outcome.type)}: { diagnosis: ${q(c.diagnosis)}, polarity: ${q(
					c.polarity
				)}, dsm: ${q(c.dsm)}, icd10: ${q(c.icd10)}, icd11: ${q(c.icd11)}${
					c.graded ? ', graded: true' : ''
				} }`
			);
		}
		blocks.push(
			`\t// ${questionnaire.title?.en ?? questionnaire.test_code}\n` +
				`\t${JSON.stringify(questionnaire.test_code)}: {\n${lines.join(',\n')}\n\t}`
		);
	}

	// Per-disorder fallback: whatever code the corpus states for this disorder in
	// ANY branch. A positive branch that resolves its DSM code at run time
	// (alcohol, cannabis, depression) usually has a sibling negative branch whose
	// fixed prose names one — better to fall back to a code the system itself
	// prints than to leave Section 7 with "not supplied in case materials".
	const corpus = new Map();
	for (const questionnaire of questionnaires) {
		const logic = await db.collection('reportlogics').findOne({ questionnaire: questionnaire._id });
		for (const outcome of logic?.test_evaluation?.outcomes ?? []) {
			const c = classify(questionnaire.test_code, outcome);
			if (!c.diagnosis) continue;
			const prev = corpus.get(c.diagnosis) ?? { dsm: null, icd10: null, icd11: null };
			corpus.set(c.diagnosis, {
				dsm: prev.dsm ?? c.dsm,
				icd10: prev.icd10 ?? c.icd10,
				icd11: prev.icd11 ?? c.icd11
			});
		}
	}
	const corpusLines = [...corpus.entries()]
		.filter(([, v]) => v.dsm || v.icd10 || v.icd11)
		.sort((a, b) => a[0].localeCompare(b[0]))
		.map(
			([name, v]) =>
				`\t${JSON.stringify(name)}: { dsm: ${q(v.dsm)}, icd10: ${q(v.icd10)}, icd11: ${q(v.icd11)} }`
		);

	const header = `// GENERATED FILE — do not edit by hand.
// Regenerate with:  npx vite-node scripts/generate-outcome-catalog.mjs
//
// What a fired rule-engine outcome MEANS, derived from the clinician-authored
// prose each questionnaire's report logic already carries. Keyed
// test_code -> outcome.type.
//
//   diagnosis  canonical disorder name for that branch
//   polarity   'positive'  the branch asserts the diagnosis
//              'negative'  the branch rules it out (or the substance was never used)
//              'none'      not a diagnostic verdict (SBI, suicide module)
//   dsm/icd10/icd11
//              codes stated in that branch's fixed prose. Read ONLY from the
//              summary text blocks, never from a single_word list — a single_word
//              list is a run-time CHOICE between codes (alcohol 303.00 vs 303.90,
//              depression 296.21…296.33, bipolar I 296.41…296.53, the personality
//              modules' 6D10.x severity grade, PTSD vs Complex PTSD, anorexia's
//              subtype), so baking one in would contradict the algorithmic report.
//   graded     true when this branch resolves at least one code at run time.
//              resolveFiredOutcome() then prefers the codes it parses out of the
//              RENDERED summary line, which is the same string the algorithmic
//              report prints. null + graded means "wait for the render"; null
//              without graded means the instrument genuinely states no code.
//
// Coverage at generation time: ${nOutcomes} outcomes across ${blocks.length} questionnaires.

`;

	const body =
		`export const OUTCOME_CATALOG = {\n${blocks.join(',\n')}\n};\n\n` +
		`// Per-disorder fallback codes: the value any branch in the corpus states for\n` +
		`// this disorder. Consulted only after the rendered line and the fired branch\n` +
		`// have both come up empty, so a run-time-graded positive still carries the\n` +
		`// code its own instrument prints elsewhere.\n` +
		`export const CORPUS_CODES = {\n${corpusLines.join(',\n')}\n};\n`;

	writeFileSync(OUT, header + body, 'utf8');
	console.error(
		`[generate-outcome-catalog] wrote ${OUT}\n` +
			`[generate-outcome-catalog] ${nOutcomes} outcomes, ${blocks.length} questionnaires, ${nUnknown} unknown polarity`
	);
}

main()
	.catch((err) => {
		console.error('[generate-outcome-catalog] failed:', err.message);
		console.error(err.stack);
		process.exitCode = 1;
	})
	.finally(async () => {
		try {
			await mongoose.connection.close();
		} catch {
			/* ignore */
		}
	});
