import mongoose from 'mongoose';

// Anonymization Profile Schema
const anonymizationProfileSchema = new mongoose.Schema({
	status: {
		type: String,
		enum: ['pending', 'processing', 'completed', 'failed', 'aborted'],
		default: 'pending'
	},
	generatedAt: Date,
	version: { type: Number, default: 1 },
	regenerateReason: String,
	errorMessage: String,
	fieldRewrites: { type: mongoose.Schema.Types.Mixed, default: undefined },
	searchReplace: [{
		find: String,
		replace: String,
		caseSensitive: { type: Boolean, default: true },
		// Optional role descriptor set by the AI generator where the role is known
		// (e.g. "Name of Patient", "Name of Child", "Phone of Emergency Contact").
		// Drives the redCode token label for the agent flow; absent on legacy /
		// manual rules, which fall back to descriptor inference at dispatch time.
		desc: String,
		category: String
	}]
}, { _id: false });

// User Schema
const userSchema = new mongoose.Schema({
	email: {
		type: String,
		required: true,
		unique: true,
		match: [/.+@.+\..+/, 'Please enter a valid e-mail address']
	},
	gender: {
		type: String,
		enum: ['He', 'She', 'They', 'Ze'],
		required: true
	},
	fullName: {
		type: String,
		required: true
	},
	userType: {
		type: String,
		enum: ['admin', 'patient'],
		required: true
	},
	isDirector: {
		type: Boolean,
		default: false
	},
	adminProfile: {
		passwordHash: String
	},
	patientProfile: {
		passwordHash: String,
		isMock: {
			type: Boolean,
			default: false
		},
		isPasswordSet: {
			type: Boolean,
			default: false
		},
		phoneNumber: String,
		preferredCommunication: {
			type: String,
			enum: ['Email', 'Phone', 'Both']
		},
		// Mandatory in practice: the AI report, the transactional emails and the TOS
		// modal all pick a locale from this. `default` only covers `undefined` — an
		// empty string fails the enum and `null` stores as null — so write paths run
		// values through normalizeLanguage() in utils/language.js first.
		preferredLanguage: {
			type: String,
			enum: ['en', 'fr'],
			default: 'en'
		},
		intakeNote: String,
		intakeAdmin: {
			id: {
				type: mongoose.Schema.Types.ObjectId,
				ref: 'User'
			},
			name: String
		},
		notes: [
			{
				adminId: {
					type: mongoose.Schema.Types.ObjectId,
					ref: 'User'
				},
				adminName: String,
				note: String,
				timestamp: {
					type: Date,
					default: Date.now
				}
			}
		],
		fileMakerId: {
			type: String,
			unique: true,
			sparse: true
		},
		anonymizationProfile: anonymizationProfileSchema,
		// Per-patient AI spend ledger ("AI credit used"). Both the redaction
		// pipeline (Comprehend + Haiku, written here by Vercel) and the
		// comprehensive-report run (Sonnet, written here by psymatch-agent)
		// append a trace and atomically increment the running total via
		// $inc/$push, so concurrent writes from the two services never clobber.
		aiCost: {
			totalUsd: { type: Number, default: 0 },
			updatedAt: { type: Date, default: null },
			traces: {
				type: [
					{
						_id: false,
						source: { type: String }, // 'redaction_profile' | 'comprehensive_report'
						refId: { type: String }, // profile-gen id or report jobId
						totalUsd: { type: Number, default: 0 },
						breakdown: { type: mongoose.Schema.Types.Mixed, default: null },
						at: { type: Date, default: Date.now }
					}
				],
				default: []
			}
		},
		agreement: {
			accepted: { type: Boolean, default: false },
			acceptedAt: Date,
			acceptedLanguage: { type: String, enum: ['en', 'fr'] },
			snapshot: {
				tos: { type: String, default: '' },
				privacyOfficer: { type: String, default: '' },
				jurisdictionFooter: { type: String, default: '' },
				jurisdictionKey: { type: String, default: '' },
				versions: {
					tos: Number,
					privacyOfficer: Number,
					jurisdiction: Number,
					activeJurisdiction: Number
				}
			}
		}
	},
	resetPasswordToken: String,
	resetPasswordExpires: Date,
	session: {
		id: String,
		expires: Date
	},
	createdAt: {
		type: Date,
		default: Date.now
	}
});

// Exception test codes that use special handling
const EXCEPTION_TEST_CODES = [
	'ADULT_BIO', // Adult Biographical Questionnaire
	'THERAPIST_MATCH', // Therapist Matching
	'EXCEPTION_3' // Reserved for future exception test
];

// Multilingual text schema - only supports object format
const multilingualTextSchema = new mongoose.Schema(
	{
		en: { type: String, required: true },
		es: { type: String, required: false },
		fr: { type: String, required: false }
		// Add more languages as needed
	},
	{ _id: false, strict: false }
);

// Optional multilingual text schema - allows empty strings
const optionalMultilingualTextSchema = new mongoose.Schema(
	{
		en: { type: String, default: '' },
		es: { type: String, default: '' },
		fr: { type: String, default: '' }
	},
	{ _id: false, strict: false }
);

// Scale item schema with multilingual support
const scaleItemSchema = new mongoose.Schema(
	{
		num: { type: Number, required: true },
		text: {
			type: multilingualTextSchema,
			required: true
		}
	},
	{ _id: false }
);

// Option Set Schema for multiOptions input type with multilingual support
const optionSetSchema = new mongoose.Schema(
	{
		label: {
			type: multilingualTextSchema,
			required: true
		},
		options: {
			type: [multilingualTextSchema],
			required: true
		}
	},
	{ _id: false }
);

const questionSchema = new mongoose.Schema(
	{
		id: {
			type: String,
			required: true
		},
		description_for_subsequent_question: {
			type: optionalMultilingualTextSchema,
			default: { en: '', es: '' }
		},
		text: {
			type: multilingualTextSchema,
			required: true
		},
		answer_type: {
			type: String,
			enum: ['scale', 'boolean', 'special'],
			required: true
		},
		input_type: {
			type: String,
			enum: [
				'text',
				'textarea',
				'date',
				'number',
				'select',
				'boolean',
				'contacts',
				'children_list',
				'medication_list',
				'header',
				'multiOptions',
				'bmi_calculator'
			],
			required: function () {
				return this.answer_type === 'special';
			}
		},
		options: {
			type: [multilingualTextSchema],
			required: function () {
				return this.input_type === 'select';
			}
		},
		optionSets: {
			type: [optionSetSchema],
			required: function () {
				return this.input_type === 'multiOptions';
			},
			validate: {
				validator: function (v) {
					if (this.input_type === 'multiOptions') {
						return Array.isArray(v) && v.length > 0;
					}
					return true;
				},
				message: 'optionSets must be a non-empty array for multiOptions input type'
			}
		},
		fields: {
			type: [String],
			required: function () {
				return ['contacts', 'children_list', 'medication_list'].includes(this.input_type);
			}
		},
		conditional: {
			dependsOn: String,
			showIf: mongoose.Schema.Types.Mixed
		},
		answer_values: {
			type: multilingualTextSchema,
			required: false
		},
		scale: [scaleItemSchema]
	},
	{ _id: false }
);

// Simplified Questionnaire Schema - removed criteria, criteriaForReportGeneration, and reports
const questionnaireSchema = new mongoose.Schema({
	title: {
		type: multilingualTextSchema,
		required: true
	},
	test_code: {
		type: String,
		required: true
	},
	displayTextBeforeQuestions: {
		type: multilingualTextSchema,
		default: { en: '', es: '' }
	},
	questions: [questionSchema],
	questionDisplayLogic: [
		{
			type: Map,
			of: String
		}
	]
});

// Helper function to check if a test is an exception
export const isExceptionTest = (testCode) => EXCEPTION_TEST_CODES.includes(testCode);

// Add index for efficient queries
questionnaireSchema.index({ title: 1 }); // For Questionnaire.findOne({ title })
questionnaireSchema.index({ test_code: 1 }); // For lookups by test code

// Test Assignment Schema
const testAssignmentSchema = new mongoose.Schema({
	patientId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'User',
		required: true
	},
	questionnaireId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'Questionnaire',
		required: true
	},
	assignedBy: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'User',
		required: true
	},
	status: {
		type: String,
		enum: ['not_started', 'in_progress', 'completed', 'downloaded', 'removed'],
		default: 'not_started'
	},
	assignedAt: {
		type: Date,
		default: Date.now
	},
	completedAt: {
		type: Date,
		default: null
	},
	downloadedOn: {
		type: Date,
		default: null
	}
});

// Add indexes for efficient queries
testAssignmentSchema.index({ patientId: 1, status: 1 });
testAssignmentSchema.index({ status: 1, assignedAt: -1 });
testAssignmentSchema.index({ patientId: 1, questionnaireId: 1 }); // For lookups by patient and questionnaire
testAssignmentSchema.index({ questionnaireId: 1 }); // For populate operations

// Response Schema
const responseSchema = new mongoose.Schema({
	assignmentId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'Assignment',
		required: true
	},
	responses: [
		{
			questionId: {
				type: String,
				required: true
			},
			value: mongoose.Schema.Types.Mixed
		}
	],
	submittedAt: {
		type: Date,
		default: Date.now
	}
});

// Add index for efficient queries
responseSchema.index({ assignmentId: 1 }); // For Response.findOne({ assignmentId })

// Status Schema - Replaces Followup Schema
const statusSchema = new mongoose.Schema({
	patientId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'User',
		required: true,
		unique: true
	},
	status: {
		type: String,
		enum: ['onboarded', 'active', 'completed', 'inactive'],
		required: true,
		default: 'onboarded'
	},
	lastActivity: {
		type: Date,
		default: Date.now
	},
	assignmentIds: [
		{
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Assignment'
		}
	],
	createdAt: {
		type: Date,
		default: Date.now
	},
	updatedAt: {
		type: Date,
		default: Date.now
	}
});

// Add index for efficient queries
statusSchema.index({ status: 1, lastActivity: -1 });
statusSchema.index({ patientId: 1 });

// Update timestamp on save
statusSchema.pre('save', function (next) {
	this.updatedAt = new Date();
	next();
});

// Followup Schema (Deprecated - will be removed after migration)
const followupSchema = new mongoose.Schema({
	patientId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'User',
		required: true
	},
	assignmentIds: [
		{
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Assignment'
		}
	],
	lastFollowupDate: {
		type: Date,
		default: Date.now
	},
	last_followedup_by: {
		id: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User'
		},
		name: String
	}
});

// Generative Report Schema
//
// Single source of truth for the agentic comprehensive-report flow.
// Lifecycle of `status`:
//   null         → doc just created on Vercel side; agent_input has been built
//                  but the agent hasn't acknowledged yet
//   'generating' → agent returned 200/202 to the Vercel dispatch; workflow is
//                  running asynchronously on the agent side
//   'successful' → terminal; written by the agent itself once the final report
//                  markdown is in place. Vercel never writes this.
//   'failed'     → terminal; written by either side when the run can't complete
//
// `pdfBuffer` is retained for the legacy n8n PDF flow only; new flows write
// `agentInput` + `finalReport` and ignore the buffer.
const generativeReportSchema = new mongoose.Schema({
	patientId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'User',
		required: true,
		index: true
	},
	jobId: {
		type: String,
		default: null,
		index: true,
		sparse: true
	},
	status: {
		type: String,
		default: null
	},
	// The psymatch.agent_input.v1 payload — what the agent receives. Stored
	// verbatim so a re-run never has to recompute the patient snapshot.
	agentInput: {
		type: mongoose.Schema.Types.Mixed,
		default: null
	},
	// Per-request snapshot of the reversible PHI token map used to redact the
	// case before dispatch and to de-tokenize the returned report/SoT. Built
	// from the patient's AI redaction profile (searchReplace) at dispatch time.
	// Entries: { code, token, desc, category, find, value }.
	redCodeMap: {
		type: mongoose.Schema.Types.Mixed,
		default: null
	},
	// Final 10-section markdown produced by the agent. Written by the agent on
	// success (status='successful'). Read by the Vercel admin UI to render/
	// download the report.
	finalReport: {
		type: String,
		default: null
	},
	// Set by the agent when status='failed'; or by Vercel on dispatch failure.
	agentError: {
		type: String,
		default: null
	},
	// Per-run LLM cost summary written by the agent on success:
	// { totalUsd, currency, inputTokens, outputTokens, callCount, calls[], pricingVersion, computedAt }.
	cost: {
		type: mongoose.Schema.Types.Mixed,
		default: null
	},
	// Guard so this run's cost is folded into User.patientProfile.aiCost
	// exactly once (the agent flips it true atomically before the rollup).
	costRolledUp: {
		type: Boolean,
		default: false
	},
	// Legacy: only used by the n8n PDF webhook path in /api/generative-summary.
	// New flows leave this null.
	pdfBuffer: {
		type: Buffer,
		default: null
	},
	createdAt: {
		type: Date,
		default: Date.now
	},
	updatedAt: {
		type: Date,
		default: Date.now
	},
	completedAt: {
		type: Date,
		default: null
	},
	failedAt: {
		type: Date,
		default: null
	}
});

generativeReportSchema.pre('save', function (next) {
	this.updatedAt = new Date();
	next();
});

// Migration Schema - Tracks which migrations have been executed
const migrationSchema = new mongoose.Schema({
	name: {
		type: String,
		required: true,
		unique: true
	},
	executedAt: {
		type: Date,
		default: Date.now
	},
	status: {
		type: String,
		enum: ['completed', 'failed'],
		default: 'completed'
	},
	details: {
		type: String
	}
});

// Questionnaire Order Schema - Manages the display order of questionnaires in reports
const questionnaireOrderSchema = new mongoose.Schema({
	// Array of all test_codes in desired display order
	// The array position determines the order (index 0 = first, index 1 = second, etc.)
	orderedTestCodes: [
		{
			type: String,
			required: true
		}
	],
	// Track who last updated the ordering (null for auto-sync updates)
	lastUpdatedBy: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'User',
		required: false
	},
	// Track when the ordering was last updated
	lastUpdatedAt: {
		type: Date,
		default: Date.now
	}
});

// Add index for efficient queries
questionnaireOrderSchema.index({ lastUpdatedAt: -1 });

// Set Schema - Groups multiple questionnaires (interviews) into named sets
const setSchema = new mongoose.Schema(
	{
		set_name: {
			type: String,
			required: true,
			unique: true,
			trim: true
		},
		status: {
			type: String,
			enum: ['active', 'disabled'],
			default: 'active',
			required: true
		},
		interviews: [
			{
				type: mongoose.Schema.Types.ObjectId,
				ref: 'Questionnaire'
			}
		]
	},
	{
		timestamps: true
	}
);

setSchema.index({ status: 1 });
setSchema.index({ set_name: 1 });
setSchema.index({ interviews: 1 });

// Legal Schema — markdown-bearing docs shipped by PsyMatch: the TOS body and
// the four jurisdiction footers. Discriminated by `type`. Privacy officer and
// the active-jurisdiction pointer live in their own collections (see below).
const legalSchema = new mongoose.Schema(
	{
		type: {
			type: String,
			enum: ['tos', 'jurisdiction'],
			required: true
		},
		jurisdictionKey: { type: String, index: true, sparse: true }, // jurisdiction rows only
		jurisdictionLabel: {
			en: { type: String, default: '' },
			fr: { type: String, default: '' }
		},
		content: {
			en: { type: String, default: '' },
			fr: { type: String, default: '' }
		},
		version: { type: Number, default: 1 },
		updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
		updatedAt: { type: Date, default: Date.now },
		createdAt: { type: Date, default: Date.now }
	},
	{ collection: 'legal' }
);

// Singleton: at most one TOS doc.
legalSchema.index(
	{ type: 1 },
	{ unique: true, partialFilterExpression: { type: 'tos' } }
);
// One row per jurisdictionKey.
legalSchema.index(
	{ type: 1, jurisdictionKey: 1 },
	{ unique: true, partialFilterExpression: { type: 'jurisdiction' } }
);

legalSchema.pre('save', function (next) {
	this.updatedAt = new Date();
	next();
});

// Privacy Officer Schema — structured contact card (single doc). English-only.
const privacyOfficerSchema = new mongoose.Schema(
	{
		key: { type: String, default: 'singleton', unique: true },
		name: { type: String, default: '' },
		email: { type: String, default: '' },
		phone: { type: String, default: '' },
		mailingAddress: { type: String, default: '' },
		version: { type: Number, default: 1 },
		updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
		updatedAt: { type: Date, default: Date.now },
		createdAt: { type: Date, default: Date.now }
	},
	{ collection: 'privacy_officer' }
);

privacyOfficerSchema.pre('save', function (next) {
	this.updatedAt = new Date();
	next();
});

// Active Jurisdiction Schema — pointer (single doc) naming the active jurisdictionKey.
const activeJurisdictionSchema = new mongoose.Schema(
	{
		key: { type: String, default: 'singleton', unique: true },
		value: { type: String, default: 'ontario' },
		version: { type: Number, default: 1 },
		updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
		updatedAt: { type: Date, default: Date.now },
		createdAt: { type: Date, default: Date.now }
	},
	{ collection: 'active_jurisdiction' }
);

activeJurisdictionSchema.pre('save', function (next) {
	this.updatedAt = new Date();
	next();
});

// Check if models exist before creating them
export const User = mongoose.models.User || mongoose.model('User', userSchema);
export const Legal = mongoose.models.Legal || mongoose.model('Legal', legalSchema);
export const PrivacyOfficer =
	mongoose.models.PrivacyOfficer || mongoose.model('PrivacyOfficer', privacyOfficerSchema);
export const ActiveJurisdiction =
	mongoose.models.ActiveJurisdiction ||
	mongoose.model('ActiveJurisdiction', activeJurisdictionSchema);
export const Questionnaire =
	mongoose.models.Questionnaire || mongoose.model('Questionnaire', questionnaireSchema);
export const Assignment =
	mongoose.models.Assignment || mongoose.model('Assignment', testAssignmentSchema);
export const Response = mongoose.models.Response || mongoose.model('Response', responseSchema);
export const Status = mongoose.models.Status || mongoose.model('Status', statusSchema);
export const Followup = mongoose.models.Followup || mongoose.model('Followup', followupSchema);
export const GenerativeReport =
	mongoose.models.GenerativeReport || mongoose.model('GenerativeReport', generativeReportSchema);
export const Migration = mongoose.models.Migration || mongoose.model('Migration', migrationSchema);
export const QuestionnaireOrder =
	mongoose.models.QuestionnaireOrder ||
	mongoose.model('QuestionnaireOrder', questionnaireOrderSchema);
export const Set = mongoose.models.Set || mongoose.model('Set', setSchema);
