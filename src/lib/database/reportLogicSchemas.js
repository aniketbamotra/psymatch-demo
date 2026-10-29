import mongoose from 'mongoose';

// Multilingual text schema - only supports object format
const multilingualTextSchema = new mongoose.Schema(
	{
		en: { type: String, required: true },
		fr: { type: String, required: true }
		// Add more languages as needed
	},
	{ _id: false, strict: false }
);

// Core types for basic elements
export const questionReferenceSchema = new mongoose.Schema(
	{
		type: {
			type: String,
			enum: ['question'],
			required: true
		},
		value: {
			type: String,
			required: true
		},
		test_code: String // Optional test_code for cross-test references
	},
	{ _id: false }
);

export const variableReferenceSchema = new mongoose.Schema(
	{
		type: {
			type: String,
			enum: ['variable'],
			required: true
		},
		value: {
			type: String,
			required: true
		},
		test_code: String
	},
	{ _id: false }
);

export const criterionReferenceSchema = new mongoose.Schema(
	{
		type: {
			type: String,
			enum: ['criterion'],
			required: true
		},
		value: {
			type: String,
			required: true
		},
		test_code: String
	},
	{ _id: false }
);

export const numericalValueSchema = new mongoose.Schema(
	{
		type: {
			type: String,
			enum: ['numerical'],
			required: true
		},
		value: {
			type: Number,
			required: true
		}
	},
	{ _id: false }
);

const thresholdSchema = new mongoose.Schema(
	{
		min: Number,
		max: Number,
		value: {
			type: String,
			required: true
		},
		default: String
	},
	{ _id: false }
);

export const rangeOperationSchema = new mongoose.Schema(
	{
		type: {
			type: String,
			enum: ['range'],
			required: true
		},
		start: {
			type: String,
			required: true
		},
		end: {
			type: String,
			required: true
		},
		test_code: String,
		operator: {
			type: String,
			enum: ['count_positive', 'count_all', 'count_range'],
			required: true
		},
		thresholds: [thresholdSchema]
	},
	{ _id: false }
);

// Operation schemas
export const operationSchema = new mongoose.Schema(
	{
		left_operand: {
			type: mongoose.Schema.Types.Mixed,
			required: true
		},
		operator: {
			type: String,
			enum: ['>', '<', '>=', '<=', '==', '!=', '&&', '||', '+', '-', '*', '/'],
			required: true
		},
		right_operand: {
			type: mongoose.Schema.Types.Mixed,
			required: true
		},
		thresholds: [thresholdSchema]
	},
	{ _id: false }
);

export const multiOperationSchema = new mongoose.Schema(
	{
		operator: {
			type: String,
			enum: ['+', '-', '*', '/'],
			required: true
		},
		operands: [
			{
				type: mongoose.Schema.Types.Mixed,
				required: true
			}
		]
	},
	{ _id: false }
);

// Variable definition
const variableSchema = new mongoose.Schema(
	{
		name: {
			type: String,
			required: true
		},
		operation: {
			type: mongoose.Schema.Types.Mixed,
			required: true
		}
	},
	{ _id: false }
);

// Criterion definition
const criterionSchema = new mongoose.Schema(
	{
		id: {
			type: String,
			required: true
		},
		operation: {
			type: mongoose.Schema.Types.Mixed,
			required: true
		}
	},
	{ _id: false }
);

// Report section content types
const singleWordSchema = new mongoose.Schema(
	{
		operation: {
			type: mongoose.Schema.Types.Mixed,
			required: true
		},
		text: {
			type: multilingualTextSchema,
			required: true
		}
	},
	{ _id: false }
);

const bulletPointSchema = new mongoose.Schema(
	{
		operation: {
			type: mongoose.Schema.Types.Mixed
		},
		text: {
			type: multilingualTextSchema
		},
		text_after: {
			type: multilingualTextSchema
		},
		single_word: [singleWordSchema],
		continued: Boolean,
		addPeriod: Boolean,
		summary: Boolean
	},
	{ _id: false }
);

const reportSectionSchema = new mongoose.Schema(
	{
		heading: {
			type: multilingualTextSchema
		},
		text: {
			type: multilingualTextSchema
		},
		bullet_points: [bulletPointSchema],
		single_word: [singleWordSchema],
		continued: Boolean,
		italic: Boolean,
		summary: Boolean,
		addPeriod: Boolean,
		bold: Boolean,
		onlySummary: Boolean
	},
	{ _id: false }
);

// Outcome definition
const outcomeSchema = new mongoose.Schema(
	{
		type: {
			type: String,
			required: true
		},
		operation: {
			type: mongoose.Schema.Types.Mixed,
			required: true
		},
		report_sections: [reportSectionSchema]
	},
	{ _id: false }
);

// Main report logic schema
const reportLogicSchema = new mongoose.Schema({
	questionnaire: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'Questionnaire',
		required: true
	},
	test_evaluation: {
		variables: [variableSchema],
		criteria: [criterionSchema],
		report_title: {
			type: multilingualTextSchema,
			required: true
		},
		outcomes: [outcomeSchema]
	}
});

// Export models
export const ReportLogic =
	mongoose.models.ReportLogic || mongoose.model('ReportLogic', reportLogicSchema);

/**
 * Get report logic by questionnaire ID
 */
export async function getReportLogic(questionnaireId) {
	try {
		const reportLogic = await ReportLogic.findOne({
			questionnaire: questionnaireId
		}).lean();

		if (!reportLogic) {
			console.error(`No report logic found for questionnaire: ${questionnaireId}`);
			return null;
		}

		return reportLogic.test_evaluation;
	} catch (error) {
		console.error(`Error fetching report logic for ${questionnaireId}:`, error);
		return null;
	}
}
