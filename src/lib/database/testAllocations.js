import {
	User,
	Questionnaire,
	Assignment,
	Response,
	Status,
	QuestionnaireOrder
} from './schemas.js';
import { updatePatientStatus, batchSyncAssignments } from './questionnaireResults.js';

export async function allocateTestsToMockPatients() {
	try {
		const mockPatients = await User.find({ userType: 'patient' });
		const admin = await User.findOne({ userType: 'admin' });

		if (!admin) {
			throw new Error('No admin user found to allocate tests');
		}

		const questionnaires = await Questionnaire.find();

		for (const patient of mockPatients) {
			for (const questionnaire of questionnaires) {
				await allocateTest(patient._id, questionnaire._id, admin._id);
			}
		}
		console.log('Tests allocated to mock patients');
	} catch (error) {
		console.error('Error allocating tests to mock patients:', error);
	}
}

export async function getAllocatedTests(userId, options = {}) {
	try {
		const { skipSync = false } = options;

		const allocatedTests = await Assignment.find({
			patientId: userId,
			status: { $ne: 'removed' } // Exclude removed assignments
		})
			.populate('questionnaireId')
			.sort({ assignedAt: -1 });

		// Self-healing: Batch sync assignments (unless skipped)
		if (!skipSync) {
			const assignmentIds = allocatedTests.map((a) => a._id);
			if (assignmentIds.length > 0) {
				await batchSyncAssignments(assignmentIds, 500);
			}
		}

		// Refresh assignments after sync (or use original if skipped)
		const syncedTests = skipSync
			? allocatedTests
			: await Assignment.find({
					patientId: userId,
					status: { $ne: 'removed' } // Exclude removed assignments
				})
					.populate('questionnaireId')
					.sort({ assignedAt: -1 });

		console.log(`Fetched allocated tests for user1 ${userId}:`, syncedTests);
		const testsWithProgress = await Promise.all(
			syncedTests.map(async (assignment) => {
				const response = await Response.findOne({ assignmentId: assignment._id });
				return {
					test_code: assignment.questionnaireId.test_code,
					displayTextBeforeQuestions: assignment.questionnaireId.displayTextBeforeQuestions,
					test_name: assignment.questionnaireId.title,
					allocated_at: assignment.assignedAt,
					progress: response
						? response.responses.length / assignment.questionnaireId.questions.length
						: 0,
					completed_at: assignment.status === 'completed' ? response.submittedAt : null
				};
			})
		);

		console.log(`Fetched allocated tests for user2 ${userId}:`, testsWithProgress);
		return testsWithProgress;
	} catch (error) {
		console.error('Error fetching allocated tests:', error);
		throw error;
	}
}

export async function allocateTest(patientId, questionnaireId, adminId) {
	try {
		const existingAllocation = await Assignment.findOne({
			patientId: patientId,
			questionnaireId: questionnaireId
		});

		if (existingAllocation) {
			return { success: false, message: 'This questionnaire is already allocated to the user' };
		}

		const newAssignment = new Assignment({
			patientId: patientId,
			questionnaireId: questionnaireId,
			assignedBy: adminId,
			status: 'not_started'
		});

		await newAssignment.save();

		// Update or create Status record
		const existingStatus = await Status.findOne({ patientId: patientId });

		if (existingStatus) {
			// Update existing status
			existingStatus.assignmentIds.push(newAssignment._id);
			existingStatus.lastActivity = new Date();
			await existingStatus.save();

			// Use updatePatientStatus for consistency
			// Force update because new allocation is activity
			await updatePatientStatus(patientId, true);
		} else {
			// Create new status (patient just registered)
			const newStatus = new Status({
				patientId: patientId,
				status: 'onboarded',
				assignmentIds: [newAssignment._id],
				lastActivity: new Date()
			});
			await newStatus.save();
		}

		const questionnaire = await Questionnaire.findById(questionnaireId);
		console.log(`Allocated ${questionnaire.title} to user ${patientId}`);
		return { success: true, message: `${questionnaire.title} allocated successfully` };
	} catch (error) {
		console.error('Error allocating test:', error);
		throw error;
	}
}

export async function allocateTestsBatch(patientId, questionnaireIds, adminId) {
	try {
		if (!questionnaireIds || questionnaireIds.length === 0) {
			return { success: true, message: 'No questionnaires to allocate', results: [] };
		}

		// Find existing allocations
		const existingAllocations = await Assignment.find({
			patientId: patientId,
			questionnaireId: { $in: questionnaireIds }
		});

		const existingQuestionnaireIds = existingAllocations.map((a) => a.questionnaireId.toString());

		// Filter out already allocated ones
		const newQuestionnaireIds = questionnaireIds.filter(
			(id) => !existingQuestionnaireIds.includes(id.toString())
		);

		if (newQuestionnaireIds.length === 0) {
			return {
				success: false,
				message: 'All selected questionnaires are already allocated',
				results: []
			};
		}

		// Create new assignments array
		const newAssignments = newQuestionnaireIds.map((qid) => ({
			patientId: patientId,
			questionnaireId: qid,
			assignedBy: adminId,
			status: 'not_started'
		}));

		// Bulk insert new assignments
		const insertedAssignments = await Assignment.insertMany(newAssignments);
		const newAssignmentIds = insertedAssignments.map((a) => a._id);

		// Update or create Status record
		const existingStatus = await Status.findOne({ patientId: patientId });

		if (existingStatus) {
			// Update existing status
			existingStatus.assignmentIds.push(...newAssignmentIds);
			existingStatus.lastActivity = new Date();
			await existingStatus.save();

			// Use updatePatientStatus for consistency
			await updatePatientStatus(patientId, true);
		} else {
			// Create new status (patient just registered)
			const newStatus = new Status({
				patientId: patientId,
				status: 'onboarded',
				assignmentIds: newAssignmentIds,
				lastActivity: new Date()
			});
			await newStatus.save();
		}

		console.log(
			`Allocated ${newQuestionnaireIds.length} questionnaires to user ${patientId} in batch`
		);
		return {
			success: true,
			message: `${newQuestionnaireIds.length} test(s) allocated successfully`,
			results: insertedAssignments
		};
	} catch (error) {
		console.error('Error in batch allocating tests:', error);
		throw error;
	}
}

// New function to get a specific allocated test
export async function getAllocatedTest(userId, testName) {
	try {
		const questionnaire = await Questionnaire.findOne({ title: testName });
		if (!questionnaire) {
			throw new Error(`Questionnaire ${testName} not found`);
		}

		const assignment = await Assignment.findOne({
			patientId: userId,
			questionnaireId: questionnaire._id
		}).populate('questionnaireId');

		if (!assignment) {
			return null;
		}

		const response = await Response.findOne({ assignmentId: assignment._id });

		return {
			test_name: assignment.questionnaireId.title,
			allocated_at: assignment.assignedAt,
			progress: response
				? response.responses.length / assignment.questionnaireId.questions.length
				: 0,
			completed_at: assignment.status === 'completed' ? response.submittedAt : null,
			questions: assignment.questionnaireId.questions
		};
	} catch (error) {
		console.error('Error fetching allocated test:', error);
		throw error;
	}
}

export async function getNextRecommendedTest(userId) {
	try {
		// 1. Get the global order
		const orderDoc = await QuestionnaireOrder.findOne().sort({ lastUpdatedAt: -1 });
		const orderedTestCodes = orderDoc ? orderDoc.orderedTestCodes : [];

		// 2. Get all active assignments for the user
		// We exclude 'removed' and 'completed' because we only want to recommend what's next
		// Actually, we might want to include 'completed' to check if *everything* is done,
		// but the requirement says "suggest which interview should user take".
		// If we fetch ALL, we can determine if "all completed" is true.
		const assignments = await Assignment.find({
			patientId: userId,
			status: { $ne: 'removed' }
		}).populate('questionnaireId');

		if (!assignments || assignments.length === 0) {
			return { all_completed: true }; // Or no tests assigned
		}

		// 3. Check if all are completed
		const allCompleted = assignments.every(
			(a) => a.status === 'completed' || a.status === 'downloaded'
		);
		if (allCompleted) {
			return { all_completed: true };
		}

		// 4. Filter for incomplete tests
		const incompleteAssignments = assignments.filter(
			(a) => a.status !== 'completed' && a.status !== 'downloaded'
		);

		if (incompleteAssignments.length === 0) {
			return { all_completed: true };
		}

		// 5. Sort incomplete assignments based on order
		// If a test code is not in the order list, put it at the end
		incompleteAssignments.sort((a, b) => {
			const codeA = a.questionnaireId.test_code;
			const codeB = b.questionnaireId.test_code;

			let indexA = orderedTestCodes.indexOf(codeA);
			let indexB = orderedTestCodes.indexOf(codeB);

			if (indexA === -1) indexA = 9999;
			if (indexB === -1) indexB = 9999;

			return indexA - indexB;
		});

		// 6. Pick the first one
		const recommended = incompleteAssignments[0];

		// 7. Get progress details
		const response = await Response.findOne({ assignmentId: recommended._id });
		const questionTotal = recommended.questionnaireId.questions.length;
		const responsesCount = response ? response.responses.length : 0;

		// Calculate progress percentage
		const progress = Math.round((responsesCount / questionTotal) * 100);

		return {
			test_code: recommended.questionnaireId.test_code,
			title: recommended.questionnaireId.title,
			date: recommended.assignedAt,
			status: recommended.status,
			progress: progress,
			questionCurrent: responsesCount + 1, // Next question to answer (1-indexed)
			questionTotal: questionTotal,
			disabled: false, // Can add logic here if needed
			totalInterviewsLeft: incompleteAssignments.length, // Total incomplete interviews
			all_completed: false
		};
	} catch (error) {
		console.error('Error getting recommended test:', error);
		throw error;
	}
}
