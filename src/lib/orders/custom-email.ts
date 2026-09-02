import { esc, shell, type RenderedEmail } from "./email-html";
import type { ThemeTokens } from "@/lib/theme";

/**
 * R4-ORDERS-PLUS voce A — the free-text message an admin writes to the customer
 * from the order page.
 *
 * PURE, like `status-email.ts`: the theme arrives as a parameter and the
 * transport lives in `email.ts`. What the admin sees in the box is what leaves —
 * there is no template around the body, only the branded F30 shell the other
 * customer mails already use, so a message never arrives looking like a
 * different shop's.
 *
 * The body is plain text and is ESCAPED into the HTML: an admin typing `<b>`
 * means those five characters, and a paste from somewhere else must not be able
 * to inject markup into a mail the shop signs.
 */

/** «Om bestillingen MK-1042» — prefilled, and editable in the box. */
export function defaultMessageSubject(code: string): string {
  return `Om bestillingen ${code}`;
}

export function customMessageEmail(p: {
  subject: string;
  body: string;
  customerName: string;
  theme: ThemeTokens;
  /** Absolute site URL, for the logo in the shell. */
  baseUrl?: string;
}): RenderedEmail {
  const paragraphs = p.body.split(/\n{2,}/).filter((b) => b.trim() !== "");
  const bodyHtml = paragraphs
    .map(
      (b) =>
        `<p style="margin:0 0 10px;">${esc(b).replace(/\n/g, "<br>")}</p>`
    )
    .join("");
  return {
    subject: p.subject,
    text: p.body,
    html: shell(p.theme, {
      preheader: p.subject,
      heading: p.subject,
      bodyHtml,
      logoUrl: p.baseUrl ? `${p.baseUrl}/logo-white.png` : undefined,
    }),
  };
}
