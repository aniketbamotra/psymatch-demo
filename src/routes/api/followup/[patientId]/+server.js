import { json } from '@sveltejs/kit';
import mongoose from 'mongoose';
import { Status, User, Assignment, Response } from '$lib/database/schemas.js';
import { batchSyncAssignments, updatePatientStatus } from '$lib/database/questionnaireResults.js';
import { normalizeLanguage } from '$lib/utils/language.js';

/**
 * GET /api/followup/:patientId
 * Returns comprehensive patient information for the detail view
 * Query params:
 *   - skipSync: Set to 'true' to skip self-healing sync (faster but no validation)
 */
export async function GET({ params, locals, url }) {
	try {
		// Authentication check
		if (!locals.user || locals.user.userType !== 'admin') {
			return json(
				{
					success: false,
					error: 'Unauthorized access',
					code: 'UNAUTHORIZED'
				},
				{ status: 401 }
			);
		}

		const { patientId } = params;

		// Validate patientId format
		if (!mongoose.Types.ObjectId.isValid(patientId)) {
			return json(
				{
					success: false,
					error: 'Invalid patient ID format',
					code: 'INVALID_ID'
				},
				{ status: 400 }
			);
		}

		// Fetch patient information
		const patient = await User.findById(patientId).lean();
		console.log('Fetched patient:', patient);
		if (!patient || patient.userType !== 'patient') {
			return json(
				{
					success: false,
					error: 'Patient not found',
					code: 'NOT_FOUND'
				},
				{ status: 404 }
			);
		}

		// Check for skipSync query parameter (default: false - sync enabled)
		const skipSync = url.searchParams.get('skipSync') === 'true';

		// Fetch assignments for this patient (excluding removed)
		const assignments = await Assignment.find({
			patientId,
			status: { $ne: 'removed' } // Exclude removed assignments
		})
			.populate('questionnaireId', 'title questions')
			.sort({ assignedAt: -1 })
			.lean();

		// Self-healing: Batch sync all assignments (unless skipped)
		if (!skipSync) {
			// Batch sync this patient's assignments (50 at a time) - MUCH FASTER!
			const assignmentIds = assignments.map((a) => a._id);
			if (assignmentIds.length > 0) {
				await batchSyncAssignments(assignmentIds, 500);
			}

			// Update patient status after syncing assignments
			await updatePatientStatus(patientId);
		}

		// Refresh assignments after sync (or use original if skipped)
		const syncedAssignments = skipSync
			? assignments
			: await Assignment.find({
					patientId,
					status: { $ne: 'removed' } // Exclude removed assignments
				})
					.populate('questionnaireId', 'title questions')
					.sort({ assignedAt: -1 })
					.lean();

		// Build assignments array with progress information
		const assignmentsData = await Promise.all(
			syncedAssignments.map(async (assignment) => {
				// Get response to calculate completed questions
				const response = await Response.findOne({ assignmentId: assignment._id }).lean();
				const completedQuestions = response?.responses?.length || 0;
				const totalQuestions = assignment.questionnaireId?.questions?.length || 0;

				return {
					assignmentId: assignment._id,
					assignmentName: assignment.questionnaireId?.title || 'Unknown',
					status: assignment.status,
					completedQuestions,
					totalQuestions,
					assignedAt: assignment.assignedAt,
					completedAt: assignment.completedAt,
					downloadedOn: assignment.downloadedOn
				};
			})
		);

		// Build notes array
		const notes = [];

		// Add intake note if exists
		if (patient.patientProfile?.intakeNote) {
			notes.push({
				text: patient.patientProfile.intakeNote,
				admin: patient.patientProfile.intakeAdmin?.name || 'Unknown',
				intake: true
			});
		}

		// Add other notes
		if (patient.patientProfile?.notes) {
			patient.patientProfile.notes.forEach((note) => {
				notes.push({
					text: note.note,
					admin: note.adminName || 'Unknown'
				});
			});
		}

		// Calculate total interviews (completed assignments)
		const totalInterviews = syncedAssignments.filter(
			(a) => a.status === 'completed' || a.status === 'downloaded'
		).length;

		// Build response
		const result = {
			patientId: patient._id,
			patientName: patient.fullName,
			email: patient.email,
			pronouns: patient.gender,
			phoneNumber: patient.patientProfile?.phoneNumber || '',
			preferredComms: patient.patientProfile?.preferredCommunication || '',
			preferredLanguage: normalizeLanguage(patient.patientProfile?.preferredLanguage),
			dateOfReg: patient.createdAt,
			notes,
			totalInterviews,
			assignments: assignmentsData
		};

		return json(result);
	} catch (err) {
		console.error('Error fetching patient detail:', err);
		return json(
			{
				success: false,
				error: 'Failed to fetch patient details',
				code: 'INTERNAL_ERROR'
			},
			{ status: 500 }
		);
	}
}

/**
 * DELETE /api/followup/:patientId
 * Soft deletes a patient by setting their status to 'inactive'
 */
export async function DELETE({ params, locals }) {
	try {
		// Authentication check
		if (!locals.user || locals.user.userType !== 'admin') {
			return json(
				{
					success: false,
					error: 'Unauthorized access',
					code: 'UNAUTHORIZED'
				},
				{ status: 401 }
			);
		}

		const { patientId } = params;

		// Validate patientId format
		if (!mongoose.Types.ObjectId.isValid(patientId)) {
			return json(
				{
					success: false,
					error: 'Invalid patient ID format',
					code: 'INVALID_ID'
				},
				{ status: 400 }
			);
		}

		// Check if patient exists
		const patient = await User.findById(patientId);

		if (!patient || patient.userType !== 'patient') {
			return json(
				{
					success: false,
					error: 'Patient not found',
					code: 'NOT_FOUND'
				},
				{ status: 404 }
			);
		}

		// Soft delete: Update status to 'inactive'
		const statusUpdate = await Status.findOneAndUpdate(
			{ patientId },
			{
				status: 'inactive',
				updatedAt: new Date()
			},
			{ new: true }
		);

		if (!statusUpdate) {
			return json(
				{
					success: false,
					error: 'Status record not found',
					code: 'NOT_FOUND'
				},
				{ status: 404 }
			);
		}

		console.log(`Patient ${patientId} status set to inactive (soft delete)`);

		// Return 200 status code on successful soft deletion
		return json({ success: true }, { status: 200 });
	} catch (err) {
		console.error('Error soft deleting patient:', err);
		return json(
			{
				success: false,
				error: 'Failed to delete patient',
				code: 'INTERNAL_ERROR'
			},
			{ status: 500 }
		);
	}
}
