export function checkPasswordStrength(password) {
	const checks = {
		length: password.length >= 8,
		uppercase: /[A-Z]/.test(password),
		lowercase: /[a-z]/.test(password),
		numbers: /[0-9]/.test(password),
		special: /[!@#$%^&*(),.?":{}|<>]/.test(password)
	};

	const strength = Object.values(checks).filter(Boolean).length;

	let message = [];
	if (!checks.length) message.push('At least 8 characters');
	if (!checks.uppercase) message.push('One uppercase letter');
	if (!checks.lowercase) message.push('One lowercase letter');
	if (!checks.numbers) message.push('One number');
	if (!checks.special) message.push('One special character');

	return {
		score: strength,
		isStrong: strength >= 4,
		message: message.length ? `Missing: ${message.join(', ')}` : 'Password is strong',
		checks
	};
}
