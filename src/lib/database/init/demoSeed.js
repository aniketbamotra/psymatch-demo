import {
	User,
	Questionnaire,
	Assignment,
	Response,
	Status,
	QuestionnaireOrder,
	Set as InterviewSet,
	Legal,
	PrivacyOfficer,
	ActiveJurisdiction
} from '../schemas.js';
import { ReportLogic } from '../reportLogicSchemas.js';
import { hashPassword } from '../../utils/password.js';
import { loadQuestionnaireData } from './questionnaires/loader.js';
import { testLogics } from './test_logics/index.js';
import { seedLegalDocs } from './legalSeed.js';
import { fetchCurrentLegalBundle, buildSnapshotFromBundle } from '../../utils/legal.js';
import { processAlgorithmicFields } from '../../utils/anonymization/algorithmicProcessor.js';
import { buildRedactionRules, NO_AI_RESULT } from '../../utils/anonymization/redactionRules.js';
import adultBioDefinition from './questionnaires/jsons/adult_bio.json';
import demoData from '../../demo/demo-data.json';

const DAY_MS = 24 * 60 * 60 * 1000;

// The interview JSONs in the repo are English-only plain strings, but the
// schemas want { en, fr }. French falls back to the English text in the demo.
const bilingual = (value) =>
	typeof value === 'string' ? { en: value, fr: value } : value || { en: '', fr: '' };

// Report-logic keys that hold display text rather than operation trees.
const REPORT_TEXT_KEYS = new Set(['report_title', 'heading', 'text', 'text_after']);

function localizeReportText(node) {
	if (Array.isArray(node)) return node.map(localizeReportText);
	if (!node || typeof node !== 'object') return node;
	return Object.fromEntries(
		Object.entries(node).map(([key, value]) => [
			key,
			REPORT_TEXT_KEYS.has(key) && typeof value === 'string'
				? bilingual(value)
				: localizeReportText(value)
		])
	);
}

export function toQuestionnaireDoc(q) {
	return {
		title: bilingual(q.title),
		test_code: q.test_code,
		displayTextBeforeQuestions: bilingual(q.displayTextBeforeQuestions),
		questions: q.questions.map((question) => ({
			...question,
			text: bilingual(question.text),
			description_for_subsequent_question: bilingual(
				question.description_for_subsequent_question
			),
			scale: question.scale.map((item) => ({ num: item.num, text: bilingual(item.text) }))
		})),
		questionDisplayLogic: []
	};
}

// The Adult Biographical interview's authoring file differs from the scored
// interviews: special input types, option lists, and a scale already in
// { num, text } form. It has no scoring rules (its report has its own processor).
export function toAdultBioDoc(raw) {
	const { test_metadata, questions } = raw.test_structure;
	return {
		title: bilingual('Adult Biographical Interview'),
		test_code: test_metadata.test_code,
		displayTextBeforeQuestions: bilingual(test_metadata.display_text_before_questions),
		questions: questions.question_template.map((q) => ({
			id: q.id,
			text: bilingual(q.text),
			description_for_subsequent_question: bilingual(''),
			answer_type: q.answer_type,
			input_type: q.input_type,
			...(q.options && { options: q.options.map(bilingual) }),
			...(q.fields && { fields: q.fields }),
			...(q.conditional && { conditional: q.conditional }),
			scale: (q.scale || []).map((item) => ({ num: item.num, text: bilingual(item.text) }))
		})),
		questionDisplayLogic: []
	};
}

export function toReportLogicDoc(logic, questionnaireId) {
	const te = localizeReportText(logic.test_evaluation);
	return {
		questionnaire: questionnaireId,
		test_evaluation: {
			...te,
			variables: te.variables
				.filter((v) => (v.name || v.id) && v.operation)
				.map((v) => ({ name: v.name || v.id, operation: v.operation }))
		}
	};
}

// Small deterministic PRNG so every reset produces the same answers.
export function seededRandom(seedText) {
	let h = 2166136261;
	for (const ch of seedText) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
	return () => {
		h = Math.imul(h ^ (h >>> 15), 2246822507);
		h = Math.imul(h ^ (h >>> 13), 3266489909);
		return ((h ^= h >>> 16) >>> 0) / 4294967296;
	};
}

// Where on each question's scale a profile's answers centre (0 = lowest, 1 = highest).
const PROFILE_LEVEL = { severe: 0.85, moderate: 0.55, mild: 0.3, minimal: 0.05 };

function buildAnswers(questionnaire, assignment, seedText) {
	// Answers frozen in demo-data.json (see scripts/demo-generate-answers.js)
	if (assignment.answers) {
		return Object.entries(assignment.answers).map(([questionId, value]) => ({ questionId, value }));
	}

	const rand = seededRandom(seedText);
	const level = PROFILE_LEVEL[assignment.profile] ?? 0.5;
	const total = questionnaire.questions.length;
	const count =
		assignment.progress === 'in_progress'
			? Math.max(1, Math.min(total - 1, Math.round(total * (assignment.answered ?? 0.5))))
			: total;

	return questionnaire.questions.slice(0, count).map((question, index) => {
		const nums = question.scale.map((s) => s.num).sort((a, b) => a - b);
		const jitter = (rand() - 0.5) * 0.5;
		const pick = Math.round(Math.min(1, Math.max(0, level + jitter)) * (nums.length - 1));
		// The patient UI saves answers as q1..qN by position: scale answers as
		// string keys, yes/no answers as numbers.
		const value = question.answer_type === 'boolean' ? nums[pick] : String(nums[pick]);
		return { questionId: `q${index + 1}`, value };
	});
}

function patientStatusFor(patient, assignmentStatuses) {
	if (patient.inactive) return 'inactive';
	const done = (s) => s === 'completed' || s === 'downloaded';
	if (assignmentStatuses.length && assignmentStatuses.every(done)) return 'completed';
	if (assignmentStatuses.some((s) => s === 'in_progress' || done(s))) return 'active';
	return 'onboarded';
}

const DEMO_COLLECTIONS = [
	User,
	Questionnaire,
	ReportLogic,
	Assignment,
	Response,
	Status,
	QuestionnaireOrder,
	InterviewSet,
	Legal,
	PrivacyOfficer,
	ActiveJurisdiction
];

/**
 * True when the database has no interviews yet, i.e. a fresh demo database.
 */
export async function isDemoDatabaseEmpty() {
	return (await Questionnaire.estimatedDocumentCount()) === 0;
}

/**
 * Load the synthetic demo dataset (src/lib/demo/demo-data.json) plus the
 * interviews and scoring rules shipped in the repo.
 *
 * With `reset`, every demo collection is emptied first so the demo returns to
 * its starting state. Assumes the database connection is already open.
 */
export async function seedDemoData({ reset = false } = {}) {
	const now = Date.now();
	const daysAgo = (days = 0) => new Date(now - days * DAY_MS);

	if (reset) {
		await Promise.all(DEMO_COLLECTIONS.map((Model) => Model.deleteMany({})));
	}

	// 1) Interviews and their scoring rules
	const questionnaires = await Questionnaire.insertMany([
		...(await loadQuestionnaireData()).map(toQuestionnaireDoc),
		toAdultBioDoc(adultBioDefinition)
	]);
	const byCode = new Map(questionnaires.map((q) => [q.test_code, q]));
	await ReportLogic.insertMany(
		Object.entries(testLogics)
			.filter(([code]) => byCode.has(code))
			.map(([code, logic]) => toReportLogicDoc(logic, byCode.get(code)._id))
	);

	await QuestionnaireOrder.create({ orderedTestCodes: demoData.questionnaireOrder });
	await InterviewSet.insertMany(
		demoData.sets.map((s) => ({
			set_name: s.set_name,
			status: s.status,
			interviews: s.tests.map((code) => byCode.get(code)._id)
		}))
	);

	// 2) Legal docs, so patients see the TOS modal and accepted ones have a snapshot
	await seedLegalDocs();
	const legalBundle = await fetchCurrentLegalBundle();

	// 3) Staff
	const admins = new Map();
	for (const admin of demoData.admins) {
		const doc = await User.create({
			email: admin.email,
			fullName: admin.fullName,
			gender: admin.gender,
			userType: 'admin',
			isDirector: admin.isDirector,
			adminProfile: { passwordHash: await hashPassword(admin.password) },
			createdAt: daysAgo(90)
		});
		admins.set(admin.email, doc);
	}

	// 4) Patients, their assignments, answers and dashboard status
	for (const patient of demoData.patients) {
		const intakeAdmin = admins.get(patient.intakeBy);
		const user = await User.create({
			email: patient.email,
			fullName: patient.fullName,
			gender: patient.gender,
			userType: 'patient',
			createdAt: daysAgo(patient.createdDaysAgo),
			patientProfile: {
				passwordHash: patient.password ? await hashPassword(patient.password) : undefined,
				isPasswordSet: Boolean(patient.password),
				phoneNumber: patient.phoneNumber,
				preferredCommunication: patient.preferredCommunication,
				preferredLanguage: patient.preferredLanguage,
				intakeNote: patient.intakeNote,
				fileMakerId: patient.fileMakerId,
				intakeAdmin: { id: intakeAdmin._id, name: intakeAdmin.fullName },
				notes: (patient.notes || []).map((n) => {
					const by = admins.get(n.by);
					return {
						adminId: by._id,
						adminName: by.fullName,
						note: n.note,
						timestamp: daysAgo(n.daysAgo)
					};
				}),
				agreement: patient.tosAccepted
					? {
							accepted: true,
							acceptedAt: daysAgo(patient.createdDaysAgo),
							acceptedLanguage: patient.preferredLanguage,
							snapshot: buildSnapshotFromBundle(legalBundle, patient.preferredLanguage)
					  }
					: undefined
			}
		});

		const assignmentIds = [];
		const assignmentStatuses = [];
		let adultBioResponses = null;
		let lastActivity = daysAgo(patient.createdDaysAgo);

		for (const a of patient.assignments) {
			const questionnaire = byCode.get(a.test);
			const assignment = await Assignment.create({
				patientId: user._id,
				questionnaireId: questionnaire._id,
				assignedBy: intakeAdmin._id,
				status: a.progress,
				assignedAt: daysAgo(a.assignedDaysAgo),
				completedAt: a.completedDaysAgo != null ? daysAgo(a.completedDaysAgo) : null,
				downloadedOn: a.downloadedDaysAgo != null ? daysAgo(a.downloadedDaysAgo) : null
			});
			assignmentIds.push(assignment._id);
			assignmentStatuses.push(a.progress);

			if (a.progress !== 'not_started') {
				const submittedAt = daysAgo(a.completedDaysAgo ?? Math.max(0, a.assignedDaysAgo - 1));
				const responses = buildAnswers(questionnaire, a, `${patient.email}:${a.test}`);
				await Response.create({ assignmentId: assignment._id, responses, submittedAt });
				if (submittedAt > lastActivity) lastActivity = submittedAt;
				if (a.test === 'ADULT_BIO') adultBioResponses = responses;
			}
		}

		// Redaction profile, built the way /api/anonymization/process does in demo mode
		if (patient.redactionProfile && adultBioResponses) {
			const algResults = processAlgorithmicFields(user._id.toString(), adultBioResponses);
			const rules = buildRedactionRules(algResults, NO_AI_RESULT, adultBioResponses);
			user.patientProfile.anonymizationProfile = {
				status: 'completed',
				generatedAt: lastActivity,
				version: 2,
				...rules
			};
			await user.save();
		}

		await Status.create({
			patientId: user._id,
			status: patientStatusFor(patient, assignmentStatuses),
			assignmentIds,
			lastActivity:
				patient.lastActivityDaysAgo != null ? daysAgo(patient.lastActivityDaysAgo) : lastActivity,
			createdAt: daysAgo(patient.createdDaysAgo)
		});
	}

	console.log(
		`Demo data seeded: ${questionnaires.length} interviews, ${demoData.admins.length} staff, ${demoData.patients.length} patients`
	);
}
