import { json } from '@sveltejs/kit';
import { Assignment, Response, Status } from '$lib/database/schemas.js';
import { updatePatientStatus } from '$lib/database/questionnaireResults.js';

/** @type {import('./$types').RequestHandler} */
export async function DELETE({ params, locals }) {
	try {
		// Check if user is admin
		if (!locals.user || locals.user.userType !== 'admin') {
			return new Response('Unauthorized', { status: 401 });
		}

		const testId = params.testId;
		if (!testId) {
			return json({ error: 'Test ID is required' }, { status: 400 });
		}

		// Delete the assignment
		const deletedAssignment = await Assignment.findByIdAndDelete(testId);
		if (!deletedAssignment) {
			return json({ error: 'Test not found' }, { status: 404 });
		}

		// Delete associated responses
		await Response.deleteMany({ assignmentId: testId });

		// Update Status collection
		const status = await Status.findOne({
			assignmentIds: deletedAssignment._id
		});

		if (status) {
			// Remove from assignmentIds array
			status.assignmentIds = status.assignmentIds.filter((id) => id.toString() !== testId);
			await status.save();

			// Update patient status
			await updatePatientStatus(deletedAssignment.patientId, false);
		}

		return json({ message: 'Test and associated responses deleted successfully' });
	} catch (error) {
		console.error('Error deleting test:', error);
		return json({ error: 'Failed to delete test' }, { status: 500 });
	}
}
