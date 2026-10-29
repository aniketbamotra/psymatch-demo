import * as api from '$lib/api';

export async function updateTestProgress(test) {
	try {
		// Use test_code if available, otherwise safely handle test_name which might be an object
		const param =
			test.test_code ||
			(typeof test.test_name === 'object'
				? test.test_name.en || Object.values(test.test_name)[0]
				: test.test_name);

		// Fetch questionnaire data to get total questions
		const questionnaireResponse = await api.get(
			`/api/questionnaires?testName=${encodeURIComponent(param)}`
		);
		let totalQuestions = 0;
		if (questionnaireResponse.ok) {
			const questionnaireData = await questionnaireResponse.json();
			totalQuestions = questionnaireData.questions?.length || 0;
		}

		// Fetch progress data
		const progressResponse = await api.get(
			`/api/questionnaire-results?testName=${encodeURIComponent(param)}`
		);
		if (progressResponse.ok) {
			const progress = await progressResponse.json();

			// Calculate completed questions from progress data
			const completedQuestions = progress ? progress.responses?.length : 0;

			// Calculate remaining questions
			const remainingQuestions = completedQuestions;

			// Calculate progress percentage
			const progressPercentage =
				totalQuestions > 0 ? Math.round((completedQuestions / totalQuestions) * 100) : 0;

			// Determine status
			let status = '';
			if (completedQuestions.completed_at && completedQuestions === totalQuestions) {
				status = 'completed';
			} else if (completedQuestions > 0) {
				status = 'started';
			}

			// Update test object with calculated values
			const updatedTest = {
				...test,
				status,
				progress: progressPercentage,
				questionLeft: remainingQuestions,
				questionTotal: totalQuestions
			};

			return updatedTest;
		}
	} catch (err) {
		console.error('Error updating test progress:', err);
		return test;
	}
}
