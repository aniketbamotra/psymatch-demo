import { json } from '@sveltejs/kit';
import { User } from '$lib/database/schemas.js';
import { connectToDatabase } from '$lib/database/connection.js';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { createMailTransport, siteUrl } from '$lib/server/mailer.js';
import { env } from '$env/dynamic/private';

const transporter = createMailTransport();

export async function POST({ request }) {
	try {
		const { email, password, token, isNewUser } = await request.json();
		await connectToDatabase();

		// If password and token are provided, process password reset
		if (password && token) {
			const user = await User.findOne({
				resetPasswordToken: token,
				resetPasswordExpires: { $gt: Date.now() }
			});

			if (!user) {
				return json({ error: 'Password reset token is invalid or has expired' }, { status: 400 });
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

		// Generate reset token
		const resetPasswordToken = crypto.randomBytes(32).toString('hex');
		const resetPasswordExpires = Date.now() + 3600000; // 1 hour

		const user = await User.findOne({ email });
		if (!user) {
			return json({ error: 'No account with that email address exists' }, { status: 404 });
		}

		user.resetPasswordToken = resetPasswordToken;
		user.resetPasswordExpires = resetPasswordExpires;
		await user.save();

		const resetUrl = `${siteUrl(request)}/reset-password?token=${resetPasswordToken}${isNewUser ? '&new=true' : ''}`;

		const mailOptions = {
			from: {
				name: 'PsyMatch',
				address: env.EMAIL_FROM
			},
			to: {
				name: user.fullName,
				address: user.email
			},
			subject: isNewUser
				? 'Welcome to PsyMatch - Set Your Password'
				: 'PsyMatch Password Reset Request',
			html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">${isNewUser ? 'Welcome to PsyMatch!' : 'Password Reset Request'}</h2>
          <p>Hello ${user.fullName},</p>
          <p>${
						isNewUser
							? 'Welcome to PsyMatch! To get started, please set your password by clicking the button below:'
							: 'You requested to reset your password. Click the button below to set a new password:'
					}</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" 
               style="background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
              ${isNewUser ? 'Set Password' : 'Reset Password'}
            </a>
          </div>
          <p style="color: #666; font-size: 14px;">If you are having trouble clicking the button, copy and paste the following link into your browser: <a style="color:#133fba" href="${resetUrl}">${resetUrl}</a> </p>
          <p style="color: #666; font-size: 14px;">This link will expire in 1 hour for security reasons.</p>
          <p style="color: #666; font-size: 14px;">If you did not request this, please ignore this email.</p>
          <hr style="border: 1px solid #eee; margin: 30px 0;">
          <p style="color: #999; font-size: 12px;">This is an automated message, please do not reply.</p>
        </div>
      `
		};

		try {
			await transporter.sendMail(mailOptions);
			console.log('Password reset email sent to:', email);
			return json({ message: 'Reset link sent to email address' });
		} catch (error) {
			console.error('Error sending email:', error);
			return json({ error: 'Failed to send reset email' }, { status: 500 });
		}
	} catch (error) {
		console.error('Password reset error:', error);
		return json({ error: 'Error processing request' }, { status: 500 });
	}
}
