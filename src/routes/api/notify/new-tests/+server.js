import { json } from '@sveltejs/kit';
import { createMailTransport, siteUrl } from '$lib/server/mailer.js';
import { env } from '$env/dynamic/private';
import { t } from '$lib/server/email-i18n.js';
import { buildNewTestsEmail } from '$lib/server/email-templates.js';
import { User } from '$lib/database/schemas.js';
import { connectToDatabase } from '$lib/database/connection.js';

const transporter = createMailTransport();

export async function POST({ request, locals }) {
	if (!locals.user || locals.user.userType !== 'admin') {
		return new Response(null, {
			status: 302,
			headers: {
				Location: '/login'
			}
		});
	}

	try {
		const { email, fullName, testCount, preferredLanguage } = await request.json();
		console.log('[new-tests] preferredLanguage received:', preferredLanguage, 'for:', email);

		// If preferredLanguage not sent, look it up from the DB
		let locale = preferredLanguage;
		if (!locale) {
			await connectToDatabase();
			const user = await User.findOne({ email }).select('patientProfile.preferredLanguage').lean();
			locale = user?.patientProfile?.preferredLanguage || 'en';
		}

		const baseUrl = siteUrl(request);
		const loginUrl = locale === 'fr' ? `${baseUrl}/login/fr` : `${baseUrl}/login`;

		const mailOptions = {
			from: {
				name: 'PsyMatch',
				address: env.EMAIL_FROM
			},
			to: {
				name: fullName,
				address: email
			},
			subject: t(locale, 'Email.NewTests.subject'),
			html: buildNewTestsEmail({ locale, fullName, testCount, loginUrl })
		};

		await transporter.sendMail(mailOptions);
		return json({ message: 'Notification sent successfully' });
	} catch (error) {
		console.error('Error sending notification:', error);
		return json({ error: 'Failed to send notification' }, { status: 500 });
	}
}
