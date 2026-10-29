import { describe, expect, it } from 'vitest';
import { selectPrincipal, safetyFires, severityScoreOf, TIE_ORDER, CONCERN_INTERVIEWS } from './principalDiagnosis.js';
import { KNOWN_DIAGNOSTIC_INTERVIEWS } from './knownInterviewKeys.js';

const adhd = { interviewKey: 'adult_adhd', diagnosis: 'Adult ADHD Combined Type', severityScore: 2.6 };
const mdd = { interviewKey: 'depression', diagnosis: 'Major Depressive Episode', severityScore: 2.1 };
const sad = { interviewKey: 'social_anxiety', diagnosis: 'Social Anxiety Disorder', severityScore: 1.2 };

describe('selectPrincipal', () => {
	it('returns null when nothing is confirmed', () => {
		expect(selectPrincipal({ candidates: [] })).toBeNull();
	});

	it('Step 1: current suicide risk hands the principal to the mood episode, over concerns and severity', () => {
		const r = selectPrincipal({
			candidates: [adhd, mdd, sad],
			concerns: ['ADHD Management'],
			suicideResponses: { q7: 3 }
		});
		expect(r).toMatchObject({ interview_key: 'depression', step: 1 });
		expect(r.statement).toMatch(/^Principal diagnosis selected at Step 1 \(Acute safety\): /);
	});

	it('Step 1 does not fire without a confirmed mood episode', () => {
		const r = selectPrincipal({ candidates: [adhd, sad], suicideResponses: { q7: 4 } });
		expect(r.step).not.toBe(1);
	});

	it('Step 2: the only confirmed diagnosis matching a ticked concern wins, even at lower severity', () => {
		const r = selectPrincipal({ candidates: [adhd, mdd, sad], concerns: ['Anxiety', 'Stress'] });
		expect(r).toMatchObject({ interview_key: 'social_anxiety', step: 2 });
		expect(r.statement).toContain('"Anxiety"');
	});

	it('resolves i18n-key concerns before mapping', () => {
		const key = 'Questionnaire.Config.AdultBio.reasons_for_cct.options.1'; // "Mood/Depression"
		const r = selectPrincipal({ candidates: [adhd, mdd], concerns: [key] });
		expect(r).toMatchObject({ interview_key: 'depression', step: 2 });
	});

	it('Step 3: several matched concerns → higher severity', () => {
		const r = selectPrincipal({ candidates: [adhd, mdd], concerns: ['ADHD Management', 'Mood/Depression'] });
		expect(r).toMatchObject({ interview_key: 'adult_adhd', step: 3 });
	});

	it('no matching concern → all confirmed diagnoses compete on severity', () => {
		const r = selectPrincipal({ candidates: [adhd, mdd], concerns: ['Stress', 'Other'] });
		expect(r).toMatchObject({ interview_key: 'adult_adhd', step: 3 });
	});

	it('Step 4: equal severity falls to the fixed order', () => {
		const r = selectPrincipal({ candidates: [{ ...adhd, severityScore: 2 }, { ...mdd, severityScore: 2 }] });
		expect(r).toMatchObject({ interview_key: 'depression', step: 4 });
	});

	it('a missing severity ranks below any scored diagnosis', () => {
		const r = selectPrincipal({ candidates: [{ ...mdd, severityScore: null }, sad] });
		expect(r.interview_key).toBe('social_anxiety');
	});

	it('a single confirmed diagnosis is the principal', () => {
		expect(selectPrincipal({ candidates: [sad] })).toMatchObject({ interview_key: 'social_anxiety' });
	});
});

describe('safetyFires (1-based scales: 1 = No / Not at all)', () => {
	it('stays quiet on all-lowest answers and on no answers', () => {
		expect(safetyFires({ q3: 5, q5: 1, q7: 1, q8: 1, q25: 1, q28: 1 })).toBe(false);
		expect(safetyFires({})).toBe(false);
		expect(safetyFires(null)).toBe(false);
	});
	it('fires on intent "A little" or more', () => {
		expect(safetyFires({ q7: 2 })).toBe(true);
		expect(safetyFires({ q7: '2' })).toBe(true);
	});
	it('fires on past-month ideation with a plan and possible means, not without means', () => {
		expect(safetyFires({ q3: 4, q5: 3, q8: 2 })).toBe(true);
		expect(safetyFires({ q3: 4, q5: 3, q8: 1 })).toBe(false);
		expect(safetyFires({ q3: 5, q5: 4, q8: 4 })).toBe(false); // over a month ago
	});
	it('fires on self-harm in the past 2 weeks when frequently unable to stop', () => {
		expect(safetyFires({ q25: 2, q28: 3 })).toBe(true);
		expect(safetyFires({ q25: 2, q28: 2 })).toBe(false);
		expect(safetyFires({ q25: 1, q28: 4 })).toBe(false);
	});
});

describe('severityScoreOf', () => {
	it('reads the shared Severity score', () => {
		expect(severityScoreOf({ Severity: 1.4 })).toBe(1.4);
	});
	it('takes the higher of ADHD\'s two scores', () => {
		expect(severityScoreOf({ severityAttention: 2.7, severityHyperactivity: 1.9 })).toBe(2.7);
	});
	it('rounds away float noise so a true tie stays a tie', () => {
		expect(severityScoreOf({ Severity: 2.999999727272752 })).toBe(3);
	});
	it('is null when no score exists', () => {
		expect(severityScoreOf({})).toBeNull();
	});
});

describe('tables cover every diagnostic interview', () => {
	const diagnostic = KNOWN_DIAGNOSTIC_INTERVIEWS.filter((k) => k !== 'comprehensive_suicide_self_harm');
	it('the tie-break order lists each exactly once', () => {
		expect([...TIE_ORDER].sort()).toEqual([...diagnostic].sort());
	});
	it('every mapped concern names a real interview', () => {
		for (const keys of Object.values(CONCERN_INTERVIEWS)) for (const k of keys) expect(diagnostic).toContain(k);
	});
});
