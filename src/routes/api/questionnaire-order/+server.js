import { json } from '@sveltejs/kit';
import { Questionnaire, QuestionnaireOrder, User } from '$lib/database/schemas.js';

// Hardcoded locked test codes - these will always appear first and cannot be reordered
const LOCKED_TEST_CODES = ['THERAPIST_MATCH'];

/**
 * Check if a test code is locked
 */
function isLocked(testCode) {
	return LOCKED_TEST_CODES.includes(testCode);
}

/**
 * Ensures locked tests are always at the beginning in the correct order
 * Removes locked tests from their current position and places them at the start
 */
function enforceLockedTestsOrder(orderedTestCodes) {
	// Separate locked and non-locked tests
	const lockedTests = [];
	const nonLockedTests = [];

	for (const testCode of orderedTestCodes) {
		if (isLocked(testCode)) {
			lockedTests.push(testCode);
		} else {
			nonLockedTests.push(testCode);
		}
	}

	// Sort locked tests according to LOCKED_TEST_CODES order
	const sortedLockedTests = LOCKED_TEST_CODES.filter((tc) => lockedTests.includes(tc));

	// Return locked tests first, then non-locked
	return [...sortedLockedTests, ...nonLockedTests];
}

/**
 * Initialize questionnaire ordering with smart defaults
 * Locked tests come first (in LOCKED_TEST_CODES order), then reorderable tests alphabetically
 */
async function initializeOrdering(validTestCodes, userId) {
	const allTestCodes = Array.from(validTestCodes);

	// Separate locked and reorderable tests
	const reorderableTests = allTestCodes.filter((tc) => !isLocked(tc)).sort();

	// Locked tests first (in LOCKED_TEST_CODES order), then reorderable
	const orderedTestCodes = [
		...LOCKED_TEST_CODES.filter((tc) => validTestCodes.has(tc)), // Only include locked tests that exist
		...reorderableTests
	];

	return await QuestionnaireOrder.create({
		orderedTestCodes,
		lastUpdatedBy: userId,
		lastUpdatedAt: new Date()
	});
}

/**
 * GET /api/questionnaire-order
 * Fetch the current questionnaire ordering
 * - Auto-initializes if doesn't exist
 * - Auto-syncs with current questionnaires (removes deleted, appends new)
 * - Returns array with isLocked flags
 */
export async function GET({ locals }) {
	// Authorization check - only admins can access
	if (!locals.user || locals.user.userType !== 'admin') {
		return json({ error: 'Unauthorized' }, { status: 403 });
	}

	try {
		// Fetch all questionnaires from database
		const allQuestionnaires = await Questionnaire.find({}, 'test_code title').lean();
		const questionnaireMap = new Map(allQuestionnaires.map((q) => [q.test_code, q.title]));
		const validTestCodes = new Set(questionnaireMap.keys());

		// Fetch ordering document
		let orderDoc = await QuestionnaireOrder.findOne();

		if (!orderDoc) {
			// INITIALIZE: No ordering exists, create default
			orderDoc = await initializeOrdering(validTestCodes, locals.user._id);
		} else {
			// SYNC: Ordering exists, synchronize with current questionnaires

			// Remove test_codes that no longer exist
			const existingValid = orderDoc.orderedTestCodes.filter((tc) => validTestCodes.has(tc));

			// Find new test_codes not in current ordering
			const existingSet = new Set(existingValid);
			const newTestCodes = Array.from(validTestCodes)
				.filter((tc) => !existingSet.has(tc))
				.sort();

			// Append new tests at the end
			const synced = [...existingValid, ...newTestCodes];

			// Update if changed
			if (JSON.stringify(synced) !== JSON.stringify(orderDoc.orderedTestCodes)) {
				orderDoc.orderedTestCodes = synced;
				orderDoc.lastUpdatedAt = new Date();
				// Note: Don't update lastUpdatedBy for auto-sync
				await orderDoc.save();
			}
		}

		// ENFORCE: Ensure locked tests are at the beginning (safety check)
		const enforcedOrder = enforceLockedTestsOrder(orderDoc.orderedTestCodes);

		// If order was corrected, save it
		if (JSON.stringify(enforcedOrder) !== JSON.stringify(orderDoc.orderedTestCodes)) {
			orderDoc.orderedTestCodes = enforcedOrder;
			orderDoc.lastUpdatedAt = new Date();
			await orderDoc.save();
		}

		// Build response with enforced order
		const orderedQuestionnaires = enforcedOrder.map((testCode) => ({
			test_code: testCode,
			test_name: questionnaireMap.get(testCode) || 'Unknown Test',
			isLocked: isLocked(testCode)
		}));

		// Fetch user info for lastUpdatedBy
		let updatedByUser = null;
		if (orderDoc.lastUpdatedBy) {
			updatedByUser = await User.findById(orderDoc.lastUpdatedBy, 'fullName').lean();
		}

		return json({
			orderedQuestionnaires,
			lockedCount: orderedQuestionnaires.filter((q) => q.isLocked).length,
			lastUpdatedBy: updatedByUser ? { fullName: updatedByUser.fullName } : null,
			lastUpdatedAt: orderDoc.lastUpdatedAt
		});
	} catch (error) {
		console.error('Error fetching questionnaire order:', error);
		return json(
			{
				error: 'Failed to fetch questionnaire order',
				details: error.message
			},
			{ status: 500 }
		);
	}
}

/**
 * PATCH /api/questionnaire-order
 * Update the questionnaire ordering
 * - Only directors can update
 * - Validates all test codes exist
 * - Validates no duplicates
 * - Validates all tests are included
 */
export async function PATCH({ request, locals }) {
	// Only directors can reorder
	if (!locals.user || !locals.user.isDirector) {
		return json(
			{
				error: 'Only directors can reorder questionnaires'
			},
			{ status: 403 }
		);
	}

	try {
		const { orderedTestCodes } = await request.json();

		// Validate input
		if (!Array.isArray(orderedTestCodes)) {
			return json(
				{
					error: 'orderedTestCodes must be an array'
				},
				{ status: 400 }
			);
		}

		if (orderedTestCodes.length === 0) {
			return json(
				{
					error: 'orderedTestCodes cannot be empty'
				},
				{ status: 400 }
			);
		}

		// Validate all test_codes exist in database
		const allQuestionnaires = await Questionnaire.find({}, 'test_code title').lean();
		const questionnaireMap = new Map(allQuestionnaires.map((q) => [q.test_code, q.title]));
		const validTestCodes = new Set(questionnaireMap.keys());

		const invalidTests = orderedTestCodes.filter((tc) => !validTestCodes.has(tc));
		if (invalidTests.length > 0) {
			return json(
				{
					error: 'Invalid test codes',
					invalidTests
				},
				{ status: 400 }
			);
		}

		// Validate no duplicates
		const uniqueTests = new Set(orderedTestCodes);
		if (uniqueTests.size !== orderedTestCodes.length) {
			return json(
				{
					error: 'Duplicate test codes found'
				},
				{ status: 400 }
			);
		}

		// Validate all existing tests are included
		if (uniqueTests.size !== validTestCodes.size) {
			const missingTests = Array.from(validTestCodes).filter((tc) => !uniqueTests.has(tc));
			return json(
				{
					error: 'All questionnaires must be included in the order',
					missingTests
				},
				{ status: 400 }
			);
		}

		// ENFORCE: Locked tests must be at the beginning
		const enforcedOrder = enforceLockedTestsOrder(orderedTestCodes);

		// Update ordering with enforced order
		let orderDoc = await QuestionnaireOrder.findOne();

		if (!orderDoc) {
			orderDoc = new QuestionnaireOrder({
				orderedTestCodes: enforcedOrder,
				lastUpdatedBy: locals.user._id,
				lastUpdatedAt: new Date()
			});
		} else {
			orderDoc.orderedTestCodes = enforcedOrder;
			orderDoc.lastUpdatedBy = locals.user._id;
			orderDoc.lastUpdatedAt = new Date();
		}

		await orderDoc.save();

		// Return updated list with enforced order (same format as GET)
		const orderedQuestionnaires = enforcedOrder.map((testCode) => ({
			test_code: testCode,
			test_name: questionnaireMap.get(testCode) || 'Unknown Test',
			isLocked: isLocked(testCode)
		}));

		return json({
			orderedQuestionnaires,
			lockedCount: orderedQuestionnaires.filter((q) => q.isLocked).length,
			lastUpdatedBy: { fullName: locals.user.fullName },
			lastUpdatedAt: orderDoc.lastUpdatedAt
		});
	} catch (error) {
		console.error('Error updating questionnaire order:', error);
		return json(
			{
				error: 'Failed to update questionnaire order',
				details: error.message
			},
			{ status: 500 }
		);
	}
}
