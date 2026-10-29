import { json } from '@sveltejs/kit';
import { Status } from '$lib/database/schemas.js';
import {
	batchSyncAssignmentsOptimized,
	batchUpdatePatientStatusesOptimized
} from '$lib/database/questionnaireResults.js';

/**
 * GET /api/followup
 * Returns patient followup cards organized by status categories
 * Query params:
 *   - skipSync: Set to 'true' to skip self-healing sync (faster but no validation)
 */
export async function GET({ locals, url }) {
	console.time('⏱️ Total followup request');

	try {
		// 1. Auth check
		console.time('⏱️ Auth check');
		if (!locals.user || locals.user.userType !== 'admin') {
			console.timeEnd('⏱️ Auth check');
			console.timeEnd('⏱️ Total followup request');
			return json(
				{
					success: false,
					error: 'Unauthorized access',
					code: 'UNAUTHORIZED'
				},
				{ status: 401 }
			);
		}
		console.timeEnd('⏱️ Auth check');

		// Check for skipSync query parameter (default: false - sync enabled)
		const skipSync = url.searchParams.get('skipSync') === 'true';

		// 2. Fetch all statuses with patient information
		console.time('⏱️ Fetch statuses from DB');
		const statuses = await Status.find().populate('patientId', 'fullName gender').lean();
		console.timeEnd('⏱️ Fetch statuses from DB');
		console.log(`📊 Found ${statuses.length} status records`);

		// 3. Self-healing: Batch sync all assignments (unless skipped)
		if (!skipSync) {
			console.time('⏱️ Self-healing (total)');

			// 3a. Collect all assignment IDs from all patients
			console.time('⏱️ Collect assignment IDs');
			const allAssignmentIds = [];
			for (const statusDoc of statuses) {
				if (statusDoc.assignmentIds && statusDoc.assignmentIds.length > 0) {
					allAssignmentIds.push(...statusDoc.assignmentIds);
				}
			}
			console.timeEnd('⏱️ Collect assignment IDs');
			console.log(`📊 Collected ${allAssignmentIds.length} assignment IDs`);

			// 3b. Batch sync all assignments using OPTIMIZED aggregation pipeline
			if (allAssignmentIds.length > 0) {
				console.time('⏱️ Batch sync assignments');
				await batchSyncAssignmentsOptimized(allAssignmentIds);
				console.timeEnd('⏱️ Batch sync assignments');
			}

			// 3c. Batch update patient statuses after syncing assignments
			console.time('⏱️ Collect patient IDs');
			const patientIds = statuses.filter((s) => s.patientId).map((s) => s.patientId._id);
			console.timeEnd('⏱️ Collect patient IDs');
			console.log(`📊 Collected ${patientIds.length} patient IDs`);

			if (patientIds.length > 0) {
				console.time('⏱️ Batch update patient statuses');
				await batchUpdatePatientStatusesOptimized(patientIds);
				console.timeEnd('⏱️ Batch update patient statuses');
			}

			console.timeEnd('⏱️ Self-healing (total)');
		}

		// 4. Refresh statuses after sync (or use original if skipped)
		console.time('⏱️ Refresh statuses from DB');
		const syncedStatuses = skipSync
			? statuses
			: await Status.find().populate('patientId', 'fullName gender').lean();
		console.timeEnd('⏱️ Refresh statuses from DB');

		// 5. Organize patients by status
		console.time('⏱️ Organize and sort results');
		const result = {
			onboarded: [],
			active: [],
			completed: []
		};

		for (const statusDoc of syncedStatuses) {
			if (!statusDoc.patientId) continue;

			const patientCard = {
				patientId: statusDoc.patientId._id,
				patientName: statusDoc.patientId.fullName,
				pronouns: statusDoc.patientId.gender,
				status: statusDoc.status,
				date: statusDoc.lastActivity
			};

			// Add to appropriate category (skip inactive)
			if (statusDoc.status === 'onboarded') {
				result.onboarded.push(patientCard);
			} else if (statusDoc.status === 'active') {
				result.active.push(patientCard);
			} else if (statusDoc.status === 'completed') {
				result.completed.push(patientCard);
			}
		}

		// Sort each category by date (most recent first)
		result.onboarded.sort((a, b) => new Date(b.date) - new Date(a.date));
		result.active.sort((a, b) => new Date(b.date) - new Date(a.date));
		result.completed.sort((a, b) => new Date(b.date) - new Date(a.date));
		console.timeEnd('⏱️ Organize and sort results');

		console.timeEnd('⏱️ Total followup request');
		console.log(
			`📊 Final counts: onboarded=${result.onboarded.length}, active=${result.active.length}, completed=${result.completed.length}`
		);

		return json(result);
	} catch (error) {
		console.timeEnd('⏱️ Total followup request');
		console.error('Error fetching patient followup cards:', error);
		return json(
			{
				success: false,
				error: 'Failed to fetch patient data',
				code: 'INTERNAL_ERROR'
			},
			{ status: 500 }
		);
	}
}
