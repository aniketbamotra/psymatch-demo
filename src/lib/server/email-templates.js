import { t } from './email-i18n.js';
import { env } from '$env/dynamic/private';

/**
 * Builds the full HTML email shell with MSO compatibility.
 * Content is injected into the body area.
 */
function buildEmailShell({ locale, title, preheader, bodyHtml }) {
	return `<!DOCTYPE html>
<html lang="${locale}" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${title}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:AllowPNG/>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style type="text/css">
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    table { border-collapse: collapse !important; }
    body { height: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
  <!-- Hidden Preheader Text -->
  <div style="display: none; font-size: 1px; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; mso-hide: all; font-family: sans-serif;">
    ${preheader}
  </div>

  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
    <tr>
      <td align="center" style="padding: 20px 0;">
        <!--[if mso]>
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="600">
        <tr>
        <td>
        <![endif]-->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; border-radius: 8px; overflow: hidden;">
          <!-- Logo Header -->
          <tr>
            <td align="center" style="padding: 16px 40px 12px 40px; background-color: #ffffff;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-right: 20px;">
                    <img src="${env.SITE_URL}/logos/psy_match.png" alt="PsyMatch" width="150" style="display: block; font-size: 16px; font-weight: bold; color: #1a1a1a;" />
                  </td>
                  <td>
                    <img src="${env.SITE_URL}/logos/cct.png" alt="Centre for Cognitive Therapy" width="160" style="display: block; font-size: 14px; font-weight: bold; color: #1a1a1a;" />
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Divider -->
          <tr>
            <td style="background-color: #ffffff;">
              <div style="height: 1px; background-color: #e8e8e8; font-size: 1px; line-height: 1px;">&nbsp;</div>
            </td>
          </tr>
          <!-- Body Content -->
          ${bodyHtml}
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background-color: #f8f8f8; border-top: 1px solid #eeeeee;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="color: #999999; font-size: 12px; text-align: center;">
                    ${t(locale, 'Email.NewTests.footer')}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        <!--[if mso]>
        </td>
        </tr>
        </table>
        <![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Build a CTA button with VML fallback for Outlook.
 */
function buildButton({ href, text, width = 220 }) {
	return `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
  <tr>
    <td align="center" style="padding: 24px 0;">
      <div>
        <!--[if mso]>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:48px;v-text-anchor:middle;width:${width}px;" arcsize="13%" stroke="f" fillcolor="#00A886">
          <w:anchorlock/>
          <center>
        <![endif]-->
        <a href="${href}" style="background-color:#00A886;border-radius:6px;color:#ffffff;display:inline-block;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;line-height:48px;text-align:center;text-decoration:none;width:${width}px;-webkit-text-size-adjust:none;">
          ${text}
        </a>
        <!--[if mso]>
          </center>
        </v:roundrect>
        <![endif]-->
      </div>
    </td>
  </tr>
</table>`;
}

/**
 * Build the New Tests / Digital Diagnostic notification email.
 */
export function buildNewTestsEmail({ locale, fullName, testCount, loginUrl }) {
	const interviewWord =
		testCount === 1
			? t(locale, 'Email.NewTests.interview_singular')
			: t(locale, 'Email.NewTests.interview_plural');

	const vars = { fullName, testCount: String(testCount), interviewWord };

	const title = t(locale, 'Email.NewTests.title');
	const preheader = t(locale, 'Email.NewTests.preheader', vars);

	const bodyHtml = `
          <tr>
            <td style="padding: 32px 40px 0 40px; background-color: #ffffff;">
              <h1 style="color: #1a1a1a; font-size: 22px; margin: 0; font-weight: bold; line-height: 1.3;">
                ${title}
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px 0 40px; background-color: #ffffff;">
              <p style="font-size: 15px; color: #333333; line-height: 1.6; margin: 0 0 16px 0;">
                ${t(locale, 'Email.NewTests.greeting', vars)}
              </p>
              <p style="font-size: 15px; color: #333333; line-height: 1.6; margin: 0;">
                ${t(locale, 'Email.NewTests.body', vars)}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px; background-color: #ffffff;">
              ${buildButton({ href: loginUrl, text: t(locale, 'Email.NewTests.button') })}
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px 32px 40px; background-color: #ffffff;">
              <p style="font-size: 13px; color: #888888; line-height: 1.5; margin: 0 0 14px 0;">
                ${t(locale, 'Email.NewTests.link_trouble')}<br>
                <a href="${loginUrl}" style="color: #00A886; text-decoration: underline;">${loginUrl}</a>
              </p>
              <p style="font-size: 13px; color: #888888; line-height: 1.5; margin: 0 0 14px 0;">
                ${t(locale, 'Email.NewTests.expiry')}
              </p>
              <p style="font-size: 13px; color: #888888; line-height: 1.5; margin: 0;">
                ${t(locale, 'Email.NewTests.ignore')}
              </p>
            </td>
          </tr>`;

	return buildEmailShell({ locale, title, preheader, bodyHtml });
}

/**
 * Build the Password Reset / Welcome / Admin Invite email.
 */
export function buildResetPasswordEmail({
	locale,
	fullName,
	resetUrl,
	isNewUser = false,
	isAdmin = false,
	isDirector = false
}) {
	const role = isDirector
		? t(locale, 'Email.ResetPassword.role_director')
		: t(locale, 'Email.ResetPassword.role_admin');
	const vars = { fullName, role };

	// Determine title, subject, message, button text
	let title, message, buttonText;
	if (isNewUser && isAdmin) {
		title = t(locale, 'Email.ResetPassword.title_admin_invite', vars);
		message = t(locale, 'Email.ResetPassword.message_admin_invite', vars);
		buttonText = t(locale, 'Email.ResetPassword.button_set');
	} else if (isNewUser) {
		title = t(locale, 'Email.ResetPassword.title_new_user');
		message = t(locale, 'Email.ResetPassword.message_new_user');
		buttonText = t(locale, 'Email.ResetPassword.button_set');
	} else {
		title = t(locale, 'Email.ResetPassword.title_reset');
		message = t(locale, 'Email.ResetPassword.message_reset');
		buttonText = t(locale, 'Email.ResetPassword.button_reset');
	}

	const expiry = t(locale, 'Email.ResetPassword.expiry_7day');
	const buttonWidth = locale === 'fr' ? 280 : 220;

	const bodyHtml = `
          <tr>
            <td style="padding: 32px 40px 0 40px; background-color: #ffffff;">
              <h1 style="color: #1a1a1a; font-size: 22px; margin: 0; font-weight: bold; line-height: 1.3;">
                ${title}
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px 0 40px; background-color: #ffffff;">
              <p style="font-size: 15px; color: #333333; line-height: 1.6; margin: 0 0 16px 0;">
                ${t(locale, 'Email.ResetPassword.greeting', vars)}
              </p>
              <p style="font-size: 15px; color: #333333; line-height: 1.6; margin: 0;">
                ${message}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px; background-color: #ffffff;">
              ${buildButton({ href: resetUrl, text: buttonText, width: buttonWidth })}
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px 32px 40px; background-color: #ffffff;">
              <p style="font-size: 13px; color: #888888; line-height: 1.5; margin: 0 0 14px 0;">
                ${t(locale, 'Email.ResetPassword.link_trouble')}<br>
                <a href="${resetUrl}" style="color: #00A886; text-decoration: underline;">${resetUrl}</a>
              </p>
              <p style="font-size: 13px; color: #888888; line-height: 1.5; margin: 0 0 14px 0;">
                ${expiry}
              </p>
              <p style="font-size: 13px; color: #888888; line-height: 1.5; margin: 0;">
                ${t(locale, 'Email.ResetPassword.ignore')}
              </p>
            </td>
          </tr>`;

	return buildEmailShell({ locale, title, preheader: title, bodyHtml });
}

/**
 * Get the email subject for reset password emails.
 */
export function getResetPasswordSubject({ locale, isNewUser, isAdmin, isDirector }) {
	const role = isDirector
		? t(locale, 'Email.ResetPassword.role_director')
		: t(locale, 'Email.ResetPassword.role_admin');

	if (isNewUser && isAdmin) {
		return t(locale, 'Email.ResetPassword.subject_admin_invite', { role });
	} else if (isNewUser) {
		return t(locale, 'Email.ResetPassword.subject_new_user');
	}
	return t(locale, 'Email.ResetPassword.subject_reset');
}
