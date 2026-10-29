/**
 * Migration Script: Followup to Status
 *
 * This script migrates data from the Followup collection to the new Status collection.
 * It also updates Assignment records to include completedAt and downloadedOn timestamps.
 *
 * IMPORTANT: Always backup your database before running this migration!
 *
 * Usage:
 *   node src/lib/database/migrations/followup-to-status-migration.js [--dry-run] [--rollback]
 *
 * Options:
 *   --dry-run   : Preview changes without applying them
 *   --rollback  : Revert the migration (restore from backup)
 */

import mongoose from 'mongoose';
import { User, Assignment, Response, Followup, Status, Questionnaire } from '../schemas.js';
import { connectToDatabase } from '../connection.js';
import { syncAssignmentStatus } from '../questionnaireResults.js';

// Migration configuration
const BATCH_SIZE = 500;
const BACKUP_COLLECTION_PREFIX = 'backup_';
const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds

/**
 * Check if patient has recent activity (within 1 month)
 * @param {Array} assignmentsWithResponses - Assignments with their response data
 * @returns {boolean} - True if ANY activity in last month
 */
function hasRecentActivity(assignmentsWithResponses) {
	const cutoffDate = new Date(Date.now() - ONE_MONTH_MS);

	for (const assignment of assignmentsWithResponses) {
		// Check response submittedAt (most important - when user actually submitted)
		if (assignment.responseSubmittedAt && assignment.responseSubmittedAt > cutoffDate) {
			return true;
		}

		// If no response, check when assignment was assigned
		if (assignment.assignedAt && assignment.assignedAt > cutoffDate) {
			return true;
		}
	}

	return false;
}

/**
 * Calculate patient status based on assignments
 * Priority order: completed > active > onboarded > inactive
 * Inactive: No activity in last 1 month
 */
function calculatePatientStatus(assignments, assignmentsWithResponses = null) {
	if (!assignments || assignments.length === 0) {
		return 'onboarded';
	}

	// Filter out removed assignments
	const activeAssignments = assignments.filter((a) => a.status !== 'removed');

	if (activeAssignments.length === 0) {
		return 'onboarded';
	}

	const hasNotStarted = activeAssignments.some((a) => a.status === 'not_started');
	const hasInProgress = activeAssignments.some((a) => a.status === 'in_progress');
	const hasCompleted = activeAssignments.some(
		(a) => a.status === 'completed' || a.status === 'downloaded'
	);
	const allCompleted =
		activeAssignments.length > 0 &&
		activeAssignments.every((a) => a.status === 'completed' || a.status === 'downloaded');
	// Legacy support for 'pending' status during migration
	const hasPending = activeAssignments.some((a) => a.status === 'pending');

	// Determine base status
	let baseStatus;
	if (allCompleted) {
		// ALL assignments are completed or downloaded
		baseStatus = 'completed';
	} else if (hasInProgress || hasPending || hasCompleted) {
		// At least one in progress OR pending (legacy) OR at least one completed (but not all)
		// Patient is actively working through assignments
		baseStatus = 'active';
	} else if (hasNotStarted) {
		// ALL assignments are not_started (no progress made yet)
		baseStatus = 'onboarded';
	} else {
		baseStatus = 'onboarded';
	}

	// Check for inactivity (1-month cutoff)
	// If assignmentsWithResponses data is provided, check for recent activity
	if (assignmentsWithResponses && assignmentsWithResponses.length > 0) {
		if (!hasRecentActivity(assignmentsWithResponses)) {
			// No activity in last month
			// BUT if they are already completed, keep them as completed
			if (!hasRecentActivity(assignmentsWithResponses)) {
				// No activity in last month
				// Even if completed, mark as inactive if old
				return 'inactive';
			}
		}
	}

	return baseStatus;
}

/**
 * Get the most recent activity date from assignments
 */
function getLastActivityDate(assignments, followupDate) {
	if (!assignments || assignments.length === 0) {
		return followupDate || new Date();
	}

	const dates = assignments
		.map((a) => a.completedAt || a.assignedAt)
		.filter((d) => d)
		.sort((a, b) => b - a);

	return dates[0] || followupDate || new Date();
}

/**
 * Create backup of collections before migration
 */
async function createBackup() {
	console.log('Creating backup of Followup and Assignment collections...');

	try {
		// Check if backup collections already exist and drop them
		const collections = await mongoose.connection.db.listCollections().toArray();
		const collectionNames = collections.map((c) => c.name);

		if (collectionNames.includes(`${BACKUP_COLLECTION_PREFIX}followups`)) {
			console.log('⚠ Previous backup found - removing old backup_followups...');
			await mongoose.connection.db.dropCollection(`${BACKUP_COLLECTION_PREFIX}followups`);
		}

		if (collectionNames.includes(`${BACKUP_COLLECTION_PREFIX}assignments`)) {
			console.log('⚠ Previous backup found - removing old backup_assignments...');
			await mongoose.connection.db.dropCollection(`${BACKUP_COLLECTION_PREFIX}assignments`);
		}

		// Backup Followup collection using raw MongoDB operations (bypasses schema validation)
		const followups = await Followup.find({}).lean();
		if (followups.length > 0) {
			await mongoose.connection.db
				.collection(`${BACKUP_COLLECTION_PREFIX}followups`)
				.insertMany(followups);
			console.log(`✓ Backed up ${followups.length} Followup records`);
		}

		// Backup Assignment collection using raw MongoDB operations (bypasses schema validation)
		const assignments = await Assignment.find({}).lean();
		if (assignments.length > 0) {
			await mongoose.connection.db
				.collection(`${BACKUP_COLLECTION_PREFIX}assignments`)
				.insertMany(assignments);
			console.log(`✓ Backed up ${assignments.length} Assignment records`);
		}

		console.log('✓ Backup completed successfully\n');
		return true;
	} catch (error) {
		console.error('✗ Backup failed:', error.message);
		throw error;
	}
}

/**
 * Restore from backup (rollback)
 */
async function restoreFromBackup() {
	console.log('Restoring from backup...');

	try {
		// Restore Followup collection
		const BackupFollowup = mongoose.connection.collection(`${BACKUP_COLLECTION_PREFIX}followups`);
		const followupBackups = await BackupFollowup.find({}).toArray();

		if (followupBackups.length > 0) {
			await Followup.deleteMany({});
			await Followup.insertMany(followupBackups);
			console.log(`✓ Restored ${followupBackups.length} Followup records`);
		}

		// Restore Assignment collection
		const BackupAssignment = mongoose.connection.collection(
			`${BACKUP_COLLECTION_PREFIX}assignments`
		);
		const assignmentBackups = await BackupAssignment.find({}).toArray();

		if (assignmentBackups.length > 0) {
			await Assignment.deleteMany({});
			await Assignment.insertMany(assignmentBackups);
			console.log(`✓ Restored ${assignmentBackups.length} Assignment records`);
		}

		// Delete Status collection
		await Status.deleteMany({});
		console.log('✓ Cleared Status collection');

		// Drop backup collections
		await BackupFollowup.drop();
		await BackupAssignment.drop();
		console.log('✓ Removed backup collections');

		console.log('✓ Rollback completed successfully\n');
		return true;
	} catch (error) {
		console.error('✗ Rollback failed:', error.message);
		throw error;
	}
}

/**
 * Validate assignment completion status against actual responses
 * OPTIMIZED: Uses aggregation pipeline for bulk data fetching
 */
async function validateAssignmentCompleteness(dryRun = false) {
	console.log('Validating assignment completion status...');

	try {
		console.log(
			'Fetching all completed/downloaded assignments with questionnaire and response data...'
		);

		// OPTIMIZED: Use aggregation to get everything in ONE query
		const assignmentData = await Assignment.aggregate([
			{
				$match: {
					status: { $in: ['completed', 'downloaded'] }
				}
			},
			{
				$lookup: {
					from: 'questionnaires',
					localField: 'questionnaireId',
					foreignField: '_id',
					as: 'questionnaire'
				}
			},
			{
				$lookup: {
					from: 'responses',
					localField: '_id',
					foreignField: 'assignmentId',
					as: 'response'
				}
			},
			{
				$project: {
					_id: 1,
					patientId: 1,
					questionnaireId: 1,
					status: 1,
					hasQuestionnaire: { $gt: [{ $size: '$questionnaire' }, 0] },
					totalQuestions: {
						$cond: {
							if: { $gt: [{ $size: '$questionnaire' }, 0] },
							then: { $size: { $arrayElemAt: ['$questionnaire.questions', 0] } },
							else: 0
						}
					},
					responseCount: {
						$cond: {
							if: { $gt: [{ $size: '$response' }, 0] },
							then: { $size: { $arrayElemAt: ['$response.responses', 0] } },
							else: 0
						}
					}
				}
			}
		]);

		console.log(`\nFound ${assignmentData.length} assignments marked as completed/downloaded`);
		console.log('Analyzing response completeness...\n');

		let validCompleted = 0;
		let invalidCompleted = 0;
		let missingQuestionnaire = 0;
		const invalidAssignments = [];

		for (const assignment of assignmentData) {
			if (!assignment.hasQuestionnaire) {
				// Will be handled by middleware sync as 'removed'
				missingQuestionnaire++;
				continue;
			}

			if (assignment.responseCount === assignment.totalQuestions) {
				validCompleted++;
			} else {
				invalidCompleted++;
				invalidAssignments.push({
					id: assignment._id,
					patientId: assignment.patientId,
					questionnaireId: assignment.questionnaireId,
					status: assignment.status,
					totalQuestions: assignment.totalQuestions,
					responseCount: assignment.responseCount,
					missing: assignment.totalQuestions - assignment.responseCount
				});
			}
		}

		console.log('='.repeat(60));
		console.log('COMPLETION VALIDATION RESULTS');
		console.log('='.repeat(60));
		console.log(`✅ Valid Completed: ${validCompleted} (responses match question count)`);
		console.log(`❌ Invalid Completed: ${invalidCompleted} (incomplete responses)`);
		if (missingQuestionnaire > 0) {
			console.log(`⚠️  Missing Questionnaire: ${missingQuestionnaire} (will be marked as removed)`);
		}

		if (invalidCompleted > 0) {
			console.log('\nInvalid Assignments (will be corrected by middleware sync):');
			invalidAssignments.slice(0, 10).forEach((a) => {
				console.log(
					`  • Assignment ${a.id}: ${a.responseCount}/${a.totalQuestions} questions answered (missing ${a.missing})`
				);
			});
			if (invalidAssignments.length > 10) {
				console.log(`  ... and ${invalidAssignments.length - 10} more`);
			}
		}
		console.log('='.repeat(60) + '\n');

		return { validCompleted, invalidCompleted, invalidAssignments };
	} catch (error) {
		console.error('✗ Validation failed:', error.message);
		throw error;
	}
}

/**
 * Update Assignment records with completedAt timestamps
 */
async function updateAssignments(dryRun = false) {
	console.log('Updating Assignment records...');

	try {
		// Get assignment statistics
		const totalAssignments = await Assignment.countDocuments();
		const completedCount = await Assignment.countDocuments({ status: 'completed' });
		const downloadedCount = await Assignment.countDocuments({ status: 'downloaded' });
		const pendingCount = await Assignment.countDocuments({ status: 'pending' });

		console.log(`\nAssignment Statistics:`);
		console.log(`  Total: ${totalAssignments}`);
		console.log(
			`  Completed: ${completedCount} (${Math.round((completedCount / totalAssignments) * 100)}%)`
		);
		console.log(
			`  Downloaded: ${downloadedCount} (${Math.round((downloadedCount / totalAssignments) * 100)}%)`
		);
		console.log(
			`  Pending: ${pendingCount} (${Math.round((pendingCount / totalAssignments) * 100)}%)`
		);

		// Find completed assignments without completedAt
		const completedWithoutDate = await Assignment.find({
			status: 'completed',
			completedAt: null
		}).lean();

		// Find assignments with incorrect downloadedOn
		const completedWithDownloadedOn = await Assignment.countDocuments({
			status: 'completed',
			downloadedOn: { $ne: null }
		});

		const pendingWithTimestamps = await Assignment.countDocuments({
			status: 'pending',
			$or: [{ completedAt: { $ne: null } }, { downloadedOn: { $ne: null } }]
		});

		console.log(`\nAssignments needing updates:`);
		console.log(`  Completed without completedAt: ${completedWithoutDate.length}`);
		console.log(`  Completed with downloadedOn (should be null): ${completedWithDownloadedOn}`);
		console.log(`  Pending with timestamps (should be null): ${pendingWithTimestamps}`);

		if (dryRun) {
			console.log('\nDRY RUN: Would perform these updates:');
			if (completedWithoutDate.length > 0) {
				console.log(`  - Set completedAt for ${completedWithoutDate.length} completed assignments`);
			}
			if (completedWithDownloadedOn > 0) {
				console.log(
					`  - Clear downloadedOn for ${completedWithDownloadedOn} completed assignments`
				);
			}
			if (pendingWithTimestamps > 0) {
				console.log(`  - Clear timestamps for ${pendingWithTimestamps} pending assignments`);
			}
			if (
				completedWithoutDate.length === 0 &&
				completedWithDownloadedOn === 0 &&
				pendingWithTimestamps === 0
			) {
				console.log(`  ✓ No updates needed - assignments are already correct!`);
			}
			console.log('');
			return completedWithoutDate.length;
		}

		let updated = 0;

		// OPTIMIZED: Update completed assignments without completedAt
		if (completedWithoutDate.length > 0) {
			console.log('Fetching responses in bulk for completed assignments...');

			// Get all assignment IDs
			const assignmentIds = completedWithoutDate.map((a) => a._id);

			// Fetch ALL responses in ONE query
			const allResponses = await Response.find({
				assignmentId: { $in: assignmentIds }
			}).lean();

			// Create a map for quick lookup
			const responseMap = new Map();
			for (const response of allResponses) {
				responseMap.set(response.assignmentId.toString(), response);
			}

			// Prepare bulk update operations
			const bulkOps = completedWithoutDate.map((assignment) => {
				const response = responseMap.get(assignment._id.toString());
				const completedAt = response?.submittedAt || assignment.assignedAt;

				return {
					updateOne: {
						filter: { _id: assignment._id },
						update: { $set: { completedAt } }
					}
				};
			});

			// Execute bulk update
			console.log(`Updating ${bulkOps.length} assignments with completedAt...`);
			const result = await Assignment.bulkWrite(bulkOps, { ordered: false });
			updated += result.modifiedCount;
			console.log(`✓ Set completedAt for ${result.modifiedCount} assignments`);
		}

		// Clear downloadedOn for completed (not downloaded) assignments
		if (completedWithDownloadedOn > 0) {
			await Assignment.updateMany(
				{ status: 'completed', downloadedOn: { $ne: null } },
				{ $unset: { downloadedOn: '' } }
			);
			updated += completedWithDownloadedOn;
		}

		// Clear timestamps for pending assignments
		if (pendingWithTimestamps > 0) {
			await Assignment.updateMany(
				{ status: 'pending' },
				{ $unset: { completedAt: '', downloadedOn: '' } }
			);
			updated += pendingWithTimestamps;
		}

		console.log(`✓ Updated ${updated} Assignment records\n`);
		return updated;
	} catch (error) {
		console.error('✗ Assignment update failed:', error.message);
		throw error;
	}
}

/**
 * Clean up orphaned assignments (assignments with non-existent patients)
 */
async function cleanupOrphanedAssignments(dryRun = false) {
	console.log('Checking for orphaned assignments...');

	try {
		// Get all patient IDs
		const patients = await User.find({ userType: 'patient' }).lean();
		const validPatientIds = new Set(patients.map((p) => p._id.toString()));

		// Find assignments with invalid patient IDs
		const allAssignments = await Assignment.find({}).lean();
		const orphanedAssignments = allAssignments.filter(
			(a) => !validPatientIds.has(a.patientId.toString())
		);

		console.log(`Found ${orphanedAssignments.length} assignments with non-existent patients`);

		if (orphanedAssignments.length > 0) {
			if (dryRun) {
				console.log('DRY RUN: Would delete these orphaned assignments:');
				orphanedAssignments.slice(0, 10).forEach((a) => {
					console.log(`  - Assignment ${a._id} (Patient: ${a.patientId}, Status: ${a.status})`);
				});
				if (orphanedAssignments.length > 10) {
					console.log(`  ... and ${orphanedAssignments.length - 10} more`);
				}
			} else {
				// Delete orphaned assignments
				const orphanedIds = orphanedAssignments.map((a) => a._id);
				await Assignment.deleteMany({ _id: { $in: orphanedIds } });
				console.log(`✓ Deleted ${orphanedAssignments.length} orphaned assignments`);
			}
		} else {
			console.log('✓ No orphaned assignments found');
		}

		console.log('');
		return orphanedAssignments.length;
	} catch (error) {
		console.error('✗ Cleanup failed:', error.message);
		throw error;
	}
}

/**
 * Migrate Followup records to Status collection (BULK OPERATION)
 * OPTIMIZED: Fetches all assignments in one query
 */
async function migrateFollowupsToStatus(dryRun = false) {
	console.log('Migrating Followup records to Status collection...');

	try {
		const followups = await Followup.find({}).lean();
		console.log(`Found ${followups.length} Followup records to migrate`);

		// OPTIMIZED: Fetch ALL assignments for ALL patients in ONE query
		const allPatientIds = followups.map((f) => f.patientId);
		console.log('Fetching all assignments in bulk...');
		const allAssignments = await Assignment.find({
			patientId: { $in: allPatientIds }
		}).lean();

		// Group assignments by patientId for quick lookup
		const assignmentsByPatient = new Map();
		for (const assignment of allAssignments) {
			const patientId = assignment.patientId.toString();
			if (!assignmentsByPatient.has(patientId)) {
				assignmentsByPatient.set(patientId, []);
			}
			assignmentsByPatient.get(patientId).push(assignment);
		}

		if (dryRun) {
			console.log('DRY RUN: Analyzing what Status records would be created...\n');

			const statusBreakdown = { onboarded: 0, active: 0, completed: 0 };
			const patientDetails = [];

			console.log('Processing all followup records...');
			for (const followup of followups) {
				const patientAssignments = assignmentsByPatient.get(followup.patientId.toString()) || [];

				const status = calculatePatientStatus(patientAssignments);
				const lastActivity = getLastActivityDate(patientAssignments, followup.lastFollowupDate);

				statusBreakdown[status]++;
				patientDetails.push({
					patientId: followup.patientId,
					status,
					lastActivity,
					assignmentCount: patientAssignments.length
				});
			}

			// Show comprehensive breakdown
			console.log('\n' + '='.repeat(60));
			console.log('STATUS BREAKDOWN - Followup to Status Migration');
			console.log('='.repeat(60));
			console.log(`Total Patients from Followup: ${followups.length}\n`);

			const onboardedPct = Math.round((statusBreakdown.onboarded / followups.length) * 100);
			const activePct = Math.round((statusBreakdown.active / followups.length) * 100);
			const completedPct = Math.round((statusBreakdown.completed / followups.length) * 100);

			console.log(`  🟢 ONBOARDED: ${statusBreakdown.onboarded} patients (${onboardedPct}%)`);
			console.log(`     → No progress made yet on assignments\n`);

			console.log(`  🟡 ACTIVE: ${statusBreakdown.active} patients (${activePct}%)`);
			console.log(`     → At least one assignment in progress or completed\n`);

			console.log(`  🔵 COMPLETED: ${statusBreakdown.completed} patients (${completedPct}%)`);
			console.log(`     → All assignments completed or downloaded\n`);

			console.log('='.repeat(60));

			// Show sample patients from each category
			console.log('\nSample Patients by Status:\n');

			['onboarded', 'active', 'completed'].forEach((status) => {
				const samples = patientDetails.filter((p) => p.status === status).slice(0, 3);
				if (samples.length > 0) {
					console.log(`${status.toUpperCase()}:`);
					samples.forEach((p) => {
						console.log(`  • Patient ${p.patientId} - ${p.assignmentCount} assignments`);
					});
					const remaining = statusBreakdown[status] - samples.length;
					if (remaining > 0) {
						console.log(`  ... and ${remaining} more`);
					}
					console.log('');
				}
			});

			console.log('Would create Status records using BULK INSERT\n');

			return followups.length;
		}

		// Prepare all Status records at once
		console.log('Preparing Status records...');
		const statusRecords = followups.map((followup) => {
			const patientAssignments = assignmentsByPatient.get(followup.patientId.toString()) || [];

			return {
				patientId: followup.patientId,
				status: calculatePatientStatus(patientAssignments),
				lastActivity: getLastActivityDate(patientAssignments, followup.lastFollowupDate),
				assignmentIds: patientAssignments.map((a) => a._id),
				createdAt: followup.lastFollowupDate || new Date(),
				updatedAt: new Date()
			};
		});

		// Bulk insert all at once (ordered: false allows partial success)
		if (statusRecords.length > 0) {
			const result = await Status.insertMany(statusRecords, { ordered: false });
			console.log(`✓ Bulk created ${result.length} Status records`);
		}

		console.log('');
		return statusRecords.length;
	} catch (error) {
		// insertMany with ordered:false can throw but still insert some records
		if (error.writeErrors) {
			const inserted = error.insertedDocs?.length || 0;
			const failed = error.writeErrors.length;
			console.log(`✓ Bulk created ${inserted} Status records`);
			console.log(`⚠ ${failed} records failed (likely duplicates - skipped)`);
			console.log('');
			return inserted;
		}
		console.error('✗ Migration failed:', error.message);
		throw error;
	}
}

/**
 * Create Status records for ALL patients based on their assignments
 * SIMPLIFIED: Ignores Followup collection, uses only Patient + Assignment data
 * OPTIMIZED: Bulk queries for maximum performance
 */
async function createStatusRecordsForAllPatients(dryRun = false) {
	console.log('Creating Status records for all patients based on assignments...');

	try {
		// Get all patients
		const patients = await User.find({ userType: 'patient' }).lean();
		console.log(`Found ${patients.length} total patients`);

		// OPTIMIZED: Fetch ALL assignments for ALL patients in ONE query
		const allPatientIds = patients.map((p) => p._id);
		console.log('Fetching all assignments in bulk...');
		const allAssignments = await Assignment.find({
			patientId: { $in: allPatientIds }
		}).lean();

		// OPTIMIZED: Fetch ALL responses for these assignments in ONE query
		console.log('Fetching all responses in bulk...');
		const assignmentIds = allAssignments.map((a) => a._id);
		const allResponses = await Response.find({
			assignmentId: { $in: assignmentIds }
		}).lean();

		// Create response map for quick lookup
		const responseByAssignment = new Map();
		for (const response of allResponses) {
			responseByAssignment.set(response.assignmentId.toString(), response);
		}

		// Group assignments by patientId with response data for quick lookup
		const assignmentsByPatient = new Map();
		const assignmentsWithResponseByPatient = new Map();
		for (const assignment of allAssignments) {
			const patientId = assignment.patientId.toString();
			if (!assignmentsByPatient.has(patientId)) {
				assignmentsByPatient.set(patientId, []);
				assignmentsWithResponseByPatient.set(patientId, []);
			}
			assignmentsByPatient.get(patientId).push(assignment);

			// Add assignment with response submittedAt for activity checking
			const response = responseByAssignment.get(assignment._id.toString());
			assignmentsWithResponseByPatient.get(patientId).push({
				_id: assignment._id,
				assignedAt: assignment.assignedAt,
				responseSubmittedAt: response?.submittedAt
			});
		}

		if (dryRun) {
			console.log('DRY RUN: Analyzing what Status records would be created...\n');

			const statusBreakdown = { onboarded: 0, active: 0, completed: 0, inactive: 0 };
			const patientDetails = [];

			console.log('Processing all patients...');
			for (const patient of patients) {
				const assignments = assignmentsByPatient.get(patient._id.toString()) || [];
				const assignmentsWithResponse =
					assignmentsWithResponseByPatient.get(patient._id.toString()) || [];
				const status = calculatePatientStatus(assignments, assignmentsWithResponse);

				statusBreakdown[status]++;
				patientDetails.push({
					patientId: patient._id,
					email: patient.email,
					status,
					assignmentCount: assignments.length
				});
			}

			// Show comprehensive breakdown
			console.log('\n' + '='.repeat(60));
			console.log('PATIENT STATUS DISTRIBUTION - ALL PATIENTS');
			console.log('='.repeat(60));
			console.log(`Total Patients: ${patients.length}\n`);

			const onboardedPct = Math.round((statusBreakdown.onboarded / patients.length) * 100);
			const activePct = Math.round((statusBreakdown.active / patients.length) * 100);
			const completedPct = Math.round((statusBreakdown.completed / patients.length) * 100);
			const inactivePct = Math.round((statusBreakdown.inactive / patients.length) * 100);

			console.log(`  🟢 ONBOARDED: ${statusBreakdown.onboarded} patients (${onboardedPct}%)`);
			console.log(`     → No progress made yet on assignments\n`);

			console.log(`  🟡 ACTIVE: ${statusBreakdown.active} patients (${activePct}%)`);
			console.log(`     → At least one assignment in progress or completed\n`);

			console.log(`  🔵 COMPLETED: ${statusBreakdown.completed} patients (${completedPct}%)`);
			console.log(`     → All assignments completed or downloaded\n`);

			console.log(`  📴 INACTIVE: ${statusBreakdown.inactive} patients (${inactivePct}%)`);
			console.log(`     → No activity in last 1 month\n`);

			console.log('='.repeat(60));

			// Show sample patients from each category
			console.log('\nSample Patients by Status:\n');

			['onboarded', 'active', 'completed', 'inactive'].forEach((status) => {
				const samples = patientDetails.filter((p) => p.status === status).slice(0, 3);
				if (samples.length > 0) {
					console.log(`${status.toUpperCase()}:`);
					samples.forEach((p) => {
						console.log(`  • ${p.email} - ${p.assignmentCount} assignments`);
					});
					const remaining = statusBreakdown[status] - samples.length;
					if (remaining > 0) {
						console.log(`  ... and ${remaining} more`);
					}
					console.log('');
				}
			});

			console.log('Would create Status records using BULK INSERT\n');

			return patients.length;
		}

		// Prepare all Status records at once
		console.log('Preparing Status records...');
		const statusRecords = patients.map((patient) => {
			const assignments = assignmentsByPatient.get(patient._id.toString()) || [];
			const assignmentsWithResponse =
				assignmentsWithResponseByPatient.get(patient._id.toString()) || [];

			return {
				patientId: patient._id,
				status: calculatePatientStatus(assignments, assignmentsWithResponse),
				lastActivity: getLastActivityDate(assignments, patient.createdAt),
				assignmentIds: assignments.map((a) => a._id),
				createdAt: patient.createdAt,
				updatedAt: new Date()
			};
		});

		// Bulk upsert all at once to handle existing records from sync
		if (statusRecords.length > 0) {
			console.log('Performing bulk upsert to ensure correct status...');
			const operations = statusRecords.map((record) => ({
				updateOne: {
					filter: { patientId: record.patientId },
					update: { $set: record },
					upsert: true
				}
			}));

			const result = await Status.bulkWrite(operations);
			console.log(`✓ Processed ${statusRecords.length} patient records`);
			console.log(`  - Matched: ${result.matchedCount}`);
			console.log(`  - Modified: ${result.modifiedCount}`);
			console.log(`  - Upserted: ${result.upsertedCount}`);
		}

		console.log('');
		return statusRecords.length;
	} catch (error) {
		console.error('✗ Creating Status records failed:', error.message);
		throw error;
	}
}

/**
 * Create Status records for patients without Followup records (BULK OPERATION)
 * OPTIMIZED: Fetches all assignments in one query
 */
async function createMissingStatusRecords(dryRun = false) {
	console.log('Creating Status records for patients without Followup...');

	try {
		// Find all patients
		const patients = await User.find({ userType: 'patient' }).lean();

		// Find patients already in Status collection
		const existingStatuses = await Status.find({}).lean();
		const existingPatientIds = new Set(existingStatuses.map((s) => s.patientId.toString()));

		// Filter patients without Status records
		const missingPatients = patients.filter((p) => !existingPatientIds.has(p._id.toString()));

		console.log(`Found ${missingPatients.length} patients without Status records`);

		if (missingPatients.length === 0) {
			console.log('✓ No missing Status records to create\n');
			return 0;
		}

		// OPTIMIZED: Fetch ALL assignments for missing patients in ONE query
		const missingPatientIds = missingPatients.map((p) => p._id);
		console.log('Fetching all assignments in bulk...');
		const allAssignments = await Assignment.find({
			patientId: { $in: missingPatientIds }
		}).lean();

		// Group assignments by patientId for quick lookup
		const assignmentsByPatient = new Map();
		for (const assignment of allAssignments) {
			const patientId = assignment.patientId.toString();
			if (!assignmentsByPatient.has(patientId)) {
				assignmentsByPatient.set(patientId, []);
			}
			assignmentsByPatient.get(patientId).push(assignment);
		}

		if (dryRun) {
			console.log('DRY RUN: Analyzing patients without Followup records...\n');

			const statusBreakdown = { onboarded: 0, active: 0, completed: 0 };
			const patientDetails = [];

			console.log('Processing all missing patients...');
			for (const patient of missingPatients) {
				const assignments = assignmentsByPatient.get(patient._id.toString()) || [];
				const status = calculatePatientStatus(assignments);

				statusBreakdown[status]++;
				patientDetails.push({
					patientId: patient._id,
					email: patient.email,
					status,
					assignmentCount: assignments.length
				});
			}

			// Show comprehensive breakdown
			console.log('\n' + '='.repeat(60));
			console.log('STATUS BREAKDOWN - Missing Status Records');
			console.log('='.repeat(60));
			console.log(`Total Patients without Followup: ${missingPatients.length}\n`);

			const onboardedPct = Math.round((statusBreakdown.onboarded / missingPatients.length) * 100);
			const activePct = Math.round((statusBreakdown.active / missingPatients.length) * 100);
			const completedPct = Math.round((statusBreakdown.completed / missingPatients.length) * 100);

			console.log(`  🟢 ONBOARDED: ${statusBreakdown.onboarded} patients (${onboardedPct}%)`);
			console.log(`     → No progress made yet on assignments\n`);

			console.log(`  🟡 ACTIVE: ${statusBreakdown.active} patients (${activePct}%)`);
			console.log(`     → At least one assignment in progress or completed\n`);

			console.log(`  🔵 COMPLETED: ${statusBreakdown.completed} patients (${completedPct}%)`);
			console.log(`     → All assignments completed or downloaded\n`);

			console.log('='.repeat(60));

			// Show sample patients from each category
			console.log('\nSample Patients by Status:\n');

			['onboarded', 'active', 'completed'].forEach((status) => {
				const samples = patientDetails.filter((p) => p.status === status).slice(0, 3);
				if (samples.length > 0) {
					console.log(`${status.toUpperCase()}:`);
					samples.forEach((p) => {
						console.log(`  • ${p.email} - ${p.assignmentCount} assignments`);
					});
					const remaining = statusBreakdown[status] - samples.length;
					if (remaining > 0) {
						console.log(`  ... and ${remaining} more`);
					}
					console.log('');
				}
			});

			console.log('Would create Status records using BULK INSERT\n');

			return missingPatients.length;
		}

		// Prepare all Status records at once
		console.log('Preparing Status records...');
		const statusRecords = missingPatients.map((patient) => {
			const assignments = assignmentsByPatient.get(patient._id.toString()) || [];

			return {
				patientId: patient._id,
				status: calculatePatientStatus(assignments),
				lastActivity: getLastActivityDate(assignments, patient.createdAt),
				assignmentIds: assignments.map((a) => a._id),
				createdAt: patient.createdAt,
				updatedAt: new Date()
			};
		});

		// Bulk insert all at once
		if (statusRecords.length > 0) {
			const result = await Status.insertMany(statusRecords, { ordered: false });
			console.log(`✓ Bulk created ${result.length} Status records`);
		}

		console.log('');
		return statusRecords.length;
	} catch (error) {
		// insertMany with ordered:false can throw but still insert some records
		if (error.writeErrors) {
			const inserted = error.insertedDocs?.length || 0;
			const failed = error.writeErrors.length;
			console.log(`✓ Bulk created ${inserted} Status records`);
			console.log(`⚠ ${failed} records failed (likely duplicates - skipped)`);
			console.log('');
			return inserted;
		}
		console.error('✗ Creating missing Status records failed:', error.message);
		throw error;
	}
}

/**
 * Run middleware sync on all assignments (BATCH PROCESSING)
 * This ensures all statuses are correct based on Response data
 * and detects removed questionnaires
 */
async function syncAllAssignmentsWithMiddleware(dryRun = false) {
	console.log('Running middleware sync on all assignments...');

	try {
		const assignments = await Assignment.find({}).lean();
		console.log(`Found ${assignments.length} assignments to sync`);

		if (dryRun) {
			console.log('DRY RUN: Analyzing assignments for middleware sync...\n');

			// OPTIMIZED: Get all questionnaires at once
			const allQuestionnaireIds = [
				...new Set(assignments.map((a) => a.questionnaireId.toString()))
			];
			const existingQuestionnaires = await Questionnaire.find({
				_id: { $in: allQuestionnaireIds }
			}).lean();
			const existingQIds = new Set(existingQuestionnaires.map((q) => q._id.toString()));

			// Check which assignments have deleted questionnaires
			const removedAssignments = assignments.filter(
				(a) => !existingQIds.has(a.questionnaireId.toString()) && a.status !== 'removed'
			);

			if (removedAssignments.length > 0) {
				console.log(
					`Would mark ${removedAssignments.length} assignments as 'removed' (questionnaire deleted):`
				);
				removedAssignments.slice(0, 10).forEach((a) => {
					console.log(`  - Assignment ${a._id} (Patient: ${a.patientId})`);
				});
				if (removedAssignments.length > 10) {
					console.log(`  ... and ${removedAssignments.length - 10} more`);
				}
			} else {
				console.log('✓ No assignments with deleted questionnaires found');
			}

			console.log(`\nWould sync all ${assignments.length} assignments with middleware`);
			console.log('This will validate response counts match question counts\n');

			return { wouldRemove: removedAssignments.length };
		}

		let synced = 0;
		let removed = 0;
		let errors = [];

		// Process in batches for better performance
		console.log('Processing assignments in batches...');
		for (let i = 0; i < assignments.length; i += BATCH_SIZE) {
			const batch = assignments.slice(i, i + BATCH_SIZE);

			// Process batch in parallel
			await Promise.all(
				batch.map(async (assignment) => {
					try {
						const result = await syncAssignmentStatus(assignment._id);
						if (result.changed) {
							synced++;
							if (result.status === 'removed') {
								removed++;
							}
						}
					} catch (error) {
						errors.push({
							assignmentId: assignment._id,
							error: error.message
						});
					}
				})
			);

			// Progress update
			const processed = Math.min(i + BATCH_SIZE, assignments.length);
			console.log(`  Processed ${processed}/${assignments.length} assignments`);
		}

		console.log(`✓ Synced ${synced} assignments`);
		if (removed > 0) {
			console.log(`  - Marked as removed: ${removed}`);
		}

		if (errors.length > 0) {
			console.log(`⚠ ${errors.length} errors occurred:`);
			errors.slice(0, 10).forEach((e) => console.log(`  Assignment ${e.assignmentId}: ${e.error}`));
			if (errors.length > 10) {
				console.log(`  ... and ${errors.length - 10} more`);
			}
		}

		console.log('');
		return { synced, removed, errors: errors.length };
	} catch (error) {
		console.error('✗ Middleware sync failed:', error.message);
		throw error;
	}
}

/**
 * Verify migration results
 */
async function verifyMigration() {
	console.log('Verifying migration...');

	try {
		const followupCount = await Followup.countDocuments();
		const statusCount = await Status.countDocuments();
		const patientCount = await User.countDocuments({ userType: 'patient' });
		const assignmentCount = await Assignment.countDocuments();
		const completedWithoutDate = await Assignment.countDocuments({
			status: 'completed',
			completedAt: null
		});

		// Get counts for new status values
		const notStartedCount = await Assignment.countDocuments({ status: 'not_started' });
		const inProgressCount = await Assignment.countDocuments({ status: 'in_progress' });
		const removedCount = await Assignment.countDocuments({ status: 'removed' });
		const pendingCount = await Assignment.countDocuments({ status: 'pending' });

		// Check for assignments not in any Status record
		const allStatuses = await Status.find({}).lean();
		const assignmentsInStatus = new Set();
		allStatuses.forEach((status) => {
			status.assignmentIds.forEach((id) => assignmentsInStatus.add(id.toString()));
		});

		const allAssignments = await Assignment.find({}).lean();
		const orphanedAssignments = allAssignments.filter(
			(a) => !assignmentsInStatus.has(a._id.toString())
		);

		console.log('\nMigration Summary:');
		console.log('==================');
		console.log(`Total Patients: ${patientCount}`);
		console.log(`Followup Records: ${followupCount}`);
		console.log(`Status Records: ${statusCount}`);
		console.log(`Total Assignments: ${assignmentCount}`);
		console.log(`Assignments in Status records: ${assignmentsInStatus.size}`);
		console.log(`Orphaned Assignments (not in any Status): ${orphanedAssignments.length}`);
		console.log(`Completed Assignments without completedAt: ${completedWithoutDate}`);
		console.log('\nAssignment Status Breakdown:');
		console.log(`  Not Started: ${notStartedCount}`);
		console.log(`  In Progress: ${inProgressCount}`);
		console.log(`  Removed: ${removedCount}`);
		console.log(`  Pending (legacy): ${pendingCount}`);

		// Check for discrepancies
		const warnings = [];

		if (statusCount < patientCount) {
			warnings.push(`⚠ Status count (${statusCount}) is less than patient count (${patientCount})`);
		}

		if (completedWithoutDate > 0) {
			warnings.push(`⚠ ${completedWithoutDate} completed assignments still missing completedAt`);
		}

		if (orphanedAssignments.length > 0) {
			warnings.push(
				`⚠ ${orphanedAssignments.length} assignments are not referenced in any Status record`
			);
			console.log('\nOrphaned Assignments:');
			orphanedAssignments.slice(0, 10).forEach((a) => {
				console.log(`  - Assignment ${a._id} (Patient: ${a.patientId}, Status: ${a.status})`);
			});
			if (orphanedAssignments.length > 10) {
				console.log(`  ... and ${orphanedAssignments.length - 10} more`);
			}
		}

		if (warnings.length > 0) {
			console.log('\nWarnings:');
			warnings.forEach((w) => console.log(w));
		} else {
			console.log('\n✓ Migration verification passed!');
		}

		return warnings.length === 0;
	} catch (error) {
		console.error('✗ Verification failed:', error.message);
		throw error;
	}
}

/**
 * Print comprehensive dry-run summary
 */
async function printDryRunSummary() {
	console.log('\n' + '='.repeat(60));
	console.log('COMPREHENSIVE DRY-RUN SUMMARY');
	console.log('='.repeat(60));

	// Get all statistics
	const totalPatients = await User.countDocuments({ userType: 'patient' });
	const followupCount = await Followup.countDocuments();
	const totalAssignments = await Assignment.countDocuments();
	const existingStatusCount = await Status.countDocuments();

	// Assignment statistics
	const completedCount = await Assignment.countDocuments({ status: 'completed' });
	const downloadedCount = await Assignment.countDocuments({ status: 'downloaded' });
	const inProgressCount = await Assignment.countDocuments({ status: 'in_progress' });
	const notStartedCount = await Assignment.countDocuments({ status: 'not_started' });
	const pendingCount = await Assignment.countDocuments({ status: 'pending' });
	const removedCount = await Assignment.countDocuments({ status: 'removed' });

	// Calculate what will be affected
	const completedWithoutDate = await Assignment.countDocuments({
		status: 'completed',
		completedAt: null
	});

	const patientsWithFollowup = followupCount;
	const patientsWithoutFollowup = totalPatients - patientsWithFollowup;

	console.log('\n📊 CURRENT DATABASE STATE');
	console.log('─'.repeat(60));
	console.log(`Total Patients: ${totalPatients}`);
	console.log(`Existing Followup Records: ${followupCount}`);
	console.log(
		`Existing Status Records: ${existingStatusCount} ${existingStatusCount > 0 ? '(will be CLEARED)' : ''}`
	);
	console.log(`Total Assignments: ${totalAssignments}`);

	console.log('\n📋 ASSIGNMENT STATUS BREAKDOWN (Current)');
	console.log('─'.repeat(60));
	console.log(
		`  Not Started: ${notStartedCount} (${Math.round((notStartedCount / totalAssignments) * 100)}%)`
	);
	console.log(
		`  In Progress: ${inProgressCount} (${Math.round((inProgressCount / totalAssignments) * 100)}%)`
	);
	console.log(
		`  Completed: ${completedCount} (${Math.round((completedCount / totalAssignments) * 100)}%)`
	);
	console.log(
		`  Downloaded: ${downloadedCount} (${Math.round((downloadedCount / totalAssignments) * 100)}%)`
	);
	console.log(
		`  Pending (legacy): ${pendingCount} (${Math.round((pendingCount / totalAssignments) * 100)}%)`
	);
	console.log(
		`  Removed: ${removedCount} (${Math.round((removedCount / totalAssignments) * 100)}%)`
	);

	console.log('\n🔄 CHANGES THAT WILL BE MADE');
	console.log('─'.repeat(60));

	// Status records to be created
	const totalStatusToCreate = totalPatients;
	console.log(`\n1️⃣  STATUS RECORDS:`);
	console.log(`   Will create: ${totalStatusToCreate} Status records`);
	console.log(`   • From Followup: ${patientsWithFollowup} patients`);
	console.log(`   • New (no Followup): ${patientsWithoutFollowup} patients`);

	// Assignment updates
	console.log(`\n2️⃣  ASSIGNMENT UPDATES:`);
	if (completedWithoutDate > 0) {
		console.log(`   Will add completedAt timestamp: ${completedWithoutDate} assignments`);
	} else {
		console.log(`   ✓ No assignments need completedAt updates`);
	}

	// Orphaned records check
	const patients = await User.find({ userType: 'patient' }).lean();
	const validPatientIds = new Set(patients.map((p) => p._id.toString()));
	const allAssignments = await Assignment.find({}).lean();
	const orphanedAssignments = allAssignments.filter(
		(a) => !validPatientIds.has(a.patientId.toString())
	);

	console.log(`\n3️⃣  CLEANUP:`);
	if (orphanedAssignments.length > 0) {
		console.log(`   Will delete: ${orphanedAssignments.length} orphaned assignments`);
	} else {
		console.log(`   ✓ No orphaned assignments to clean up`);
	}

	// Middleware sync preview
	let wouldMarkRemoved = 0;
	for (const assignment of allAssignments.slice(0, 100)) {
		// Sample first 100 for performance
		const questionnaire = await Questionnaire.findById(assignment.questionnaireId);
		if (!questionnaire && assignment.status !== 'removed') {
			wouldMarkRemoved++;
		}
	}
	const estimatedRemoved = Math.round(
		(wouldMarkRemoved / Math.min(100, allAssignments.length)) * allAssignments.length
	);

	console.log(`\n4️⃣  MIDDLEWARE SYNC:`);
	if (estimatedRemoved > 0) {
		console.log(
			`   Will mark as 'removed': ~${estimatedRemoved} assignments (deleted questionnaires)`
		);
	} else {
		console.log(`   ✓ No assignments with deleted questionnaires detected`);
	}

	console.log('\n⚠️  WHAT HAPPENS NEXT');
	console.log('─'.repeat(60));
	console.log('  If you run without --dry-run:');
	console.log('  1. Backup will be created automatically');
	console.log('  2. All changes above will be applied');
	console.log('  3. Verification will run to check results');
	console.log('  4. You can rollback with --rollback if needed');

	console.log('\n💡 NOTE: Patient statuses (onboarded/active/completed) are calculated');
	console.log('    based on their assignment progress. See detailed breakdowns above.');

	console.log('\n' + '='.repeat(60));
}

/**
 * Main migration function
 */
async function runMigration(options = {}) {
	const { dryRun = false, rollback = false } = options;

	console.log('='.repeat(60));
	console.log('Followup to Status Migration');
	console.log('='.repeat(60));
	console.log(`Mode: ${dryRun ? 'DRY RUN' : rollback ? 'ROLLBACK' : 'LIVE'}`);
	console.log(`Started at: ${new Date().toISOString()}\n`);

	try {
		// Connect to database
		await connectToDatabase();
		console.log('✓ Connected to database\n');

		if (rollback) {
			// Rollback mode
			await restoreFromBackup();
		} else {
			// Migration mode
			if (!dryRun) {
				await createBackup();

				// Clear existing Status records to prevent duplicates
				const existingStatusCount = await Status.countDocuments();
				if (existingStatusCount > 0) {
					await Status.deleteMany({});
					console.log(`✓ Cleared ${existingStatusCount} existing Status records\n`);
				}
			}

			await cleanupOrphanedAssignments(dryRun);

			// Validate completion status before any updates
			await validateAssignmentCompleteness(dryRun);

			await updateAssignments(dryRun);

			// Run middleware sync to ensure all statuses are correct
			// This will auto-correct any assignments marked complete but missing responses
			await syncAllAssignmentsWithMiddleware(dryRun);

			if (dryRun) {
				// Show comprehensive summary for dry-run
				await printDryRunSummary();
			} else {
				await verifyMigration();
			}
		}

		console.log('='.repeat(60));
		console.log(
			`${dryRun ? 'DRY RUN' : rollback ? 'ROLLBACK' : 'MIGRATION'} COMPLETED SUCCESSFULLY`
		);
		console.log(`Finished at: ${new Date().toISOString()}`);
		console.log('='.repeat(60));
	} catch (error) {
		console.error('\n' + '='.repeat(60));
		console.error('MIGRATION FAILED');
		console.error('='.repeat(60));
		console.error('Error:', error.message);
		console.error('Stack:', error.stack);
		process.exit(1);
	} finally {
		await mongoose.connection.close();
		console.log('\n✓ Database connection closed');
	}
}

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
	dryRun: args.includes('--dry-run'),
	rollback: args.includes('--rollback')
};

// Run migration
runMigration(options);
