import "server-only"

export type Mail = { to: string; subject: string; text: string }

/**
 * Outgoing email. No provider is wired yet (Resend/SES lands with notifications in P3), so in
 * every environment the message is logged. Never log mail in production once real tenants
 * exist: it carries reset links.
 */
export async function sendMail(mail: Mail) {
  console.info(`[mail] to=${mail.to} subject="${mail.subject}"\n${mail.text}`)
}
