// Regenerate the frozen interview answers in src/lib/demo/demo-data.json.
// Usage: `npm run demo:answers`, then `npm run demo:reset` to load them.
//
// The scoring rules are clinical decision trees (some read other interviews,
// e.g. depression checks the manic criteria), so random answers usually fall
// through every branch and the report prints nothing. This searches for answer
// sets that fire an outcome matching each assignment's profile: severe/moderate
// fire a positive diagnosis, mild/minimal a negative one. No database needed.
import { readFileSync, writeFileSync } from 'node:fs';
import { loadQuestionnaireData } from '../src/lib/database/init/questionnaires/loader.js';
import { testLogics } from '../src/lib/database/init/test_logics/index.js';
import {
	toQuestionnaireDoc,
	toReportLogicDoc,
	seededRandom
} from '../src/lib/database/init/demoSeed.js';
import { evaluateTestExpressions } from '../src/lib/utils/reportLogicTransformer/utils/helpers.js';
import { firedOutcomeOf } from '../src/lib/server/agentInput/standardReport.js';
import { normalizeRuleEngineResponses } from '../src/lib/utils/reportResponses.js';

const DATA_PATH = new URL('../src/lib/demo/demo-data.json', import.meta.url);
const MAX_TRIES = 20000;

// Range of the per-candidate answer level (0 = lowest scale value, 1 = highest)
const PROFILE_RANGE = {
	severe: [0.6, 1],
	moderate: [0.35, 0.75],
	mild: [0.1, 0.45],
	minimal: [0, 0.2]
};
const POSITIVE_PROFILES = new Set(['severe', 'moderate']);
const isNegativeOutcome = (type) => /negative/i.test(type);

// Interviews whose rules read each other's answers; searched together.
const LINKED_TESTS = ['depression_test', 'manic_test'];

const data = JSON.parse(readFileSync(DATA_PATH, 'utf8'));

// The evaluator logs every step; silence it during the search.
const log = console.log;
console.log = () => {};
const questionnaires = new Map(
	(await loadQuestionnaireData()).map((q) => {
		const doc = toQuestionnaireDoc(q);
		return [doc.test_code, doc];
	})
);
const logic = new Map(
	Object.entries(testLogics).map(([code, l]) => [code, toReportLogicDoc(l, null).test_evaluation])
);

function candidate(questionnaire, profile, rand, anyLevel = false) {
	const [lo, hi] = anyLevel ? [0, 1] : PROFILE_RANGE[profile] ?? [0.2, 0.8];
	const level = lo + rand() * (hi - lo);
	// Real answers skip whole branches, which the client stores as the lowest value.
	const zeroRate = rand() * 0.6;
	const answers = {};
	questionnaire.questions.forEach((question, index) => {
		const nums = question.scale.map((s) => s.num).sort((a, b) => a - b);
		const x = rand() < zeroRate ? 0 : Math.min(1, Math.max(0, level + (rand() - 0.5) * 0.6));
		const value = nums[Math.round(x * (nums.length - 1))];
		// The patient UI stores scale answers as string keys and yes/no answers as numbers.
		answers[`q${index + 1}`] = question.answer_type === 'boolean' ? value : String(value);
	});
	return answers;
}

function evaluate(testCode, answers, otherTestResponses) {
	const result = evaluateTestExpressions(logic.get(testCode), {
		_responses: normalizeRuleEngineResponses(answers, testCode),
		_otherTestResponses: otherTestResponses
	});
	const fired = firedOutcomeOf(result);
	return fired?.report_sections?.length ? fired.type : null;
}

const matchesProfile = (a, outcome) =>
	outcome && isNegativeOutcome(outcome) !== POSITIVE_PROFILES.has(a.profile);

// Search answers for a group of completed assignments evaluated together. Tries
// answers in each profile's range first, then anywhere on the scale (a "minimal"
// patient still needs some symptoms for a negative verdict to fire).
function searchGroup(patient, group) {
	const rand = seededRandom(`${patient.email}:${group.map((a) => a.test).join('+')}`);
	let fallback = null;
	for (let i = 0; i < MAX_TRIES; i++) {
		const anyLevel = i >= MAX_TRIES / 2;
		const answers = group.map((a) => candidate(questionnaires.get(a.test), a.profile, rand, anyLevel));
		const normalized = Object.fromEntries(
			group.map((a, j) => [a.test, normalizeRuleEngineResponses(answers[j], a.test)])
		);
		const outcomes = group.map((a, j) => evaluate(a.test, answers[j], normalized));
		if (group.every((a, j) => matchesProfile(a, outcomes[j]))) return { answers, outcomes };
		// Otherwise keep the candidate that fires the most (then best-matching) outcomes
		const score =
			outcomes.filter(Boolean).length * 10 +
			group.filter((a, j) => matchesProfile(a, outcomes[j])).length;
		if (score > 0 && (!fallback || score > fallback.score)) fallback = { answers, outcomes, score };
	}
	return fallback;
}

const summary = [];
for (const patient of data.patients) {
	const completed = [];
	for (const a of patient.assignments) {
		// Interviews without scoring rules (Adult Bio) keep their hand-written answers
		if (!logic.has(a.test)) continue;
		delete a.answers;
		if (a.progress === 'not_started') continue;

		if (a.progress === 'in_progress') {
			const answers = Object.entries(
				candidate(questionnaires.get(a.test), a.profile, seededRandom(`${patient.email}:${a.test}`))
			);
			const count = Math.max(
				1,
				Math.min(answers.length - 1, Math.round(answers.length * (a.answered ?? 0.5)))
			);
			a.answers = Object.fromEntries(answers.slice(0, count));
			summary.push(`${patient.fullName} / ${a.test}: ${count}/${answers.length} answered`);
		} else {
			completed.push(a);
		}
	}

	const linked = completed.filter((a) => LINKED_TESTS.includes(a.test));
	const groups = [
		...(linked.length ? [linked] : []),
		...completed.filter((a) => !linked.includes(a)).map((a) => [a])
	];
	for (const group of groups) {
		const found = searchGroup(patient, group);
		group.forEach((a, j) => {
			if (!found) {
				summary.push(`${patient.fullName} / ${a.test} (${a.profile}): NO OUTCOME FOUND`);
				return;
			}
			a.answers = found.answers[j];
			if (!found.outcomes[j]) {
				summary.push(`${patient.fullName} / ${a.test} (${a.profile}): no outcome (inconclusive)`);
				return;
			}
			const note = matchesProfile(a, found.outcomes[j]) ? '' : ' [profile not reachable]';
			summary.push(`${patient.fullName} / ${a.test} (${a.profile}): ${found.outcomes[j]}${note}`);
		});
	}
}
console.log = log;

writeFileSync(DATA_PATH, JSON.stringify(data, null, '\t') + '\n');
console.log(summary.join('\n'));
