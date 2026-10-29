/**
 * Stressful Beliefs Index Report Processor
 * Processes responses and generates structured report data
 */

// Function to get full pronoun object based on gender
function getFullPronoun(pronoun) {
	const pronounMap = {
		he: {
			subject: 'he',
			object: 'him',
			possessive: 'his',
			action: 'himself',
			actions: 'himselves'
		},
		she: {
			subject: 'she',
			object: 'her',
			possessive: 'her',
			action: 'herself',
			actions: 'herselves'
		},
		they: {
			subject: 'they',
			object: 'them',
			possessive: 'their',
			action: 'theirself',
			actions: 'themselves'
		},
		other: {
			subject: 'they',
			object: 'them',
			possessive: 'their',
			action: 'theirself',
			actions: 'themselves'
		} // Default
	};
	console.log('pronountomap', pronoun);

	return pronounMap[pronoun.toLowerCase()] || pronounMap['they/them'];
}
// Question groupings by section
const SECTION_DEFINITIONS = {
	perfection: {
		title: 'PERFECTION',
		questions: ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7']
	},
	approval: {
		title: 'APPROVAL',
		questions: ['q8', 'q9', 'q10', 'q11', 'q12', 'q13', 'q14', 'q15']
	},
	life: {
		title: 'LIFE',
		questions: ['q16', 'q17', 'q18', 'q19', 'q20', 'q21', 'q22']
	},
	others: {
		title: 'OTHERS',
		questions: ['q23', 'q24', 'q25', 'q26', 'q27', 'q28', 'q29', 'q30']
	},
	hopeless: {
		title: 'HOPELESS',
		questions: ['q31', 'q32', 'q33', 'q34', 'q35', 'q36', 'q37']
	},
	lonely: {
		title: 'LONELY',
		questions: ['q38', 'q39', 'q40', 'q41', 'q42', 'q43', 'q44']
	},
	metaCognitions: {
		title: 'META-COGNITIONS',
		questions: ['q45', 'q46', 'q47', 'q48', 'q49', 'q50', 'q51']
	}
};

// Question interpretation maps
const questionInterpretationMaps = {
	// PERFECTION SECTION
	q1: {
		0: 'does not find making mistakes upsetting at all',
		1: 'finds making mistakes a little upsetting',
		2: 'finds making mistakes somewhat upsetting',
		3: 'finds making mistakes quite upsetting',
		4: 'finds making mistakes extremely upsetting'
	},
	q2: {
		0: 'does not find striving for perfection important at all',
		1: 'finds striving for perfection a little important',
		2: 'finds striving for perfection somewhat important',
		3: 'finds striving for perfection quite important',
		4: 'finds striving for perfection extremely important'
	},
	q3: {
		0: (pronouns) =>
			`does not get down on ${pronouns.actions} at all when not meeting expectations`,
		1: (pronouns) => `gets a little down on ${pronouns.actions} when not meeting expectations`,
		2: (pronouns) => `gets somewhat down on ${pronouns.actions} when not meeting expectations`,
		3: (pronouns) => `gets quite down on ${pronouns.actions} when not meeting expectations`,
		4: (pronouns) => `gets extremely down on ${pronouns.actions} when not meeting expectations`
	},
	q4: {
		0: 'does not strive for perfection at all',
		1: 'strives a little for perfection',
		2: 'strives somewhat for perfection',
		3: 'strives quite a bit for perfection',
		4: 'strives extremely for perfection'
	},
	q5: {
		0: 'does not agree at all that anything worth doing should be done well',
		1: 'agrees a little that anything worth doing should be done well',
		2: 'somewhat agrees that anything worth doing should be done well',
		3: 'quite strongly agrees that anything worth doing should be done well',
		4: 'extremely strongly agrees that anything worth doing should be done well'
	},
	q6: {
		0: (pronouns) => `does not feel ${pronouns.possessive} self-worth is tied to success at all`,
		1: (pronouns) => `feels ${pronouns.possessive} self-worth is a little tied to success`,
		2: (pronouns) => `feels ${pronouns.possessive} self-worth is somewhat tied to success`,
		3: (pronouns) => `feels ${pronouns.possessive} self-worth is quite tied to success`,
		4: (pronouns) => `feels ${pronouns.possessive} self-worth is extremely tied to success`
	},
	q7: {
		0: (pronouns) =>
			`does not feel project failure would reduce ${pronouns.possessive} sense of self-worth at all`,
		1: (pronouns) =>
			`feels project failure would reduce ${pronouns.possessive} sense of self-worth a little`,
		2: (pronouns) =>
			`feels project failure would somewhat reduce ${pronouns.possessive} sense of self-worth`,
		3: (pronouns) =>
			`feels project failure would quite reduce ${pronouns.possessive} sense of self-worth`,
		4: (pronouns) =>
			`feels project failure would extremely reduce ${pronouns.possessive} sense of self-worth`
	},
	// APPROVAL SECTION
	q8: {
		0: (pronouns) =>
			`does not find it upsetting at all to think someone is angry with ${pronouns.object}`,
		1: (pronouns) =>
			`finds it a little upsetting to think someone is angry with ${pronouns.object}`,
		2: (pronouns) =>
			`finds it somewhat upsetting to think someone is angry with ${pronouns.object}`,
		3: (pronouns) => `finds it quite upsetting to think someone is angry with ${pronouns.object}`,
		4: (pronouns) =>
			`finds it extremely upsetting to think someone is angry with ${pronouns.object}`
	},
	q9: {
		0: (pronouns) =>
			`does not try at all to get people to like ${pronouns.object} if they sense dislike`,
		1: (pronouns) =>
			`tries a little to get people to like ${pronouns.object} if they sense dislike`,
		2: (pronouns) =>
			`tries somewhat to get people to like ${pronouns.object} if they sense dislike`,
		3: (pronouns) =>
			`tries quite hard to get people to like ${pronouns.object} if they sense dislike`,
		4: (pronouns) =>
			`tries extremely hard to get people to like ${pronouns.object} if they sense dislike`
	},
	q10: {
		0: (pronouns) =>
			`does not take it personally at all when others think poorly of ${pronouns.object}`,
		1: (pronouns) => `takes it a little personally when others think poorly of ${pronouns.object}`,
		2: (pronouns) => `takes it somewhat personally when others think poorly of ${pronouns.object}`,
		3: (pronouns) => `takes it quite personally when others think poorly of ${pronouns.object}`,
		4: (pronouns) => `takes it extremely personally when others think poorly of ${pronouns.object}`
	},
	q11: {
		0: (pronouns) => `does not feel at all upset when someone doesn't like ${pronouns.object}`,
		1: (pronouns) => `feels a little upset when someone doesn't like ${pronouns.object}`,
		2: (pronouns) => `feels somewhat upset when someone doesn't like ${pronouns.object}`,
		3: (pronouns) => `feels quite upset when someone doesn't like ${pronouns.object}`,
		4: (pronouns) => `feels extremely upset when someone doesn't like ${pronouns.object}`
	},
	q12: {
		0: 'does not take it personally at all when left out of activities',
		1: 'takes it a little personally when left out of activities',
		2: 'takes it somewhat personally when left out of activities',
		3: 'takes it quite personally when left out of activities',
		4: 'takes it extremely personally when left out of activities'
	},
	q13: {
		0: (pronouns) => `does not become upset at all when people disagree with ${pronouns.object}`,
		1: (pronouns) => `becomes a little upset when people disagree with ${pronouns.object}`,
		2: (pronouns) => `becomes somewhat upset when people disagree with ${pronouns.object}`,
		3: (pronouns) => `becomes quite upset when people disagree with ${pronouns.object}`,
		4: (pronouns) => `becomes extremely upset when people disagree with ${pronouns.object}`
	},
	q14: {
		0: (pronouns) =>
			`does not feel it's important at all that others think highly of ${pronouns.object}`,
		1: (pronouns) => `feels it's a little important that others think highly of ${pronouns.object}`,
		2: (pronouns) => `feels it's somewhat important that others think highly of ${pronouns.object}`,
		3: (pronouns) => `feels it's quite important that others think highly of ${pronouns.object}`,
		4: (pronouns) => `feels it's extremely important that others think highly of ${pronouns.object}`
	},
	q15: {
		0: 'would not feel devastated at all by a falling out with a friend',
		1: 'would feel a little devastated by a falling out with a friend',
		2: 'would feel somewhat devastated by a falling out with a friend',
		3: 'would feel quite devastated by a falling out with a friend',
		4: 'would feel extremely devastated by a falling out with a friend'
	},
	// LIFE SECTION
	q16: {
		0: 'does not become upset at all when seeing unfairness',
		1: 'becomes a little upset when seeing unfairness',
		2: 'becomes somewhat upset when seeing unfairness',
		3: 'becomes quite upset when seeing unfairness',
		4: 'becomes extremely upset when seeing unfairness'
	},
	q17: {
		0: 'does not find current world events discouraging at all',
		1: 'finds current world events a little discouraging',
		2: 'finds current world events somewhat discouraging',
		3: 'finds current world events quite discouraging',
		4: 'finds current world events extremely discouraging'
	},
	q18: {
		0: "can fully tolerate life's uncertainties",
		1: "can mostly tolerate life's uncertainties",
		2: "has some difficulty tolerating life's uncertainties",
		3: "has significant difficulty tolerating life's uncertainties",
		4: "cannot tolerate life's uncertainties at all"
	},
	q19: {
		0: 'can easily tolerate emotional or physical discomfort',
		1: 'can generally tolerate emotional or physical discomfort',
		2: 'has some difficulty tolerating emotional or physical discomfort',
		3: 'has significant difficulty tolerating emotional or physical discomfort',
		4: 'cannot tolerate emotional or physical discomfort at all'
	},
	q20: {
		0: 'accepts and moves forward easily when negative things happen',
		1: 'generally accepts and moves forward when negative things happen',
		2: 'has some difficulty accepting and moving forward when negative things happen',
		3: 'has significant difficulty accepting and moving forward when negative things happen',
		4: 'cannot accept and move forward when negative things happen'
	},
	q21: {
		0: 'does not feel at all that life should be easier',
		1: 'feels a little that life should be easier',
		2: 'feels somewhat that life should be easier',
		3: 'feels quite strongly that life should be easier',
		4: 'feels extremely strongly that life should be easier'
	},
	q22: {
		0: (pronouns) => `does not get upset at all when things don't go ${pronouns.possessive} way`,
		1: (pronouns) => `gets a little upset when things don't go ${pronouns.possessive} way`,
		2: (pronouns) => `gets somewhat upset when things don't go ${pronouns.possessive} way`,
		3: (pronouns) => `gets quite upset when things don't go ${pronouns.possessive} way`,
		4: (pronouns) => `gets extremely upset when things don't go ${pronouns.possessive} way`
	},
	// OTHERS SECTION
	q23: {
		0: (pronouns) =>
			`does not get upset at all when others don't meet ${pronouns.possessive} expectations`,
		1: (pronouns) =>
			`gets a little upset when others don't meet ${pronouns.possessive} expectations`,
		2: (pronouns) =>
			`gets somewhat upset when others don't meet ${pronouns.possessive} expectations`,
		3: (pronouns) => `gets quite upset when others don't meet ${pronouns.possessive} expectations`,
		4: (pronouns) =>
			`gets extremely upset when others don't meet ${pronouns.possessive} expectations`
	},
	q24: {
		0: "is not frustrated at all when others aren't trustworthy",
		1: "is a little frustrated when others aren't trustworthy",
		2: "is somewhat frustrated when others aren't trustworthy",
		3: "is quite frustrated when others aren't trustworthy",
		4: "is extremely frustrated when others aren't trustworthy"
	},
	q25: {
		0: 'does not become upset at all when seeing unfair treatment of others',
		1: 'becomes a little upset when seeing unfair treatment of others',
		2: 'becomes somewhat upset when seeing unfair treatment of others',
		3: 'becomes quite upset when seeing unfair treatment of others',
		4: 'becomes extremely upset when seeing unfair treatment of others'
	},
	q26: {
		0: 'never thinks others are idiots or gets upset about it',
		1: 'rarely thinks others are idiots or gets upset about it',
		2: 'sometimes thinks others are idiots and gets upset about it',
		3: 'often thinks others are idiots and gets upset about it',
		4: 'constantly thinks others are idiots and gets very upset about it'
	},
	q27: {
		0: 'is not annoyed at all by others not trying harder to behave properly',
		1: 'is a little annoyed by others not trying harder to behave properly',
		2: 'is somewhat annoyed by others not trying harder to behave properly',
		3: 'is quite annoyed by others not trying harder to behave properly',
		4: 'is extremely annoyed by others not trying harder to behave properly'
	},
	q28: {
		0: 'accepts and moves on easily when negative things happen',
		1: 'generally accepts and moves on when negative things happen',
		2: 'has some difficulty accepting and moving on when negative things happen',
		3: 'has significant difficulty accepting and moving on when negative things happen',
		4: 'cannot accept and move on when negative things happen'
	},
	q29: {
		0: 'is not annoyed at all by others not trying hard enough',
		1: 'is a little annoyed by others not trying hard enough',
		2: 'is somewhat annoyed by others not trying hard enough',
		3: 'is quite annoyed by others not trying hard enough',
		4: 'is extremely annoyed by others not trying hard enough'
	},
	q30: {
		0: 'does not expect more from others than they see', // "they" here refers to "others", not the patient
		1: 'expects a little more from others than they see',
		2: 'expects somewhat more from others than they see',
		3: 'expects quite a bit more from others than they see',
		4: 'expects extremely more from others than they see'
	},
	// HOPELESS SECTION
	q31: {
		0: (pronouns) => `does not believe ${pronouns.possessive} problems are beyond repair`,
		1: (pronouns) => `believes ${pronouns.possessive} problems are slightly beyond repair`,
		2: (pronouns) => `believes ${pronouns.possessive} problems are somewhat beyond repair`,
		3: (pronouns) => `believes ${pronouns.possessive} problems are quite beyond repair`,
		4: (pronouns) => `believes ${pronouns.possessive} problems are completely beyond repair`
	},
	q32: {
		0: 'believes things can be turned around when going wrong',
		1: 'believes things can usually be turned around when going wrong',
		2: 'has some doubt about turning things around when going wrong',
		3: 'finds it quite difficult to turn things around when going wrong',
		4: "believes it's impossible to turn things around when going wrong"
	},
	q33: {
		0: 'sees clear hope for the future',
		1: 'sees some hope for the future',
		2: 'has mixed feelings about hope for the future',
		3: 'sees little hope for the future',
		4: 'sees no hope for the future'
	},
	q34: {
		0: (pronouns) =>
			`does not attribute negative feelings to factors outside ${pronouns.possessive} control`,
		1: (pronouns) =>
			`rarely attributes negative feelings to factors outside ${pronouns.possessive} control`,
		2: (pronouns) =>
			`sometimes attributes negative feelings to factors outside ${pronouns.possessive} control`,
		3: (pronouns) =>
			`often attributes negative feelings to factors outside ${pronouns.possessive} control`,
		4: (pronouns) =>
			`always attributes negative feelings to factors outside ${pronouns.possessive} control`
	},
	q35: {
		0: (pronouns) => `believes happiness is within ${pronouns.possessive} reach`,
		1: (pronouns) => `believes happiness is mostly within ${pronouns.possessive} reach`,
		2: (pronouns) => `has some doubt about reaching ${pronouns.possessive} happiness goals`,
		3: (pronouns) => `believes happiness is largely out of ${pronouns.possessive} reach`,
		4: (pronouns) => `believes happiness is completely out of ${pronouns.possessive} reach`
	},
	q36: {
		0: (pronouns) => `believes others can help with ${pronouns.possessive} problems`,
		1: (pronouns) => `believes others can usually help with ${pronouns.possessive} problems`,
		2: (pronouns) => `has some doubt about others helping with ${pronouns.possessive} problems`,
		3: (pronouns) => `believes others can rarely help with ${pronouns.possessive} problems`,
		4: (pronouns) => `believes no one can help with ${pronouns.possessive} problems`
	},
	q37: {
		0: 'believes change for the better is realistic',
		1: 'believes change for the better is usually realistic',
		2: 'has some doubt about change for the better',
		3: 'finds change for the better quite unrealistic',
		4: 'finds change for the better completely unrealistic'
	},
	// LONELY SECTION
	q38: {
		0: 'does not feel lonely at all',
		1: 'feels a little lonely',
		2: 'feels somewhat lonely',
		3: 'feels quite lonely',
		4: 'feels extremely lonely'
	},
	q39: {
		0: 'does not feel any lack of companionship',
		1: 'feels a slight lack of companionship',
		2: 'feels some lack of companionship',
		3: 'feels a significant lack of companionship',
		4: 'feels an extreme lack of companionship'
	},
	q40: {
		0: 'does not feel isolated from others',
		1: 'feels slightly isolated from others',
		2: 'feels somewhat isolated from others',
		3: 'feels quite isolated from others',
		4: 'feels extremely isolated from others'
	},
	q41: {
		0: (pronouns) => `does not feel ${pronouns.subject} need more close relationships`,
		1: (pronouns) => `feels ${pronouns.subject} need slightly more close relationships`,
		2: (pronouns) => `feels ${pronouns.subject} need somewhat more close relationships`,
		3: (pronouns) => `feels ${pronouns.subject} need many more close relationships`,
		4: (pronouns) => `feels ${pronouns.subject} desperately need more close relationships`
	},
	q42: {
		0: 'feels well understood by others',
		1: 'feels mostly understood by others',
		2: 'feels somewhat understood by others',
		3: 'feels poorly understood by others',
		4: 'feels completely misunderstood by others'
	},
	q43: {
		0: 'does not want more friends',
		1: 'wants a few more friends',
		2: 'wants somewhat more friends',
		3: 'wants many more friends',
		4: 'desperately wants more friends'
	},
	q44: {
		0: 'feels strongly connected to important communities',
		1: 'feels somewhat connected to important communities',
		2: 'feels moderately disconnected from important communities',
		3: 'feels quite disconnected from important communities',
		4: 'feels completely disconnected from important communities'
	},
	// META-COGNITIONS SECTION
	q45: {
		0: (pronouns) => `does not believe negative feelings reflect badly on ${pronouns.object}`,
		1: (pronouns) => `slightly believes negative feelings reflect badly on ${pronouns.object}`,
		2: (pronouns) => `somewhat believes negative feelings reflect badly on ${pronouns.object}`,
		3: (pronouns) => `strongly believes negative feelings reflect badly on ${pronouns.object}`,
		4: (pronouns) => `completely believes negative feelings reflect badly on ${pronouns.object}`
	},
	q46: {
		0: (pronouns) =>
			`does not believe ${pronouns.subject} have a permanent condition causing ${pronouns.possessive} feelings`,
		1: (pronouns) =>
			`slightly believes ${pronouns.subject} have a permanent condition causing ${pronouns.possessive} feelings`,
		2: (pronouns) =>
			`somewhat believes ${pronouns.subject} have a permanent condition causing ${pronouns.possessive} feelings`,
		3: (pronouns) =>
			`strongly believes ${pronouns.subject} have a permanent condition causing ${pronouns.possessive} feelings`,
		4: (pronouns) =>
			`completely believes ${pronouns.subject} have a permanent condition causing ${pronouns.possessive} feelings`
	},
	q47: {
		0: (pronouns) => `believes ${pronouns.possessive} negative feelings will end`,
		1: (pronouns) => `generally believes ${pronouns.possessive} negative feelings will end`,
		2: (pronouns) => `has some doubt ${pronouns.possessive} negative feelings will end`,
		3: (pronouns) => `strongly doubts ${pronouns.possessive} negative feelings will end`,
		4: (pronouns) => `believes ${pronouns.possessive} negative feelings will never end`
	},
	q48: {
		0: 'does not believe anxiety could lead to dangerous outcomes',
		1: 'slightly believes anxiety could lead to dangerous outcomes',
		2: 'somewhat believes anxiety could lead to dangerous outcomes',
		3: 'strongly believes anxiety could lead to dangerous outcomes',
		4: 'is convinced anxiety will lead to dangerous outcomes'
	},
	q49: {
		0: 'does not believe anxiety indicates mental instability',
		1: 'slightly believes anxiety indicates mental instability',
		2: 'somewhat believes anxiety indicates mental instability',
		3: 'strongly believes anxiety indicates mental instability',
		4: (pronouns) => `is convinced anxiety indicates ${pronouns.subject} are going crazy`
	},
	q50: {
		0: 'does not fear losing control with strong emotions',
		1: 'slightly fears losing control with strong emotions',
		2: 'somewhat fears losing control with strong emotions',
		3: 'strongly fears losing control with strong emotions',
		4: 'is terrified of losing control with strong emotions'
	},
	q51: {
		0: 'accepts having negative emotions as normal',
		1: 'generally accepts having negative emotions',
		2: 'somewhat resents having negative emotions',
		3: 'strongly resents having negative emotions',
		4: 'finds it completely unfair to have negative emotions'
	}
};

/**
 * Process raw responses and filter out skipped questions (value=5)
 */
function processResponses(responses) {
	const validResponses = {};

	Object.entries(responses).forEach(([questionId, response]) => {
		const responseValue = typeof response === 'object' ? response.value : response;

		const numericValue = parseInt(responseValue);

		// Only include responses that are not 5
		if (numericValue !== 5) {
			validResponses[questionId] = numericValue;
		}
	});

	return validResponses;
}

/**
 * Calculate average score for a section
 */
function calculateSectionAverage(responses, sectionQuestions) {
	const sectionResponses = sectionQuestions.filter((q) => q in responses).map((q) => responses[q]);

	if (sectionResponses.length === 0) {
		return null;
	}

	const sum = sectionResponses.reduce((acc, val) => acc + val, 0);
	return sum / sectionResponses.length;
}

/**
 * Get severity level based on average score
 */
function getSeverityLevel(avgScore) {
	if (avgScore < 1) return 'minimal';
	if (avgScore < 2) return 'mild';
	if (avgScore < 3) return 'moderate';
	if (avgScore < 4) return 'severe';
	return 'extreme';
}

/**
 * Generate interpretation for a section
 */

function generateSectionInterpretation(sectionKey, avgScore, patientInfo) {
	console.log('patientInfo1', patientInfo);
	const { firstName } = patientInfo;
	const pronouns = getFullPronoun(patientInfo.gender);

	const severityMap = {
		minimal: 'minimally',
		mild: 'mildly',
		moderate: 'moderately',
		severe: 'severely',
		extreme: 'extremely'
	};

	const severity = getSeverityLevel(avgScore);

	const interpretations = {
		perfection:
			avgScore >= 4
				? `${firstName} indicates that ${pronouns.subject} is not generally perfectionistic at all.`
				: `${firstName} indicates that ${pronouns.subject} tends to be ${severityMap[severity]} perfectionistic.`,

		approval:
			avgScore >= 4
				? `${firstName} indicates that ${pronouns.subject} is not generally sensitive to approval at all.`
				: `${firstName} indicates that ${pronouns.subject} tends to be ${severityMap[severity]} sensitive to approval.`,

		life:
			avgScore >= 4
				? `${firstName} indicates that ${pronouns.subject} does not generally become frustrated with life's difficulties or have high expectations about life.`
				: `${firstName} indicates that ${pronouns.subject} tends to be ${severityMap[severity]} demanding of life and becomes easily frustrated when things are not as expected.`,

		others:
			avgScore >= 4
				? `${firstName} indicates that ${pronouns.subject} does not generally become frustrated with the imperfections of others.`
				: `${firstName} indicates that ${pronouns.subject} tends to be ${severityMap[severity]} frustrated with, and has high levels of demand for other people.`,

		hopeless:
			avgScore >= 4
				? `${firstName} indicates that ${pronouns.subject} does not generally feel hopeless.`
				: `${firstName} indicates that ${pronouns.subject} tends to be ${severityMap[severity]} hopeless.`,

		lonely:
			avgScore >= 4
				? `${firstName} indicates that ${pronouns.subject} does not generally feel lonely.`
				: `${firstName} indicates that ${pronouns.subject} tends to be ${severityMap[severity]} lonely.`,

		metaCognitions:
			avgScore >= 4
				? `${firstName} indicates that ${pronouns.subject} does not generally have negative thoughts about ${pronouns.possessive} own thoughts and feelings.`
				: `${firstName} indicates that ${pronouns.subject} tends to be ${severityMap[severity]} negative about ${pronouns.possessive} own thoughts and feelings.`
	};

	return interpretations[sectionKey];
}

/**
 * Generate interpretations for individual questions
 */
function generateQuestionInterpretations(responses, sectionQuestions, patientInfo) {
	const { firstName } = patientInfo;
	const pronouns = getFullPronoun(patientInfo.gender);
	console.log('patientInfopro', pronouns);
	return sectionQuestions
		.filter((q) => q in responses)
		.map((q) => {
			const value = responses[q];
			const baseInterpretation =
				typeof questionInterpretationMaps[q][value] === 'function'
					? questionInterpretationMaps[q][value](pronouns)
					: questionInterpretationMaps[q][value];

			return `${firstName} ${baseInterpretation}.`;
		});
}

/**
 * Build report structure for a section
 */
function buildSectionReport(sectionKey, section, responses, patientInfo) {
	const avgScore = calculateSectionAverage(responses, section.questions);

	if (avgScore === null) {
		return null;
	}

	const severity = getSeverityLevel(avgScore);
	const sectionInterpretation = generateSectionInterpretation(sectionKey, avgScore, patientInfo);
	const questionInterpretations = generateQuestionInterpretations(
		responses,
		section.questions,
		patientInfo
	);

	return {
		sections: [
			{
				text: section.title,
				bold: true,
				fontSize: 12
			},
			{
				text: `Average Score: ${avgScore.toFixed(1)} - ${severity.charAt(0).toUpperCase() + severity.slice(1)}`,
				bold: true
			},
			{
				text: sectionInterpretation,
				addPeriod: true
			},
			{
				text: 'Individual question responses:',
				italic: true
			},
			{
				bullet_points: questionInterpretations.map((interp) => ({
					text: interp
				}))
			}
		]
	};
}

/**
 * Main entry point for processing Stressful Beliefs Index data
 */
export function processStressfulBeliefsData(context) {
	try {
		const { _responses: rawResponses, patientInfo } = context;
		console.log('Processing Stressful Beliefs Index data:', rawResponses);

		// Process and filter responses
		const responses = processResponses(rawResponses);

		// Generate report sections
		const reportSections = [];

		// Add centered title
		reportSections.push({
			text: 'STRESSFUL BELIEFS INDEX',
			bold: true,
			fontSize: 14,
			align: 'center'
		});

		// Add spacing after title
		reportSections.push({
			text: ''
		});

		// Add subtitle
		reportSections.push({
			text: 'Stressful Beliefs Index Results',
			bold: true,
			fontSize: 12
		});

		// Process each section
		Object.entries(SECTION_DEFINITIONS).forEach(([sectionKey, section]) => {
			const sectionReport = buildSectionReport(sectionKey, section, responses, patientInfo);
			if (sectionReport) {
				reportSections.push(...sectionReport.sections);
			}
		});

		// Return outcome with report sections
		return {
			outcomes: {
				stressful_beliefs_index: {
					value: 1,
					report_sections: reportSections
				}
			}
		};
	} catch (error) {
		console.error('Error processing Stressful Beliefs Index data:', error);
		return {
			outcomes: {
				stressful_beliefs_index: {
					value: 1,
					report_sections: [
						{
							text: 'Unable to process Stressful Beliefs Index data. Please try again.',
							addPeriod: true
						}
					]
				}
			}
		};
	}
}
