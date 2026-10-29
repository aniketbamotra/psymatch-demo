const PREFIX = 'Questionnaire.CustomQuestionBuilder';

export function buildDepressionQuestion12Text(results, t) {
	const conditions = [
		{ id: '1', text: t(`${PREFIX}.depression_test.conditions.q1`), key: 'q1' },
		{ id: '2', text: t(`${PREFIX}.depression_test.conditions.q2`), key: 'q2' },
		{ id: '3', text: t(`${PREFIX}.depression_test.conditions.q3`), key: 'q3' },
		{ id: '4', text: t(`${PREFIX}.depression_test.conditions.q4`), key: 'q4' },
		{ id: '5', text: t(`${PREFIX}.depression_test.conditions.q5`), key: 'q5' },
		{ id: '6', text: t(`${PREFIX}.depression_test.conditions.q6`), key: 'q6' },
		{ id: '7', text: t(`${PREFIX}.depression_test.conditions.q7`), key: 'q7' },
		{ id: '8', text: t(`${PREFIX}.depression_test.conditions.q8`), key: 'q8' },
		{ id: '9', text: t(`${PREFIX}.depression_test.conditions.q9`), key: 'q9' },
		{ id: '10', text: t(`${PREFIX}.depression_test.conditions.q10`), key: 'q10' },
		{ id: '11', text: t(`${PREFIX}.depression_test.conditions.q11`), key: 'q11' }
	];
	console.log('Results:', results);

	const defaultText = t(`${PREFIX}.depression_test.default_text`);

	if (!results) {
		return { text: defaultText, audio: ['end'] };
	}

	const activeConditions = conditions
		.filter((condition) => {
			const index = parseInt(condition.key.split('q')[1]) - 1;
			const response = results[index];
			if (!response || !Object.prototype.hasOwnProperty.call(response, 'value')) {
				return false;
			}
			const answer = response.value;
			console.log('condition:', condition.key, 'answer:', answer);
			return answer && parseInt(answer) > 0;
		})
		.map((condition) => condition.text);

	if (activeConditions.length === 0) {
		return { text: defaultText, audio: ['end'] };
	}

	const audioKeys = conditions
		.filter((condition) => {
			const index = parseInt(condition.key.split('q')[1]) - 1;
			const response = results[index];
			if (!response || !Object.prototype.hasOwnProperty.call(response, 'value')) {
				return false;
			}
			const answer = response.value;
			return answer && parseInt(answer) > 0;
		})
		.map((condition) => condition.key);

	const template = t(`${PREFIX}.depression_test.template`);
	return {
		text: template.replace('{conditions}', activeConditions.join(', ')),
		audio: ['start', ...audioKeys, 'end']
	};
}

export function buildManicQuestion15Text(results, t) {
	const mainConditions = [
		{ text: t(`${PREFIX}.manic_test.main_conditions.q1`), key: 'q1' },
		{ text: t(`${PREFIX}.manic_test.main_conditions.q2`), key: 'q2' },
		{ text: t(`${PREFIX}.manic_test.main_conditions.q3`), key: 'q3' }
	];

	const characteristics = [
		{ text: t(`${PREFIX}.manic_test.characteristics.q7`), key: 'q7' },
		{ text: t(`${PREFIX}.manic_test.characteristics.q8`), key: 'q8' },
		{ text: t(`${PREFIX}.manic_test.characteristics.q9`), key: 'q9' },
		{ text: t(`${PREFIX}.manic_test.characteristics.q10`), key: 'q10' },
		{ text: t(`${PREFIX}.manic_test.characteristics.q11`), key: 'q11' },
		{ text: t(`${PREFIX}.manic_test.characteristics.q12`), key: 'q12' },
		{ text: t(`${PREFIX}.manic_test.characteristics.q13`), key: 'q13' },
		{ text: t(`${PREFIX}.manic_test.characteristics.q14`), key: 'q14' }
	];

	console.log('Results for manic:', results);

	const defaultText = t(`${PREFIX}.manic_test.default_text`);

	if (!results) {
		return { text: defaultText, audio: ['end'] };
	}

	const activeMainConditions = mainConditions
		.filter((condition) => {
			const index = parseInt(condition.key.split('q')[1]) - 1;
			const response = results[index];
			if (!response || !Object.prototype.hasOwnProperty.call(response, 'value')) {
				return false;
			}
			const answer = response.value;
			console.log('main condition:', condition.key, 'answer:', answer);
			return answer && parseInt(answer) > 0;
		})
		.map((condition) => condition.text);

	const activeCharacteristics = characteristics
		.filter((condition) => {
			const index = parseInt(condition.key.split('q')[1]) - 1;
			const response = results[index];
			if (!response || !Object.prototype.hasOwnProperty.call(response, 'value')) {
				return false;
			}
			const answer = response.value;
			console.log('characteristic:', condition.key, 'answer:', answer);
			return answer && parseInt(answer) > 0;
		})
		.map((condition) => condition.text);

	if (activeMainConditions.length === 0 && activeCharacteristics.length === 0) {
		return { text: defaultText, audio: ['end'] };
	}

	let text = t(`${PREFIX}.manic_test.template_prefix`);
	if (activeMainConditions.length > 0) {
		text += activeMainConditions.join(' or ');
	}

	if (activeCharacteristics.length > 0) {
		text += t(`${PREFIX}.manic_test.template_characteristics`) + activeCharacteristics.join(', ');
	}

	text += t(`${PREFIX}.manic_test.template_suffix`);

	const audioKeys = [
		...mainConditions
			.filter((condition) => {
				const index = parseInt(condition.key.split('q')[1]) - 1;
				const response = results[index];
				if (!response || !Object.prototype.hasOwnProperty.call(response, 'value')) {
					return false;
				}
				const answer = response.value;
				return answer && parseInt(answer) > 0;
			})
			.map((condition) => condition.key),
		...characteristics
			.filter((condition) => {
				const index = parseInt(condition.key.split('q')[1]) - 1;
				const response = results[index];
				if (!response || !Object.prototype.hasOwnProperty.call(response, 'value')) {
					return false;
				}
				const answer = response.value;
				return answer && parseInt(answer) > 0;
			})
			.map((condition) => condition.key)
	];

	return {
		text,
		audio: ['start', ...audioKeys, 'end']
	};
}

export function buildPersistentDepressiveQuestion8Text(results, t) {
	const conditions = [
		{ text: t(`${PREFIX}.persistent_depressive_test.conditions.q2`), key: 'q2' },
		{ text: t(`${PREFIX}.persistent_depressive_test.conditions.q3`), key: 'q3' },
		{ text: t(`${PREFIX}.persistent_depressive_test.conditions.q4`), key: 'q4' },
		{ text: t(`${PREFIX}.persistent_depressive_test.conditions.q5`), key: 'q5' },
		{ text: t(`${PREFIX}.persistent_depressive_test.conditions.q6`), key: 'q6' },
		{ text: t(`${PREFIX}.persistent_depressive_test.conditions.q7`), key: 'q7' }
	];

	const defaultText = t(`${PREFIX}.persistent_depressive_test.default_text`);

	if (!results) {
		return { text: defaultText, audio: ['end'] };
	}

	const activeConditions = conditions
		.filter((condition) => {
			const index = parseInt(condition.key.split('q')[1]) - 1;
			const response = results[index];
			if (!response || !Object.prototype.hasOwnProperty.call(response, 'value')) {
				return false;
			}
			const answer = response.value;
			return answer && parseInt(answer) > 0;
		})
		.map((condition) => condition.text);

	if (activeConditions.length === 0) {
		return { text: defaultText, audio: ['end'] };
	}

	const audioKeys = conditions
		.filter((condition) => {
			const index = parseInt(condition.key.split('q')[1]) - 1;
			const response = results[index];
			if (!response || !Object.prototype.hasOwnProperty.call(response, 'value')) {
				return false;
			}
			const answer = response.value;
			return answer && parseInt(answer) > 0;
		})
		.map((condition) => condition.key);

	const template = t(`${PREFIX}.persistent_depressive_test.template`);
	return {
		text: template.replace('{conditions}', activeConditions.join(', ')),
		audio: ['start', ...audioKeys, 'end']
	};
}

export function buildSleepDisorderQuestion13Text(results, t) {
	const conditions = [
		{ text: t(`${PREFIX}.sleep_disorder_test.conditions.q2`), key: 'q2' },
		{ text: t(`${PREFIX}.sleep_disorder_test.conditions.q5`), key: 'q5' },
		{ text: t(`${PREFIX}.sleep_disorder_test.conditions.q7`), key: 'q7' },
		{ text: t(`${PREFIX}.sleep_disorder_test.conditions.q10`), key: 'q10' }
	];

	const defaultText = t(`${PREFIX}.sleep_disorder_test.default_text`);

	if (!results) {
		return { text: defaultText, audio: ['end'] };
	}

	const activeConditions = conditions
		.filter((condition) => {
			const index = parseInt(condition.key.split('q')[1]) - 1;
			const response = results[index];
			if (!response || !Object.prototype.hasOwnProperty.call(response, 'value')) {
				return false;
			}
			const answer = response.value;
			return answer && parseInt(answer) > 0;
		})
		.map((condition) => condition.text);

	if (activeConditions.length === 0) {
		return { text: defaultText, audio: ['end'] };
	}

	const audioKeys = conditions
		.filter((condition) => {
			const index = parseInt(condition.key.split('q')[1]) - 1;
			const response = results[index];
			if (!response || !Object.prototype.hasOwnProperty.call(response, 'value')) {
				return false;
			}
			const answer = response.value;
			return answer && parseInt(answer) > 0;
		})
		.map((condition) => condition.key);

	const template = t(`${PREFIX}.sleep_disorder_test.template`);
	return {
		text: template.replace('{conditions}', activeConditions.join(', ')),
		audio: ['start', ...audioKeys, 'end']
	};
}

export function buildAgoraphobiaQuestion10Text(results, t) {
	const conditions = [
		{ text: t(`${PREFIX}.agoraphobia_test.conditions.q1`), key: 'q1' },
		{ text: t(`${PREFIX}.agoraphobia_test.conditions.q2`), key: 'q2' },
		{ text: t(`${PREFIX}.agoraphobia_test.conditions.q3`), key: 'q3' },
		{ text: t(`${PREFIX}.agoraphobia_test.conditions.q4`), key: 'q4' },
		{ text: t(`${PREFIX}.agoraphobia_test.conditions.q5`), key: 'q5' }
	];

	const defaultText = t(`${PREFIX}.agoraphobia_test.default_text`);

	if (!results) {
		return { text: defaultText, audio: ['end'] };
	}

	const activeConditions = conditions
		.filter((condition) => {
			const index = parseInt(condition.key.split('q')[1]) - 1;
			const response = results[index];
			if (!response || !Object.prototype.hasOwnProperty.call(response, 'value')) {
				return false;
			}
			const answer = response.value;
			return answer && parseInt(answer) > 0;
		})
		.map((condition) => condition.text);

	if (activeConditions.length === 0) {
		return { text: defaultText, audio: ['end'] };
	}

	const audioKeys = conditions
		.filter((condition) => {
			const index = parseInt(condition.key.split('q')[1]) - 1;
			const response = results[index];
			if (!response || !Object.prototype.hasOwnProperty.call(response, 'value')) {
				return false;
			}
			const answer = response.value;
			return answer && parseInt(answer) > 0;
		})
		.map((condition) => condition.key);

	const template = t(`${PREFIX}.agoraphobia_test.template`);
	return {
		text: template.replace('{conditions}', activeConditions.join(', ')),
		audio: ['start', ...audioKeys, 'end']
	};
}

export function buildDelusionalQuestion7Text(results, t) {
	const conditions = [
		{ text: t(`${PREFIX}.delusional_disorder_test.conditions.q1`), key: 'q1' },
		{ text: t(`${PREFIX}.delusional_disorder_test.conditions.q2`), key: 'q2' },
		{ text: t(`${PREFIX}.delusional_disorder_test.conditions.q3`), key: 'q3' },
		{ text: t(`${PREFIX}.delusional_disorder_test.conditions.q4`), key: 'q4' },
		{ text: t(`${PREFIX}.delusional_disorder_test.conditions.q5`), key: 'q5' },
		{ text: t(`${PREFIX}.delusional_disorder_test.conditions.q6`), key: 'q6' }
	];

	const defaultText = t(`${PREFIX}.delusional_disorder_test.default_text`);

	if (!results) {
		return { text: defaultText, audio: ['end'] };
	}

	const activeConditions = conditions
		.filter((condition) => {
			const index = parseInt(condition.key.split('q')[1]) - 1;
			const response = results[index];
			if (!response || !Object.prototype.hasOwnProperty.call(response, 'value')) {
				return false;
			}
			const answer = response.value;
			return answer && parseInt(answer) > 0;
		})
		.map((condition) => condition.text);

	if (activeConditions.length === 0) {
		return { text: defaultText, audio: ['end'] };
	}

	const audioKeys = conditions
		.filter((condition) => {
			const index = parseInt(condition.key.split('q')[1]) - 1;
			const response = results[index];
			if (!response || !Object.prototype.hasOwnProperty.call(response, 'value')) {
				return false;
			}
			const answer = response.value;
			return answer && parseInt(answer) > 0;
		})
		.map((condition) => condition.key);

	const template = t(`${PREFIX}.delusional_disorder_test.template`);
	return {
		text: template.replace('{conditions}', activeConditions.join(', ')),
		audio: ['start', ...audioKeys, 'end']
	};
}

export function buildAlcoholUseQuestion28Text(results, t) {
	const conditions = [
		{ text: t(`${PREFIX}.alcohol_use_disorder_test.conditions.q19`), key: 'q19' },
		{ text: t(`${PREFIX}.alcohol_use_disorder_test.conditions.q20`), key: 'q20' },
		{ text: t(`${PREFIX}.alcohol_use_disorder_test.conditions.q21`), key: 'q21' },
		{ text: t(`${PREFIX}.alcohol_use_disorder_test.conditions.q22`), key: 'q22' },
		{ text: t(`${PREFIX}.alcohol_use_disorder_test.conditions.q23`), key: 'q23' },
		{ text: t(`${PREFIX}.alcohol_use_disorder_test.conditions.q24`), key: 'q24' },
		{ text: t(`${PREFIX}.alcohol_use_disorder_test.conditions.q25`), key: 'q25' },
		{ text: t(`${PREFIX}.alcohol_use_disorder_test.conditions.q26`), key: 'q26' }
	];

	const defaultText = t(`${PREFIX}.alcohol_use_disorder_test.default_text`);

	if (!results) {
		return { text: defaultText, audio: ['end'] };
	}

	const activeConditions = conditions
		.filter((condition) => {
			const index = parseInt(condition.key.split('q')[1]) - 1;
			const response = results[index];
			if (!response || !Object.prototype.hasOwnProperty.call(response, 'value')) {
				return false;
			}
			const answer = response.value;
			return answer && parseInt(answer) > 0;
		})
		.map((condition) => condition.text);

	if (activeConditions.length === 0) {
		return { text: defaultText, audio: ['end'] };
	}

	const audioKeys = conditions
		.filter((condition) => {
			const index = parseInt(condition.key.split('q')[1]) - 1;
			const response = results[index];
			if (!response || !Object.prototype.hasOwnProperty.call(response, 'value')) {
				return false;
			}
			const answer = response.value;
			return answer && parseInt(answer) > 0;
		})
		.map((condition) => condition.key);

	const template = t(`${PREFIX}.alcohol_use_disorder_test.template`);
	return {
		text: template.replace('{conditions}', activeConditions.join(', ')),
		audio: ['start', ...audioKeys, 'end']
	};
}

export function buildCannabisUseQuestion30Text(results, t) {
	const conditions = [
		{ text: t(`${PREFIX}.cannabis_test.conditions.q18`), key: 'q18' },
		{ text: t(`${PREFIX}.cannabis_test.conditions.q19`), key: 'q19' },
		{ text: t(`${PREFIX}.cannabis_test.conditions.q20`), key: 'q20' },
		{ text: t(`${PREFIX}.cannabis_test.conditions.q21`), key: 'q21' },
		{ text: t(`${PREFIX}.cannabis_test.conditions.q22`), key: 'q22' },
		{ text: t(`${PREFIX}.cannabis_test.conditions.q23`), key: 'q23' },
		{ text: t(`${PREFIX}.cannabis_test.conditions.q24`), key: 'q24' },
		{ text: t(`${PREFIX}.cannabis_test.conditions.q25`), key: 'q25' },
		{ text: t(`${PREFIX}.cannabis_test.conditions.q26`), key: 'q26' },
		{ text: t(`${PREFIX}.cannabis_test.conditions.q27`), key: 'q27' },
		{ text: t(`${PREFIX}.cannabis_test.conditions.q28`), key: 'q28' },
		{ text: t(`${PREFIX}.cannabis_test.conditions.q29`), key: 'q29' }
	];

	const defaultText = t(`${PREFIX}.cannabis_test.default_text`);

	if (!results) {
		return { text: defaultText, audio: ['end'] };
	}

	const activeConditions = conditions
		.filter((condition) => {
			const index = parseInt(condition.key.split('q')[1]) - 1;
			const response = results[index];
			if (!response || !Object.prototype.hasOwnProperty.call(response, 'value')) {
				return false;
			}
			const answer = response.value;
			return answer && parseInt(answer) > 0;
		})
		.map((condition) => condition.text);

	if (activeConditions.length === 0) {
		return { text: defaultText, audio: ['end'] };
	}

	const audioKeys = conditions
		.filter((condition) => {
			const index = parseInt(condition.key.split('q')[1]) - 1;
			const response = results[index];
			if (!response || !Object.prototype.hasOwnProperty.call(response, 'value')) {
				return false;
			}
			const answer = response.value;
			return answer && parseInt(answer) > 0;
		})
		.map((condition) => condition.key);

	const template = t(`${PREFIX}.cannabis_test.template`);
	return {
		text: template.replace('{conditions}', activeConditions.join(', ')),
		audio: ['start', ...audioKeys, 'end']
	};
}

export function buildStimulantUseQuestion23Text(results, t) {
	const conditions = [
		{ text: t(`${PREFIX}.stimulant_use_disorder_test.conditions.q16`), key: 'q16' },
		{ text: t(`${PREFIX}.stimulant_use_disorder_test.conditions.q17`), key: 'q17' },
		{ text: t(`${PREFIX}.stimulant_use_disorder_test.conditions.q18`), key: 'q18' },
		{ text: t(`${PREFIX}.stimulant_use_disorder_test.conditions.q19`), key: 'q19' },
		{ text: t(`${PREFIX}.stimulant_use_disorder_test.conditions.q20`), key: 'q20' },
		{ text: t(`${PREFIX}.stimulant_use_disorder_test.conditions.q21`), key: 'q21' },
		{ text: t(`${PREFIX}.stimulant_use_disorder_test.conditions.q22`), key: 'q22' }
	];

	const defaultText = t(`${PREFIX}.stimulant_use_disorder_test.default_text`);

	if (!results) {
		return { text: defaultText, audio: ['end'] };
	}

	const activeConditions = conditions
		.filter((condition) => {
			const index = parseInt(condition.key.split('q')[1]) - 1;
			const response = results[index];
			if (!response || !Object.prototype.hasOwnProperty.call(response, 'value')) {
				return false;
			}
			const answer = response.value;
			return answer && parseInt(answer) > 0;
		})
		.map((condition) => condition.text);

	if (activeConditions.length === 0) {
		return { text: defaultText, audio: ['end'] };
	}

	const audioKeys = conditions
		.filter((condition) => {
			const index = parseInt(condition.key.split('q')[1]) - 1;
			const response = results[index];
			if (!response || !Object.prototype.hasOwnProperty.call(response, 'value')) {
				return false;
			}
			const answer = response.value;
			return answer && parseInt(answer) > 0;
		})
		.map((condition) => condition.key);

	const template = t(`${PREFIX}.stimulant_use_disorder_test.template`);
	return {
		text: template.replace('{conditions}', activeConditions.join(', ')),
		audio: ['start', ...audioKeys, 'end']
	};
}

export function buildAdultADHDQuestion10Text(results, t) {
	const conditions = [
		{ text: t(`${PREFIX}.adult_adhd_test.inattention.conditions.q1`), key: 'q1' },
		{ text: t(`${PREFIX}.adult_adhd_test.inattention.conditions.q2`), key: 'q2' },
		{ text: t(`${PREFIX}.adult_adhd_test.inattention.conditions.q3`), key: 'q3' },
		{ text: t(`${PREFIX}.adult_adhd_test.inattention.conditions.q4`), key: 'q4' },
		{ text: t(`${PREFIX}.adult_adhd_test.inattention.conditions.q5`), key: 'q5' },
		{ text: t(`${PREFIX}.adult_adhd_test.inattention.conditions.q6`), key: 'q6' },
		{ text: t(`${PREFIX}.adult_adhd_test.inattention.conditions.q7`), key: 'q7' },
		{ text: t(`${PREFIX}.adult_adhd_test.inattention.conditions.q8`), key: 'q8' },
		{ text: t(`${PREFIX}.adult_adhd_test.inattention.conditions.q9`), key: 'q9' }
	];

	const defaultText = t(`${PREFIX}.adult_adhd_test.inattention.default_text`);

	if (!results) {
		return { text: defaultText, audio: ['end'] };
	}

	const activeConditions = conditions
		.filter((condition) => {
			const index = parseInt(condition.key.split('q')[1]) - 1;
			const response = results[index];
			if (!response || !Object.prototype.hasOwnProperty.call(response, 'value')) {
				return false;
			}
			const answer = response.value;
			return answer && parseInt(answer) > 0;
		})
		.map((condition) => condition.text);

	if (activeConditions.length === 0) {
		return { text: defaultText, audio: ['end'] };
	}

	const audioKeys = conditions
		.filter((condition) => {
			const index = parseInt(condition.key.split('q')[1]) - 1;
			const response = results[index];
			if (!response || !Object.prototype.hasOwnProperty.call(response, 'value')) {
				return false;
			}
			const answer = response.value;
			return answer && parseInt(answer) > 0;
		})
		.map((condition) => condition.key);

	const template = t(`${PREFIX}.adult_adhd_test.inattention.template`);
	return {
		text: template.replace('{conditions}', activeConditions.join(', ')),
		audio: ['start', ...audioKeys, 'end']
	};
}

export function buildAdultADHDQuestion23Text(results, t) {
	const conditions = [
		{ text: t(`${PREFIX}.adult_adhd_test.hyperactivity.conditions.q14`), key: 'q14' },
		{ text: t(`${PREFIX}.adult_adhd_test.hyperactivity.conditions.q15`), key: 'q15' },
		{ text: t(`${PREFIX}.adult_adhd_test.hyperactivity.conditions.q16`), key: 'q16' },
		{ text: t(`${PREFIX}.adult_adhd_test.hyperactivity.conditions.q17`), key: 'q17' },
		{ text: t(`${PREFIX}.adult_adhd_test.hyperactivity.conditions.q18`), key: 'q18' },
		{ text: t(`${PREFIX}.adult_adhd_test.hyperactivity.conditions.q19`), key: 'q19' },
		{ text: t(`${PREFIX}.adult_adhd_test.hyperactivity.conditions.q20`), key: 'q20' },
		{ text: t(`${PREFIX}.adult_adhd_test.hyperactivity.conditions.q21`), key: 'q21' },
		{ text: t(`${PREFIX}.adult_adhd_test.hyperactivity.conditions.q22`), key: 'q22' }
	];

	const defaultText = t(`${PREFIX}.adult_adhd_test.hyperactivity.default_text`);

	if (!results) {
		return { text: defaultText, audio: ['end'] };
	}

	const activeConditions = conditions
		.filter((condition) => {
			const index = parseInt(condition.key.split('q')[1]) - 1;
			const response = results[index];
			if (!response || !Object.prototype.hasOwnProperty.call(response, 'value')) {
				return false;
			}
			const answer = response.value;
			return answer && parseInt(answer) > 0;
		})
		.map((condition) => condition.text);

	if (activeConditions.length === 0) {
		return { text: defaultText, audio: ['end'] };
	}

	const audioKeys = conditions
		.filter((condition) => {
			const index = parseInt(condition.key.split('q')[1]) - 1;
			const response = results[index];
			if (!response || !Object.prototype.hasOwnProperty.call(response, 'value')) {
				return false;
			}
			const answer = response.value;
			return answer && parseInt(answer) > 0;
		})
		.map((condition) => condition.key);

	const template = t(`${PREFIX}.adult_adhd_test.hyperactivity.template`);
	return {
		text: template.replace('{conditions}', activeConditions.join(', ')),
		audio: ['start', ...audioKeys, 'end']
	};
}

export function buildProlongedGriefQuestion11Text(results, t) {
	const conditions = [
		{ text: t(`${PREFIX}.prolonged_grief_disorder.conditions.q3`), key: 'q3' },
		{ text: t(`${PREFIX}.prolonged_grief_disorder.conditions.q4`), key: 'q4' },
		{ text: t(`${PREFIX}.prolonged_grief_disorder.conditions.q5`), key: 'q5' },
		{ text: t(`${PREFIX}.prolonged_grief_disorder.conditions.q6`), key: 'q6' },
		{ text: t(`${PREFIX}.prolonged_grief_disorder.conditions.q7`), key: 'q7' },
		{ text: t(`${PREFIX}.prolonged_grief_disorder.conditions.q8`), key: 'q8' },
		{ text: t(`${PREFIX}.prolonged_grief_disorder.conditions.q9`), key: 'q9' },
		{ text: t(`${PREFIX}.prolonged_grief_disorder.conditions.q10`), key: 'q10' }
	];

	const defaultText = t(`${PREFIX}.prolonged_grief_disorder.default_text`);

	if (!results) {
		return { text: defaultText, audio: ['end'] };
	}

	const isActive = (condition) => {
		const questionNumber = parseInt(condition.key.replace('q', ''));
		const response =
			results.find?.((r) => r.questionId === condition.key) || results[questionNumber - 1];

		if (!response || !Object.prototype.hasOwnProperty.call(response, 'value')) {
			return false;
		}

		return parseInt(response.value) > 0;
	};

	const activeConditions = conditions.filter(isActive).map((condition) => condition.text);

	if (activeConditions.length === 0) {
		return { text: defaultText, audio: ['end'] };
	}

	const audioKeys = conditions.filter(isActive).map((condition) => condition.key);
	const template = t(`${PREFIX}.prolonged_grief_disorder.template`);

	return {
		text: template.replace('{conditions}', activeConditions.join(', ')),
		audio: ['start', ...audioKeys, 'end']
	};
}

export function buildCustomQuestion(testName, questionIndex, responses, t) {
	let res = {};
	console.log('Building custom question:', testName, questionIndex, responses);

	if (testName === 'depression_test' && questionIndex === 12) {
		console.log('Building custom question for Depression Diagnostic Test');
		res = buildDepressionQuestion12Text(responses, t);
		console.log('Custom question:', res);
		return res;
	} else if (testName === 'manic_test' && questionIndex === 15) {
		return buildManicQuestion15Text(responses, t);
	} else if (testName === 'persistent_depressive_test' && questionIndex === 8) {
		return buildPersistentDepressiveQuestion8Text(responses, t);
	} else if (testName === 'sleep_disorder_test' && questionIndex === 13) {
		return buildSleepDisorderQuestion13Text(responses, t);
	} else if (testName === 'agoraphobia_test' && questionIndex === 10) {
		return buildAgoraphobiaQuestion10Text(responses, t);
	} else if (testName === 'delusional_disorder_test' && questionIndex === 7) {
		return buildDelusionalQuestion7Text(responses, t);
	} else if (testName === 'alcohol_use_disorder_test' && questionIndex === 28) {
		return buildAlcoholUseQuestion28Text(responses, t);
	} else if (testName === 'cannabis_test' && questionIndex === 30) {
		return buildCannabisUseQuestion30Text(responses, t);
	} else if (testName === 'stimulant_use_disorder_test' && questionIndex === 23) {
		return buildStimulantUseQuestion23Text(responses, t);
	} else if (testName === 'adult_adhd_test' && questionIndex === 10) {
		return buildAdultADHDQuestion10Text(responses, t);
	} else if (testName === 'adult_adhd_test' && questionIndex === 23) {
		return buildAdultADHDQuestion23Text(responses, t);
	} else if (testName === 'prolonged_grief_disorder' && questionIndex === 11) {
		return buildProlongedGriefQuestion11Text(responses, t);
	}
	return null;
}
