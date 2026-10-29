import { connectToDatabase } from './connection.js';
import { Response, Assignment, Questionnaire, Status } from './schemas.js';
/**
 * Get questionnaire results by assignment ID
 */
export async function getQuestionnaireResults(assignmentId) {
	try {
		if (!assignmentId) {
			throw new Error('Assignment ID is required');
		}

		// Ensure database connection
		await connectToDatabase();

		const result = await Response.findOne({ assignmentId }).lean();

		if (!result) {
			console.log('No results found for assignment:', assignmentId);
			return null;
		}

		console.log('Found results for assignment:', {
			assignmentId,
			responseCount: Object.keys(result.responses || {}).length
		});

		return result;
	} catch (error) {
		console.error('Error fetching questionnaire results:', error);
		throw error;
	}
}

/**
 * Get questionnaire result for a specific user and test
 */
export async function getQuestionnaireResult(userId, testName) {
	try {
		if (!userId || !testName) {
			throw new Error('User ID and test name are required');
		}

		// Ensure database connection
		await connectToDatabase();

		// First find the questionnaire by title or test_code
		// Avoid querying 'title' directly with a string as it triggers CastError on embedded schema
		const questionnaire = await Questionnaire.findOne({
			$or: [{ test_code: testName }, { 'title.en': testName }]
		});

		if (!questionnaire) {
			console.log('No questionnaire found with title:', testName);
			return null;
		}

		// Then find the assignment using questionnaireId
		const assignment = await Assignment.findOne({
			patientId: userId,
			questionnaireId: questionnaire._id
		});

		if (!assignment) {
			console.log('No assignment found for user and questionnaire:', {
				userId,
				questionnaireId: questionnaire._id
			});
			return null;
		}

		// Finally get the response for this assignment
		const result = await Response.findOne({
			assignmentId: assignment._id
		}).lean();

		if (!result) {
			console.log('No results found for assignment:', assignment._id);
			return null;
		}

		console.log('Found results:', {
			userId,
			testName,
			questionnaireId: questionnaire._id,
			assignmentId: assignment._id,
			responseCount: result.responses?.length || 0
		});
		console.log(result);
		return result;
	} catch (error) {
		console.error('Error fetching questionnaire result:', error);
		throw error;
	}
}

/**
 * Save individual questionnaire response
 */
export async function saveQuestionnaireResult(userId, testName, questionId, answer) {
	try {
		if (!userId || !testName || !questionId || answer === undefined) {
			throw new Error('User ID, test name, question ID, and answer are required');
		}

		// Ensure database connection
		await connectToDatabase();

		// First find the questionnaire by title or test_code
		const questionnaire = await Questionnaire.findOne({
			$or: [{ test_code: testName }, { 'title.en': testName }]
		});

		if (!questionnaire) {
			throw new Error('No questionnaire found with title: ' + testName);
		}

		// Then find the assignment using questionnaireId
		const assignment = await Assignment.findOne({
			patientId: userId,
			questionnaireId: questionnaire._id
		});

		if (!assignment) {
			throw new Error('No assignment found for this user and questionnaire');
		}

		// Find or create a response document for this assignment
		let response = await Response.findOne({ assignmentId: assignment._id });

		if (!response) {
			response = new Response({
				assignmentId: assignment._id,
				responses: []
			});
		}

		// Check if this question already has an answer
		const existingResponseIndex = response.responses.findIndex((r) => r.questionId === questionId);

		if (existingResponseIndex !== -1) {
			// Update existing answer
			response.responses[existingResponseIndex].value = answer;
		} else {
			// Add new answer
			response.responses.push({
				questionId,
				value: answer
			});
		}

		// Save the updated response
		await response.save();

		// Sync assignment status after response saved
		await syncAssignmentStatus(assignment._id);

		console.log('Saved answer for question:', {
			userId,
			testName,
			questionnaireId: questionnaire._id,
			assignmentId: assignment._id,
			questionId,
			responseCount: response.responses.length
		});

		return response;
	} catch (error) {
		console.error('Error saving questionnaire result:', error);
		throw error;
	}
}

/**
 * Save questionnaire results
 */
export async function saveQuestionnaireResults(assignmentId, responses) {
	try {
		if (!assignmentId || !responses) {
			throw new Error('Assignment ID and responses are required');
		}

		// Ensure database connection
		await connectToDatabase();

		const result = await Response.findOneAndUpdate(
			{ assignmentId },
			{
				assignmentId,
				responses,
				updatedAt: new Date()
			},
			{
				upsert: true,
				new: true
			}
		);

		console.log('Saved results for assignment:', {
			assignmentId,
			responseCount: Object.keys(responses).length
		});

		return result;
	} catch (error) {
		console.error('Error saving questionnaire results:', error);
		throw error;
	}
}

/**
 * Delete questionnaire results
 */
export async function deleteQuestionnaireResults(assignmentId) {
	try {
		if (!assignmentId) {
			throw new Error('Assignment ID is required');
		}

		// Ensure database connection
		await connectToDatabase();

		const result = await Response.findOneAndDelete({ assignmentId });

		console.log('Deleted results for assignment:', assignmentId);

		return result;
	} catch (error) {
		console.error('Error deleting questionnaire results:', error);
		throw error;
	}
}

/**
 * Complete questionnaire and update assignment status
 */
/**
 * Clear responses ahead of a specific index
 */
export async function bulkClearResponsesAhead(userId, testName, currentIndex) {
	try {
		if (!userId || !testName || currentIndex === undefined) {
			throw new Error('User ID, test name, and current index are required');
		}

		// Ensure database connection
		await connectToDatabase();

		// Find the questionnaire by title
		const questionnaire = await Questionnaire.findOne({ title: testName });
		if (!questionnaire) {
			throw new Error('No questionnaire found with title: ' + testName);
		}

		// Find the assignment
		const assignment = await Assignment.findOne({
			patientId: userId,
			questionnaireId: questionnaire._id
		});
		if (!assignment) {
			throw new Error('No assignment found for this user and questionnaire');
		}

		// Find the response document
		const response = await Response.findOne({ assignmentId: assignment._id });
		if (!response || !response.responses.length) {
			// No responses to clear
			return null;
		}

		// Check if there are any responses ahead of current index
		const hasResponsesAhead = response.responses.some((r) => {
			const responseIndex = parseInt(r.questionId.substring(1));
			return responseIndex > currentIndex;
		});

		if (!hasResponsesAhead) {
			// No responses to clear
			return response;
		}

		// Filter out responses with questionId > currentIndex
		response.responses = response.responses.filter((r) => {
			const responseIndex = parseInt(r.questionId.substring(1));
			return responseIndex <= currentIndex;
		});

		// Save the updated response
		response.updatedAt = new Date();
		await response.save();

		// Sync assignment status after responses cleared
		await syncAssignmentStatus(assignment._id);

		console.log('Cleared responses ahead of index:', {
			userId,
			testName,
			currentIndex,
			remainingResponses: response.responses.length
		});

		return response;
	} catch (error) {
		console.error('Error clearing responses ahead:', error);
		throw error;
	}
}

/**
 * Sanitize response sequence (ensure no gaps)
 */
export async function sanitizeResponseSequence(userId, testName) {
	try {
		if (!userId || !testName) {
			throw new Error('User ID and test name are required');
		}

		// Ensure database connection
		await connectToDatabase();

		// Find the questionnaire by title
		const questionnaire = await Questionnaire.findOne({ title: testName });
		if (!questionnaire) {
			throw new Error('No questionnaire found with title: ' + testName);
		}

		// Find the assignment
		const assignment = await Assignment.findOne({
			patientId: userId,
			questionnaireId: questionnaire._id
		});
		if (!assignment) {
			throw new Error('No assignment found for this user and questionnaire');
		}

		// Find the response document
		const response = await Response.findOne({ assignmentId: assignment._id });
		if (!response || !response.responses.length) {
			// No responses to sanitize
			return null;
		}

		// Map all response indices
		const responseIndices = new Map();
		let highestIndex = 0;

		for (const resp of response.responses) {
			const index = parseInt(resp.questionId.substring(1));
			responseIndices.set(index, resp);
			highestIndex = Math.max(highestIndex, index);
		}

		// If only one response or no responses, no sanitization needed
		if (highestIndex <= 1) {
			return response;
		}

		// Check for gaps in sequence
		let firstGapIndex = null;
		for (let i = 1; i <= highestIndex; i++) {
			if (!responseIndices.has(i)) {
				firstGapIndex = i;
				break;
			}
		}

		// If no gap found, return unchanged
		if (firstGapIndex === null) {
			return response;
		}

		// Remove all responses from gap onwards
		const originalLength = response.responses.length;
		response.responses = response.responses.filter((r) => {
			const index = parseInt(r.questionId.substring(1));
			return index < firstGapIndex;
		});

		// Only save if changes were made
		if (response.responses.length !== originalLength) {
			response.updatedAt = new Date();
			await response.save();

			console.log('Sanitized response sequence:', {
				userId,
				testName,
				firstGapFound: firstGapIndex,
				before: originalLength,
				after: response.responses.length
			});
		}

		return response;
	} catch (error) {
		console.error('Error sanitizing response sequence:', error);
		throw error;
	}
}

export async function completeQuestionnaire(userId, testName) {
	try {
		if (!userId || !testName) {
			throw new Error('User ID and test name are required');
		}

		// Ensure database connection
		await connectToDatabase();

		// First find the questionnaire by test code (or English title)
		const questionnaire = await Questionnaire.findOne({
			$or: [{ test_code: testName }, { 'title.en': testName }]
		});

		if (!questionnaire) {
			throw new Error('No questionnaire found with title: ' + testName);
		}

		// Find the assignment
		const assignment = await Assignment.findOne({
			patientId: userId,
			questionnaireId: questionnaire._id
		});

		if (!assignment) {
			throw new Error('No assignment found for this user and questionnaire');
		}

		// Validate before marking complete
		const syncResult = await syncAssignmentStatus(assignment._id);

		if (syncResult.status !== 'completed') {
			throw new Error(
				`Cannot complete questionnaire: Assignment status is ${syncResult.status}. ` +
					`All questions must be answered.`
			);
		}

		// Status already set to 'completed' by syncAssignmentStatus
		// Just update Response timestamp
		await Response.findOneAndUpdate({ assignmentId: assignment._id }, { submittedAt: new Date() });

		console.log('Completed questionnaire:', {
			userId,
			testName,
			assignmentId: assignment._id
		});

		return { assignment };
	} catch (error) {
		console.error('Error completing questionnaire:', error);
		throw error;
	}
}

/**
 * Synchronizes Assignment status based on Response completeness
 * This is the SINGLE SOURCE OF TRUTH for assignment status
 *
 * @param {ObjectId} assignmentId - The assignment to sync
 * @returns {Object} { changed: boolean, oldStatus: string, newStatus: string }
 */
export async function syncAssignmentStatus(assignmentId) {
	const timings = {};
	const startTime = Date.now();

	try {
		// 1. Get assignment with questionnaire
		const t1 = Date.now();
		const assignment = await Assignment.findById(assignmentId).populate('questionnaireId');
		timings.findAssignment = Date.now() - t1;

		if (!assignment) {
			throw new Error(`Assignment ${assignmentId} not found`);
		}

		// 2. Check if questionnaire was deleted
		if (!assignment.questionnaireId) {
			if (assignment.status !== 'removed') {
				// First time marking as removed
				assignment.status = 'removed';

				const t2 = Date.now();
				await assignment.save();
				timings.saveAssignment = Date.now() - t2;

				// Remove from Status.assignmentIds array
				const t3 = Date.now();
				await Status.updateOne(
					{ assignmentIds: assignmentId },
					{ $pull: { assignmentIds: assignmentId } }
				);
				timings.updateStatus = Date.now() - t3;

				// Update patient status
				const t4 = Date.now();
				await updatePatientStatus(assignment.patientId);
				timings.updatePatient = Date.now() - t4;

				timings.total = Date.now() - startTime;
				console.log(
					`⚠️ Assignment ${assignmentId} marked as removed (questionnaire deleted) [${timings.total}ms]`
				);
				return { changed: true, status: 'removed', timings };
			}

			// Already removed - ensure it's cleaned from Status.assignmentIds
			const t2 = Date.now();
			await Status.updateOne(
				{ assignmentIds: assignmentId },
				{ $pull: { assignmentIds: assignmentId } }
			);
			timings.updateStatus = Date.now() - t2;
			timings.total = Date.now() - startTime;

			// No change needed
			return { changed: false, status: 'removed', timings };
		}

		// 3. Get response data
		const t2 = Date.now();
		const response = await Response.findOne({ assignmentId });
		timings.findResponse = Date.now() - t2;

		const totalQuestions = assignment.questionnaireId.questions.length;
		const responseCount = response?.responses?.length || 0;

		// 3. Determine correct status based on Response data
		const t3 = Date.now();
		let correctStatus;

		// Only preserve 'downloaded' status if assignment is actually complete
		if (assignment.status === 'downloaded' && responseCount === totalQuestions) {
			// Downloaded status is only valid for complete assignments
			correctStatus = 'downloaded';
		} else if (responseCount === 0) {
			correctStatus = 'not_started';
		} else if (responseCount < totalQuestions) {
			correctStatus = 'in_progress';
		} else if (responseCount === totalQuestions) {
			correctStatus = 'completed';
		}
		timings.calculateStatus = Date.now() - t3;

		// 4. Update if status changed
		if (correctStatus !== assignment.status) {
			const oldStatus = assignment.status;
			assignment.status = correctStatus;

			// Set/clear timestamps
			if (correctStatus === 'completed') {
				assignment.completedAt = assignment.completedAt || new Date();
			} else {
				assignment.completedAt = null;
			}

			const t4 = Date.now();
			await assignment.save();
			timings.saveAssignment = Date.now() - t4;

			// 5. Update patient Status collection
			const t5 = Date.now();
			// Force update because assignment status changed (activity detected)
			await updatePatientStatus(assignment.patientId, true);
			timings.updatePatient = Date.now() - t5;

			timings.total = Date.now() - startTime;
			console.log(
				`✅ Assignment ${assignmentId} synced: ${oldStatus} → ${correctStatus} [${timings.total}ms: find=${timings.findAssignment}ms, resp=${timings.findResponse}ms, save=${timings.saveAssignment}ms, patient=${timings.updatePatient}ms]`
			);
			return { changed: true, oldStatus, newStatus: correctStatus, status: correctStatus, timings };
		}

		timings.total = Date.now() - startTime;
		return { changed: false, status: correctStatus, timings };
	} catch (error) {
		timings.total = Date.now() - startTime;
		console.error(`❌ Error syncing assignment ${assignmentId}:`, error);
		throw error;
	}
}

/**
 * Updates patient Status based on all their assignments
 * Determines overall patient state from assignment states
 *
 * @param {ObjectId} userId - The patient user ID
 * @param {boolean} forceUpdate - Whether to force an update even if inactive (e.g. on new allocation)
 * @returns {Object} { changed: boolean } - Whether the status was actually updated
 */
export async function updatePatientStatus(userId, forceUpdate = false) {
	const timings = {};
	const startTime = Date.now();

	try {
		// 1. Find status
		const t1 = Date.now();
		const status = await Status.findOne({ patientId: userId });
		timings.findStatus = Date.now() - t1;

		if (!status) {
			console.warn(`⚠️ No Status record found for patient ${userId}`);
			return { changed: false, timings };
		}

		// 2. Get all assignments for this patient (excluding removed)
		const t2 = Date.now();
		const assignments = await Assignment.find({
			_id: { $in: status.assignmentIds },
			status: { $ne: 'removed' } // Ignore removed assignments
		}).populate('questionnaireId');
		timings.findAssignments = Date.now() - t2;

		if (assignments.length === 0) {
			// No active assignments, keep as onboarded
			timings.total = Date.now() - startTime;
			return { changed: false, timings };
		}

		// 3. Analyze assignment states (in-memory, fast)
		const t3 = Date.now();
		const hasNotStarted = assignments.some((a) => a.status === 'not_started');
		const hasInProgress = assignments.some((a) => a.status === 'in_progress');
		const hasCompleted = assignments.some(
			(a) => a.status === 'completed' || a.status === 'downloaded'
		);
		const allCompleted =
			assignments.length > 0 &&
			assignments.every((a) => a.status === 'completed' || a.status === 'downloaded');

		// Determine correct patient status
		// Priority order: completed > active > onboarded
		let newPatientStatus = status.status;

		if (!forceUpdate && status.status === 'inactive') {
			// Preserve inactive status if already set (and not forced to update)
			newPatientStatus = 'inactive';
		} else if (allCompleted) {
			// ALL assignments are completed or downloaded
			newPatientStatus = 'completed';
		} else if (hasInProgress || hasCompleted) {
			// At least one in progress OR at least one completed (but not all)
			// Patient is actively working through assignments
			newPatientStatus = 'active';
		} else if (hasNotStarted) {
			// ALL assignments are not_started (no progress made yet)
			newPatientStatus = 'onboarded';
		}
		timings.calculateStatus = Date.now() - t3;

		// 4. Update if changed
		if (newPatientStatus !== status.status) {
			const oldStatus = status.status;
			status.status = newPatientStatus;
			status.lastActivity = new Date();

			const t4 = Date.now();
			await status.save();
			timings.saveStatus = Date.now() - t4;

			timings.total = Date.now() - startTime;
			console.log(
				`✅ Patient ${userId} status updated: ${oldStatus} → ${newPatientStatus} [${timings.total}ms: findStatus=${timings.findStatus}ms, findAssignments=${timings.findAssignments}ms, save=${timings.saveStatus}ms]`
			);
			return { changed: true, timings };
		}

		timings.total = Date.now() - startTime;
		return { changed: false, timings };
	} catch (error) {
		timings.total = Date.now() - startTime;
		console.error(`❌ Error updating patient status for ${userId}:`, error);
		throw error;
	}
}

/**
 * Validates and syncs assignment during read operations
 * This enables "self-healing" - reads auto-correct inconsistencies
 *
 * @param {ObjectId} assignmentId - The assignment to validate
 * @returns {Object} Sync result
 */
export async function validateAndSyncAssignment(assignmentId) {
	try {
		const syncResult = await syncAssignmentStatus(assignmentId);

		if (syncResult.changed) {
			console.log(`🔧 Auto-corrected assignment ${assignmentId} during read`);
		}

		return syncResult;
	} catch (error) {
		console.error(`❌ Error validating assignment ${assignmentId}:`, error);
		// Don't throw - allow read to continue even if sync fails
		return { changed: false, error: error.message };
	}
}

/**
 * OPTIMIZED: Bulk sync assignments using aggregation pipeline
 * Uses MongoDB aggregation to fetch all data in minimal queries
 *
 * @param {Array<ObjectId>} assignmentIds - Array of assignment IDs to sync
 * @returns {Object} Results with synced count and timing breakdown
 */
export async function batchSyncAssignmentsOptimized(assignmentIds) {
	console.time('⏱️ batchSyncAssignmentsOptimized (total)');

	const results = {
		synced: 0,
		errors: [],
		timings: {}
	};

	if (!assignmentIds || assignmentIds.length === 0) {
		console.timeEnd('⏱️ batchSyncAssignmentsOptimized (total)');
		return results;
	}

	console.log(`📊 Processing ${assignmentIds.length} assignments using OPTIMIZED aggregation`);

	try {
		// ============================================================
		// QUERY 1: Get all assignment data with counts using aggregation
		// ============================================================
		console.time('⏱️ Query 1: Fetch all assignment data (aggregation)');

		const assignmentData = await Assignment.aggregate([
			{ $match: { _id: { $in: assignmentIds } } },
			{
				$lookup: {
					from: 'questionnaires',
					localField: 'questionnaireId',
					foreignField: '_id',
					as: 'questionnaire',
					pipeline: [{ $project: { questionCount: { $size: '$questions' } } }]
				}
			},
			{
				$lookup: {
					from: 'responses',
					localField: '_id',
					foreignField: 'assignmentId',
					as: 'response',
					pipeline: [{ $project: { responseCount: { $size: '$responses' } } }]
				}
			},
			{
				$project: {
					_id: 1,
					patientId: 1,
					questionnaireId: 1,
					status: 1,
					questionCount: {
						$ifNull: [{ $arrayElemAt: ['$questionnaire.questionCount', 0] }, 0]
					},
					responseCount: {
						$ifNull: [{ $arrayElemAt: ['$response.responseCount', 0] }, 0]
					}
				}
			}
		]);

		results.timings.fetchData = Date.now();
		console.timeEnd('⏱️ Query 1: Fetch all assignment data (aggregation)');
		console.log(`📊 Fetched ${assignmentData.length} assignments with counts`);

		// ============================================================
		// IN-MEMORY: Calculate statuses (instant)
		// ============================================================
		console.time('⏱️ Calculate statuses (in-memory)');

		const updates = [];
		const patientIdsToUpdate = new Set();

		for (const assignment of assignmentData) {
			let correctStatus;

			// Only preserve 'downloaded' status if assignment is actually complete
			if (
				assignment.status === 'downloaded' &&
				assignment.responseCount === assignment.questionCount
			) {
				correctStatus = 'downloaded';
			} else if (assignment.responseCount === 0) {
				correctStatus = 'not_started';
			} else if (assignment.responseCount < assignment.questionCount) {
				correctStatus = 'in_progress';
			} else if (assignment.responseCount === assignment.questionCount) {
				correctStatus = 'completed';
			}

			if (correctStatus !== assignment.status) {
				updates.push({
					updateOne: {
						filter: { _id: assignment._id },
						update: {
							$set: {
								status: correctStatus,
								completedAt: correctStatus === 'completed' ? new Date() : null
							}
						}
					}
				});
				patientIdsToUpdate.add(assignment.patientId.toString());
			}
		}

		results.timings.calculateStatuses = Date.now();
		console.timeEnd('⏱️ Calculate statuses (in-memory)');
		console.log(`📊 Found ${updates.length} assignments to update`);

		// ============================================================
		// QUERY 2: Bulk update assignments (1 query for all)
		// ============================================================
		if (updates.length > 0) {
			console.time('⏱️ Query 2: Bulk update assignments');
			await Assignment.bulkWrite(updates);
			results.timings.bulkUpdate = Date.now();
			console.timeEnd('⏱️ Query 2: Bulk update assignments');
			console.log(`✅ Updated ${updates.length} assignments`);
			results.synced = updates.length;
		}

		// ============================================================
		// QUERY 3-4: Update patient statuses (if needed)
		// ============================================================
		if (patientIdsToUpdate.size > 0) {
			console.time('⏱️ Query 3-4: Update patient statuses');

			const patientData = await Status.aggregate([
				{ $match: { patientId: { $in: Array.from(patientIdsToUpdate).map((id) => id) } } },
				{
					$lookup: {
						from: 'assignments',
						let: { assignmentIds: '$assignmentIds' },
						pipeline: [
							{
								$match: {
									$expr: {
										$and: [{ $in: ['$_id', '$$assignmentIds'] }, { $ne: ['$status', 'removed'] }]
									}
								}
							},
							{ $project: { status: 1 } }
						],
						as: 'assignments'
					}
				},
				{
					$project: {
						_id: 1,
						patientId: 1,
						currentStatus: '$status',
						hasNotStarted: { $in: ['not_started', '$assignments.status'] },
						hasInProgress: { $in: ['in_progress', '$assignments.status'] },
						hasCompleted: {
							$or: [
								{ $in: ['completed', '$assignments.status'] },
								{ $in: ['downloaded', '$assignments.status'] }
							]
						},
						allCompleted: {
							$and: [
								{ $gt: [{ $size: '$assignments' }, 0] },
								{
									$allElementsTrue: [
										{
											$map: {
												input: '$assignments',
												as: 'a',
												in: {
													$or: [
														{ $eq: ['$$a.status', 'completed'] },
														{ $eq: ['$$a.status', 'downloaded'] }
													]
												}
											}
										}
									]
								}
							]
						}
					}
				}
			]);

			const patientUpdates = [];
			for (const patient of patientData) {
				let newStatus;
				if (patient.allCompleted) newStatus = 'completed';
				else if (patient.hasInProgress || patient.hasCompleted) newStatus = 'active';
				else if (patient.hasNotStarted) newStatus = 'onboarded';

				if (newStatus && newStatus !== patient.currentStatus) {
					patientUpdates.push({
						updateOne: {
							filter: { _id: patient._id },
							update: { $set: { status: newStatus, lastActivity: new Date() } }
						}
					});
				}
			}

			if (patientUpdates.length > 0) {
				await Status.bulkWrite(patientUpdates);
				console.log(`✅ Updated ${patientUpdates.length} patient statuses`);
			}

			results.timings.updatePatients = Date.now();
			console.timeEnd('⏱️ Query 3-4: Update patient statuses');
		}
	} catch (error) {
		console.error('❌ Error in optimized batch sync:', error);
		results.errors.push({ error: error.message });
	}

	console.timeEnd('⏱️ batchSyncAssignmentsOptimized (total)');

	console.log(`\n📊 OPTIMIZED SYNC SUMMARY:`);
	console.log(`   Total assignments processed: ${assignmentIds.length}`);
	console.log(`   Assignments updated: ${results.synced}`);
	console.log(`   Total queries: 4 (instead of ${assignmentIds.length * 3})`);
	console.log(`   Query reduction: ${Math.round((1 - 4 / (assignmentIds.length * 3)) * 100)}%\n`);

	return results;
}

/**
 * OPTIMIZED: Bulk update patient statuses using aggregation pipeline
 * Uses MongoDB aggregation to fetch all data in minimal queries
 *
 * @param {Array<ObjectId>} patientIds - Array of patient IDs to update
 * @returns {Object} Results with updated count and timing breakdown
 */
export async function batchUpdatePatientStatusesOptimized(patientIds) {
	console.time('⏱️ batchUpdatePatientStatusesOptimized (total)');

	const results = {
		updated: 0,
		errors: [],
		timings: {}
	};

	if (!patientIds || patientIds.length === 0) {
		console.timeEnd('⏱️ batchUpdatePatientStatusesOptimized (total)');
		return results;
	}

	console.log(`📊 Processing ${patientIds.length} patient statuses using OPTIMIZED aggregation`);

	try {
		// ============================================================
		// QUERY 1: Get all patient data with assignment statuses using aggregation
		// ============================================================
		console.time('⏱️ Query 1: Fetch all patient data (aggregation)');

		const patientData = await Status.aggregate([
			{ $match: { patientId: { $in: patientIds } } },
			{
				$lookup: {
					from: 'assignments',
					let: { assignmentIds: '$assignmentIds' },
					pipeline: [
						{
							$match: {
								$expr: {
									$and: [{ $in: ['$_id', '$$assignmentIds'] }, { $ne: ['$status', 'removed'] }]
								}
							}
						},
						{ $project: { status: 1 } }
					],
					as: 'assignments'
				}
			},
			{
				$project: {
					_id: 1,
					patientId: 1,
					currentStatus: '$status',
					assignmentCount: { $size: '$assignments' },
					hasNotStarted: { $in: ['not_started', '$assignments.status'] },
					hasInProgress: { $in: ['in_progress', '$assignments.status'] },
					hasCompleted: {
						$or: [
							{ $in: ['completed', '$assignments.status'] },
							{ $in: ['downloaded', '$assignments.status'] }
						]
					},
					allCompleted: {
						$and: [
							{ $gt: [{ $size: '$assignments' }, 0] },
							{
								$allElementsTrue: {
									$map: {
										input: '$assignments',
										as: 'a',
										in: {
											$or: [
												{ $eq: ['$$a.status', 'completed'] },
												{ $eq: ['$$a.status', 'downloaded'] }
											]
										}
									}
								}
							}
						]
					}
				}
			}
		]);

		results.timings.fetchData = Date.now();
		console.timeEnd('⏱️ Query 1: Fetch all patient data (aggregation)');
		console.log(`📊 Fetched ${patientData.length} patient statuses with assignment data`);

		// ============================================================
		// IN-MEMORY: Calculate new statuses (instant)
		// ============================================================
		console.time('⏱️ Calculate patient statuses (in-memory)');

		const updates = [];

		for (const patient of patientData) {
			// Skip if no assignments
			if (patient.assignmentCount === 0) continue;

			let newStatus;

			if (patient.currentStatus === 'inactive') {
				// Preserve inactive status if already set
				newStatus = 'inactive';
			} else if (patient.allCompleted) {
				newStatus = 'completed';
			} else if (patient.hasInProgress || patient.hasCompleted) {
				newStatus = 'active';
			} else if (patient.hasNotStarted) {
				newStatus = 'onboarded';
			}

			if (newStatus && newStatus !== patient.currentStatus) {
				updates.push({
					updateOne: {
						filter: { _id: patient._id },
						update: {
							$set: {
								status: newStatus,
								lastActivity: new Date()
							}
						}
					}
				});
			}
		}

		results.timings.calculateStatuses = Date.now();
		console.timeEnd('⏱️ Calculate patient statuses (in-memory)');
		console.log(`📊 Found ${updates.length} patient statuses to update`);

		// ============================================================
		// QUERY 2: Bulk update patient statuses (1 query for all)
		// ============================================================
		if (updates.length > 0) {
			console.time('⏱️ Query 2: Bulk update patient statuses');
			await Status.bulkWrite(updates);
			results.timings.bulkUpdate = Date.now();
			console.timeEnd('⏱️ Query 2: Bulk update patient statuses');
			console.log(`✅ Updated ${updates.length} patient statuses`);
			results.updated = updates.length;
		}
	} catch (error) {
		console.error('❌ Error in optimized patient status update:', error);
		results.errors.push({ error: error.message });
	}

	console.timeEnd('⏱️ batchUpdatePatientStatusesOptimized (total)');

	console.log(`\n📊 OPTIMIZED PATIENT STATUS UPDATE SUMMARY:`);
	console.log(`   Total patients processed: ${patientIds.length}`);
	console.log(`   Patient statuses updated: ${results.updated}`);
	console.log(`   Total queries: 2 (instead of ${patientIds.length * 3})`);
	console.log(`   Query reduction: ${Math.round((1 - 2 / (patientIds.length * 3)) * 100)}%\n`);

	return results;
}

/**
 * Batch update patient statuses in parallel
 * Much faster than updating one-by-one
 *
 * @param {Array<ObjectId>} patientIds - Array of patient IDs to update
 * @param {number} batchSize - Number to process in parallel (default: 500)
 * @returns {Object} Results with updated count and errors
 */
export async function batchUpdatePatientStatuses(patientIds, batchSize = 500) {
	console.time('⏱️ batchUpdatePatientStatuses (total)');

	const results = {
		updated: 0,
		errors: []
	};

	if (!patientIds || patientIds.length === 0) {
		console.timeEnd('⏱️ batchUpdatePatientStatuses (total)');
		return results;
	}

	const totalBatches = Math.ceil(patientIds.length / batchSize);
	console.log(
		`📊 Processing ${patientIds.length} patient statuses in ${totalBatches} batches of ${batchSize}`
	);

	// Process in batches
	for (let i = 0; i < patientIds.length; i += batchSize) {
		const batch = patientIds.slice(i, i + batchSize);
		const batchNum = Math.floor(i / batchSize) + 1;

		// Aggregate timing stats for this batch
		const batchStats = {
			findStatus: { total: 0, count: 0, min: Infinity, max: 0 },
			findAssignments: { total: 0, count: 0, min: Infinity, max: 0 },
			calculateStatus: { total: 0, count: 0, min: Infinity, max: 0 },
			saveStatus: { total: 0, count: 0, min: Infinity, max: 0 },
			changed: 0
		};

		console.time(`⏱️   Patient batch ${batchNum}/${totalBatches} (${batch.length} patients)`);

		// Process batch in parallel
		await Promise.all(
			batch.map(async (patientId) => {
				try {
					const result = await updatePatientStatus(patientId);

					// Collect timing stats
					if (result.timings) {
						if (result.timings.findStatus) {
							batchStats.findStatus.total += result.timings.findStatus;
							batchStats.findStatus.count++;
							batchStats.findStatus.min = Math.min(
								batchStats.findStatus.min,
								result.timings.findStatus
							);
							batchStats.findStatus.max = Math.max(
								batchStats.findStatus.max,
								result.timings.findStatus
							);
						}
						if (result.timings.findAssignments) {
							batchStats.findAssignments.total += result.timings.findAssignments;
							batchStats.findAssignments.count++;
							batchStats.findAssignments.min = Math.min(
								batchStats.findAssignments.min,
								result.timings.findAssignments
							);
							batchStats.findAssignments.max = Math.max(
								batchStats.findAssignments.max,
								result.timings.findAssignments
							);
						}
						if (result.timings.calculateStatus) {
							batchStats.calculateStatus.total += result.timings.calculateStatus;
							batchStats.calculateStatus.count++;
							batchStats.calculateStatus.min = Math.min(
								batchStats.calculateStatus.min,
								result.timings.calculateStatus
							);
							batchStats.calculateStatus.max = Math.max(
								batchStats.calculateStatus.max,
								result.timings.calculateStatus
							);
						}
						if (result.timings.saveStatus) {
							batchStats.saveStatus.total += result.timings.saveStatus;
							batchStats.saveStatus.count++;
							batchStats.saveStatus.min = Math.min(
								batchStats.saveStatus.min,
								result.timings.saveStatus
							);
							batchStats.saveStatus.max = Math.max(
								batchStats.saveStatus.max,
								result.timings.saveStatus
							);
						}
					}

					if (result.changed) {
						results.updated++;
						batchStats.changed++;
					}
				} catch (error) {
					results.errors.push({
						patientId,
						error: error.message
					});
				}
			})
		);

		console.timeEnd(`⏱️   Patient batch ${batchNum}/${totalBatches} (${batch.length} patients)`);

		// Display batch breakdown
		const batchTotal =
			batchStats.findStatus.total +
			batchStats.findAssignments.total +
			batchStats.calculateStatus.total +
			batchStats.saveStatus.total;

		if (batchTotal > 0) {
			console.log(`📊 Patient Batch ${batchNum} Breakdown:`);
			console.log(`   Total Operations:`);

			if (batchStats.findStatus.count > 0) {
				const pct = ((batchStats.findStatus.total / batchTotal) * 100).toFixed(1);
				const avg = (batchStats.findStatus.total / batchStats.findStatus.count).toFixed(1);
				console.log(
					`   - Find status:          ${batchStats.findStatus.total.toFixed(0)}ms (${pct}%) [avg: ${avg}ms, min: ${batchStats.findStatus.min.toFixed(0)}ms, max: ${batchStats.findStatus.max.toFixed(0)}ms]`
				);
			}

			if (batchStats.findAssignments.count > 0) {
				const pct = ((batchStats.findAssignments.total / batchTotal) * 100).toFixed(1);
				const avg = (batchStats.findAssignments.total / batchStats.findAssignments.count).toFixed(
					1
				);
				console.log(
					`   - Find assignments:     ${batchStats.findAssignments.total.toFixed(0)}ms (${pct}%) [avg: ${avg}ms, min: ${batchStats.findAssignments.min.toFixed(0)}ms, max: ${batchStats.findAssignments.max.toFixed(0)}ms]`
				);
			}

			if (batchStats.calculateStatus.count > 0) {
				const pct = ((batchStats.calculateStatus.total / batchTotal) * 100).toFixed(1);
				const avg = (batchStats.calculateStatus.total / batchStats.calculateStatus.count).toFixed(
					1
				);
				console.log(
					`   - Calculate status:     ${batchStats.calculateStatus.total.toFixed(0)}ms (${pct}%) [avg: ${avg}ms, min: ${batchStats.calculateStatus.min.toFixed(1)}ms, max: ${batchStats.calculateStatus.max.toFixed(1)}ms]`
				);
			}

			if (batchStats.saveStatus.count > 0) {
				const pct = ((batchStats.saveStatus.total / batchTotal) * 100).toFixed(1);
				const avg = (batchStats.saveStatus.total / batchStats.saveStatus.count).toFixed(1);
				console.log(
					`   - Save status:          ${batchStats.saveStatus.total.toFixed(0)}ms (${pct}%) [avg: ${avg}ms, changed: ${batchStats.saveStatus.count} items]`
				);
			}

			const avgPerItem = (batchTotal / batch.length).toFixed(1);
			const changePct = ((batchStats.changed / batch.length) * 100).toFixed(1);
			console.log(`   Per-Patient Average: ${avgPerItem}ms`);
			console.log(`   Items Changed: ${batchStats.changed}/${batch.length} (${changePct}%)`);
		}
	}

	if (results.updated > 0) {
		console.log(`✅ Batch updated ${results.updated} patient statuses`);
	}

	if (results.errors.length > 0) {
		console.warn(`⚠️ ${results.errors.length} patient status updates failed`);
	}

	console.timeEnd('⏱️ batchUpdatePatientStatuses (total)');
	return results;
}

/**
 * Batch sync multiple assignments in parallel
 * Much faster than syncing one-by-one
 *
 * @param {Array<ObjectId>} assignmentIds - Array of assignment IDs to sync
 * @param {number} batchSize - Number to process in parallel (default: 500)
 * @returns {Object} Results with synced count and errors
 */
export async function batchSyncAssignments(assignmentIds, batchSize = 500) {
	console.time('⏱️ batchSyncAssignments (total)');

	const results = {
		synced: 0,
		errors: []
	};

	if (!assignmentIds || assignmentIds.length === 0) {
		console.timeEnd('⏱️ batchSyncAssignments (total)');
		return results;
	}

	const totalBatches = Math.ceil(assignmentIds.length / batchSize);
	console.log(
		`📊 Processing ${assignmentIds.length} assignments in ${totalBatches} batches of ${batchSize}`
	);

	// Process in batches
	for (let i = 0; i < assignmentIds.length; i += batchSize) {
		const batch = assignmentIds.slice(i, i + batchSize);
		const batchNum = Math.floor(i / batchSize) + 1;

		// Aggregate timing stats for this batch
		const batchStats = {
			findAssignment: { total: 0, count: 0, min: Infinity, max: 0 },
			findResponse: { total: 0, count: 0, min: Infinity, max: 0 },
			calculateStatus: { total: 0, count: 0, min: Infinity, max: 0 },
			saveAssignment: { total: 0, count: 0, min: Infinity, max: 0 },
			updatePatient: { total: 0, count: 0, min: Infinity, max: 0 },
			changed: 0
		};

		console.time(`⏱️   Batch ${batchNum}/${totalBatches} (${batch.length} assignments)`);

		// Process batch in parallel
		await Promise.all(
			batch.map(async (assignmentId) => {
				try {
					const result = await validateAndSyncAssignment(assignmentId);

					// Collect timing stats
					if (result.timings) {
						if (result.timings.findAssignment) {
							batchStats.findAssignment.total += result.timings.findAssignment;
							batchStats.findAssignment.count++;
							batchStats.findAssignment.min = Math.min(
								batchStats.findAssignment.min,
								result.timings.findAssignment
							);
							batchStats.findAssignment.max = Math.max(
								batchStats.findAssignment.max,
								result.timings.findAssignment
							);
						}
						if (result.timings.findResponse) {
							batchStats.findResponse.total += result.timings.findResponse;
							batchStats.findResponse.count++;
							batchStats.findResponse.min = Math.min(
								batchStats.findResponse.min,
								result.timings.findResponse
							);
							batchStats.findResponse.max = Math.max(
								batchStats.findResponse.max,
								result.timings.findResponse
							);
						}
						if (result.timings.calculateStatus) {
							batchStats.calculateStatus.total += result.timings.calculateStatus;
							batchStats.calculateStatus.count++;
							batchStats.calculateStatus.min = Math.min(
								batchStats.calculateStatus.min,
								result.timings.calculateStatus
							);
							batchStats.calculateStatus.max = Math.max(
								batchStats.calculateStatus.max,
								result.timings.calculateStatus
							);
						}
						if (result.timings.saveAssignment) {
							batchStats.saveAssignment.total += result.timings.saveAssignment;
							batchStats.saveAssignment.count++;
							batchStats.saveAssignment.min = Math.min(
								batchStats.saveAssignment.min,
								result.timings.saveAssignment
							);
							batchStats.saveAssignment.max = Math.max(
								batchStats.saveAssignment.max,
								result.timings.saveAssignment
							);
						}
						if (result.timings.updatePatient) {
							batchStats.updatePatient.total += result.timings.updatePatient;
							batchStats.updatePatient.count++;
							batchStats.updatePatient.min = Math.min(
								batchStats.updatePatient.min,
								result.timings.updatePatient
							);
							batchStats.updatePatient.max = Math.max(
								batchStats.updatePatient.max,
								result.timings.updatePatient
							);
						}
					}

					if (result.changed) {
						results.synced++;
						batchStats.changed++;
					}
				} catch (error) {
					results.errors.push({
						assignmentId,
						error: error.message
					});
				}
			})
		);

		console.timeEnd(`⏱️   Batch ${batchNum}/${totalBatches} (${batch.length} assignments)`);

		// Display batch breakdown
		const batchTotal =
			batchStats.findAssignment.total +
			batchStats.findResponse.total +
			batchStats.calculateStatus.total +
			batchStats.saveAssignment.total +
			batchStats.updatePatient.total;

		if (batchTotal > 0) {
			console.log(`📊 Assignment Batch ${batchNum} Breakdown:`);
			console.log(`   Total Operations:`);

			if (batchStats.findAssignment.count > 0) {
				const pct = ((batchStats.findAssignment.total / batchTotal) * 100).toFixed(1);
				const avg = (batchStats.findAssignment.total / batchStats.findAssignment.count).toFixed(1);
				console.log(
					`   - Find assignments:     ${batchStats.findAssignment.total.toFixed(0)}ms (${pct}%) [avg: ${avg}ms, min: ${batchStats.findAssignment.min.toFixed(0)}ms, max: ${batchStats.findAssignment.max.toFixed(0)}ms]`
				);
			}

			if (batchStats.findResponse.count > 0) {
				const pct = ((batchStats.findResponse.total / batchTotal) * 100).toFixed(1);
				const avg = (batchStats.findResponse.total / batchStats.findResponse.count).toFixed(1);
				console.log(
					`   - Find responses:       ${batchStats.findResponse.total.toFixed(0)}ms (${pct}%) [avg: ${avg}ms, min: ${batchStats.findResponse.min.toFixed(0)}ms, max: ${batchStats.findResponse.max.toFixed(0)}ms]`
				);
			}

			if (batchStats.calculateStatus.count > 0) {
				const pct = ((batchStats.calculateStatus.total / batchTotal) * 100).toFixed(1);
				const avg = (batchStats.calculateStatus.total / batchStats.calculateStatus.count).toFixed(
					1
				);
				console.log(
					`   - Calculate status:     ${batchStats.calculateStatus.total.toFixed(0)}ms (${pct}%) [avg: ${avg}ms, min: ${batchStats.calculateStatus.min.toFixed(1)}ms, max: ${batchStats.calculateStatus.max.toFixed(1)}ms]`
				);
			}

			if (batchStats.saveAssignment.count > 0) {
				const pct = ((batchStats.saveAssignment.total / batchTotal) * 100).toFixed(1);
				const avg = (batchStats.saveAssignment.total / batchStats.saveAssignment.count).toFixed(1);
				console.log(
					`   - Save assignments:     ${batchStats.saveAssignment.total.toFixed(0)}ms (${pct}%) [avg: ${avg}ms, changed: ${batchStats.saveAssignment.count} items]`
				);
			}

			if (batchStats.updatePatient.count > 0) {
				const pct = ((batchStats.updatePatient.total / batchTotal) * 100).toFixed(1);
				const avg = (batchStats.updatePatient.total / batchStats.updatePatient.count).toFixed(1);
				console.log(
					`   - Update patients:      ${batchStats.updatePatient.total.toFixed(0)}ms (${pct}%) [avg: ${avg}ms, changed: ${batchStats.updatePatient.count} items]`
				);
			}

			const avgPerItem = (batchTotal / batch.length).toFixed(1);
			const changePct = ((batchStats.changed / batch.length) * 100).toFixed(1);
			console.log(`   Per-Assignment Average: ${avgPerItem}ms`);
			console.log(`   Items Changed: ${batchStats.changed}/${batch.length} (${changePct}%)`);
		}
	}

	if (results.synced > 0) {
		console.log(`🔧 Batch synced ${results.synced} assignments`);
	}

	if (results.errors.length > 0) {
		console.warn(`⚠️ ${results.errors.length} assignments failed to sync`);
	}

	console.timeEnd('⏱️ batchSyncAssignments (total)');
	return results;
}
