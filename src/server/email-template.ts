/*
 * One layout for every transactional email (Resend or console). Email clients ignore CSS
 * variables and <style> support is patchy, so this uses inline styles and a table layout with
 * hex values that mirror the design tokens (indigo-800 primary, gray page, gray-600 muted).
 */

export type EmailContent = {
  /** Shown as the inbox preview line. */
  preheader?: string
  heading: string
  /** Paragraphs of plain text; escaped. */
  intro: string | string[]
  /** Label/value rows, e.g. Ticket, Location, Priority. */
  details?: [label: string, value: string][]
  cta?: { label: string; url: string }
  /** Small print under the button (why they got this, how to opt out). */
  footnote?: string
  /** Organisation name for the header; falls back to the product name. */
  brand?: string
}

const C = {
  page: "#f9fafb",
  card: "#ffffff",
  border: "#e5e7eb",
  text: "#030712",
  muted: "#4b5563",
  primary: "#3730a3",
  primaryText: "#ffffff",
}

export function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

/** Only http(s) links become buttons; anything else would be an injection vector. */
function safeUrl(url: string) {
  return /^https?:\/\//i.test(url) ? url : null
}

export function renderEmail(c: EmailContent): { html: string; text: string } {
  const paragraphs = Array.isArray(c.intro) ? c.intro : [c.intro]
  const brand = c.brand?.trim() || "QR Feed"
  const ctaUrl = c.cta ? safeUrl(c.cta.url) : null
  const font =
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

  const detailsHtml = c.details?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border:1px solid ${C.border};border-radius:10px;border-collapse:separate">
${c.details
  .map(
    ([k, v], i) =>
      `<tr><td style="padding:10px 14px;${i ? `border-top:1px solid ${C.border};` : ""}color:${C.muted};font-size:13px;white-space:nowrap;vertical-align:top">${escapeHtml(k)}</td><td style="padding:10px 14px;${i ? `border-top:1px solid ${C.border};` : ""}color:${C.text};font-size:14px;font-weight:600">${escapeHtml(v)}</td></tr>`,
  )
  .join("\n")}
</table>`
    : ""

  const ctaHtml =
    c.cta && ctaUrl
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0 8px"><tr><td style="border-radius:10px;background:${C.primary}"><a href="${escapeHtml(ctaUrl)}" style="display:inline-block;padding:12px 22px;color:${C.primaryText};font-size:15px;font-weight:600;text-decoration:none;border-radius:10px">${escapeHtml(c.cta.label)}</a></td></tr></table>
<p style="margin:8px 0 0;color:${C.muted};font-size:12px;word-break:break-all">Or open: <a href="${escapeHtml(ctaUrl)}" style="color:${C.primary}">${escapeHtml(ctaUrl)}</a></p>`
      : ""

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(c.heading)}</title></head>
<body style="margin:0;padding:0;background:${C.page};${font}">
${c.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(c.preheader)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page}"><tr><td align="center" style="padding:24px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="padding:0 4px 12px;color:${C.primary};font-size:14px;font-weight:700;letter-spacing:.02em">${escapeHtml(brand)}</td></tr>
<tr><td style="background:${C.card};border:1px solid ${C.border};border-radius:14px;padding:28px 24px">
<h1 style="margin:0 0 12px;color:${C.text};font-size:20px;line-height:1.3;font-weight:700">${escapeHtml(c.heading)}</h1>
${paragraphs.map((p) => `<p style="margin:0 0 12px;color:${C.text};font-size:15px;line-height:1.6">${escapeHtml(p)}</p>`).join("\n")}
${detailsHtml}
${ctaHtml}
</td></tr>
<tr><td style="padding:16px 4px 0;color:${C.muted};font-size:12px;line-height:1.5">${c.footnote ? `${escapeHtml(c.footnote)}<br>` : ""}Sent by QR Feed${brand !== "QR Feed" ? ` for ${escapeHtml(brand)}` : ""}.</td></tr>
</table></td></tr></table>
</body></html>`

  const text = [
    c.heading,
    "",
    ...paragraphs.flatMap((p) => [p, ""]),
    ...(c.details?.length ? [...c.details.map(([k, v]) => `${k}: ${v}`), ""] : []),
    ...(c.cta && ctaUrl ? [`${c.cta.label}: ${ctaUrl}`, ""] : []),
    ...(c.footnote ? [c.footnote, ""] : []),
    `Sent by QR Feed${brand !== "QR Feed" ? ` for ${brand}` : ""}.`,
  ].join("\n")

  return { html, text }
}
