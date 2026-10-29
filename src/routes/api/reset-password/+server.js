import { json } from '@sveltejs/kit';
import { User } from '$lib/database/schemas.js';
import { connectToDatabase } from '$lib/database/connection.js';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { createMailTransport, siteUrl } from '$lib/server/mailer.js';
import { env } from '$env/dynamic/private';
import { DEMO_MODE } from '$lib/demo/mode.js';
import { buildResetPasswordEmail, getResetPasswordSubject } from '$lib/server/email-templates.js';

async function sendResetEmail(mailOptions) {
	try {
		await transporter.sendMail(mailOptions);
		console.log('Password reset email sent to:', mailOptions.to.address);
		return { success: true };
	} catch (error) {
		console.error('Error sending email:', error);
		return { success: false, error: 'Failed to send reset email' };
	}
}

function generateResetUrl(baseUrl, token, isNewUser) {
	return `${baseUrl}/reset-password?token=${token}${isNewUser ? '&new=true' : ''}`;
}

function generateResetToken() {
	return {
		token: crypto.randomBytes(32).toString('hex'),
		// 3 days
		expires: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days in milliseconds
	};
}

function generateMailOptions(user, resetUrl, isNewUser, isAdmin, isDirector, locale) {
	return {
		from: {
			name: 'PsyMatch',
			address: env.EMAIL_FROM
		},
		to: {
			name: user.fullName,
			address: user.email
		},
		subject: getResetPasswordSubject({ locale, isNewUser, isAdmin, isDirector }),
		html: buildResetPasswordEmail({
			locale,
			fullName: user.fullName,
			resetUrl,
			isNewUser,
			isAdmin,
			isDirector
		})
	};
}

const transporter = createMailTransport();

export async function POST({ request, locals }) {
	try {
		const {
			email,
			password,
			token,
			regenerate,
			isNewUser,
			isAdmin,
			isDirector,
			locale: requestLocale
		} = await request.json();
		await connectToDatabase();

		const baseUrl = siteUrl(request);
		// Demo emails are never sent, so staff creating an account get the setup link
		// back directly. Only for signed-in admins: this endpoint is otherwise public.
		const demoLink = (resetUrl) =>
			DEMO_MODE && locals.user?.userType === 'admin' ? { demoResetUrl: resetUrl } : {};

		// If regenerate flag is true, find user by expired token and generate new one
		if (regenerate && token) {
			console.log('regenerate:', token);
			const user = await User.findOne({ resetPasswordToken: token });
			if (!user) {
				return json({ error: 'Invalid token' }, { status: 400 });
			}

			// Determine locale: request > patient preference > default 'en'
			const locale =
				requestLocale ||
				(user.userType === 'patient' ? user.patientProfile?.preferredLanguage : null) ||
				'en';

			// Generate new reset token
			const { token: resetPasswordToken, expires: resetPasswordExpires } = generateResetToken();
			user.resetPasswordToken = resetPasswordToken;
			user.resetPasswordExpires = resetPasswordExpires;
			await user.save();

			const resetUrl = generateResetUrl(baseUrl, resetPasswordToken, isNewUser);
			const mailOptions = generateMailOptions(
				user,
				resetUrl,
				isNewUser,
				isAdmin,
				isDirector,
				locale
			);

			const { success, error } = await sendResetEmail(mailOptions);
			if (!success) {
				return json({ error }, { status: 500 });
			}
			return json({
				message: 'New reset link sent to email address',
				email: user.email,
				...demoLink(resetUrl)
			});
		}

		// If password and token are provided, process password reset
		if (password && token) {
			const user = await User.findOne({
				resetPasswordToken: token,
				resetPasswordExpires: { $gt: Date.now() }
			});

			if (!user) {
				return json(
					{ error: 'Password reset token is invalid or has expired' },
					{ status: 400 }
				);
			}

			const saltRounds = 10;
			const passwordHash = await bcrypt.hash(password, saltRounds);

			if (user.userType === 'admin') {
				user.adminProfile.passwordHash = passwordHash;
			} else {
				user.patientProfile.passwordHash = passwordHash;
				user.patientProfile.isPasswordSet = true;
			}

			user.resetPasswordToken = undefined;
			user.resetPasswordExpires = undefined;
			await user.save();

			return json({ message: 'Password has been reset' });
		}

		// Generate reset token for email request
		const { token: resetPasswordToken, expires: resetPasswordExpires } = generateResetToken();
		const user = await User.findOne({ email });
		if (!user) {
			return json({ error: 'No account with that email address exists' }, { status: 404 });
		}

		// Determine locale: request > patient preference > default 'en'
		// Admin users always get English
		const locale =
			isAdmin
				? 'en'
				: requestLocale ||
					(user.userType === 'patient' ? user.patientProfile?.preferredLanguage : null) ||
					'en';

		user.resetPasswordToken = resetPasswordToken;
		user.resetPasswordExpires = resetPasswordExpires;
		await user.save();

		const resetUrl = generateResetUrl(baseUrl, resetPasswordToken, isNewUser);
		const mailOptions = generateMailOptions(user, resetUrl, isNewUser, isAdmin, isDirector, locale);

		const { success, error } = await sendResetEmail(mailOptions);
		if (!success) {
			return json({ error }, { status: 500 });
		}
		return json({ message: 'Reset link sent to email address', ...demoLink(resetUrl) });
	} catch (error) {
		console.error('Password reset error:', error);
		return json({ error: 'Error processing request' }, { status: 500 });
	}
}
