// Shared email-sending logic for the confirmation emails. Used by both
// send-confirmation (single guest, fired right after RSVP) and
// send-pending-confirmations (admin-triggered backfill).
//
// Sends through Gmail SMTP using a Google App Password — no third-party
// email service account needed. Required Edge Function secrets:
//   GMAIL_USER          the Gmail address emails are sent from
//   GMAIL_APP_PASSWORD  a 16-char Google App Password (NOT your login password)
//   APP_BASE_URL        the deployed site URL, for building check-in QR links

import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const STATUS_LABELS: Record<string, string> = {
  attending: "Attending",
  maybe: "Maybe Attending",
  not_attending: "Not Attending",
};

function buildCheckInUrl(appBaseUrl: string, id: string): string {
  return `${appBaseUrl.replace(/\/$/, "")}/checkin.html?id=${id}`;
}

function buildQrImageUrl(data: string): string {
  const encoded = encodeURIComponent(data);
  return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encoded}`;
}

function buildEmailHtml(rsvp: { full_name: string; attendance_status: string }, checkInUrl: string): string {
  const isComing = rsvp.attendance_status === "attending" || rsvp.attendance_status === "maybe";
  const qrImageUrl = buildQrImageUrl(checkInUrl);

  const eventDetails = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
      <tr>
        <td style="padding:14px 0;border-bottom:1px solid #e2ddd0;">
          <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#c7a052;font-weight:600;">Date</div>
          <div style="font-size:16px;color:#20232c;font-weight:600;">Saturday, 24th October 2026</div>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 0;border-bottom:1px solid #e2ddd0;">
          <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#c7a052;font-weight:600;">Thanksgiving Service</div>
          <div style="font-size:16px;color:#20232c;font-weight:600;">Christ Church</div>
          <div style="font-size:14px;color:#5b6170;">University of Ghana, Legon &mdash; 11:00 AM</div>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 0;">
          <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#c7a052;font-weight:600;">Reception</div>
          <div style="font-size:16px;color:#20232c;font-weight:600;">Naval Ward Room</div>
          <div style="font-size:14px;color:#5b6170;">Close to 37 Military Hospital, Accra, Ghana &mdash; 2:00 PM</div>
        </td>
      </tr>
    </table>
  `;

  const ticketBlock = isComing
    ? `
      <div style="text-align:center;margin:28px 0;padding:24px;background:#f7f4ec;border-radius:12px;">
        <p style="font-size:14px;color:#5b6170;margin:0 0 16px;">Please show this QR code at the door so we can check you in:</p>
        <img src="${qrImageUrl}" width="200" height="200" alt="Check-in QR code" style="display:block;margin:0 auto;border-radius:8px;" />
        <p style="font-size:12px;color:#5b6170;margin:16px 0 0;">Can't scan it? Use this link instead:<br/>
          <a href="${checkInUrl}" style="color:#1f2f58;">${checkInUrl}</a>
        </p>
      </div>
    `
    : "";

  const introMessage = isComing
    ? `Thank you for confirming your RSVP. We're delighted you'll be joining us!`
    : `Thank you for letting us know. You'll be missed, but we appreciate the response!`;

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#20232c;">
      <div style="text-align:center;margin-bottom:24px;">
        <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#c7a052;font-weight:700;">RSVP Confirmed</div>
        <h1 style="font-size:22px;color:#121c3a;margin:8px 0 0;">Stephen Raymond Dapaa-Addo, Esq.</h1>
        <p style="font-size:16px;color:#1f2f58;margin:4px 0 0;">80th Birthday Celebration</p>
      </div>
      <p style="font-size:15px;line-height:1.6;">Hi ${rsvp.full_name},</p>
      <p style="font-size:15px;line-height:1.6;">${introMessage}</p>
      <p style="font-size:14px;color:#5b6170;">Your response: <strong style="color:#20232c;">${STATUS_LABELS[rsvp.attendance_status] || rsvp.attendance_status}</strong></p>
      ${eventDetails}
      ${ticketBlock}
      <p style="font-size:13px;color:#5b6170;text-align:center;margin-top:28px;">With love, in celebration of 80 wonderful years.</p>
    </div>
  `;
}

export async function sendConfirmationEmail(
  rsvp: { id: string; full_name: string; email: string; attendance_status: string }
): Promise<{ ok: boolean; error?: string }> {
  const gmailUser = Deno.env.get("GMAIL_USER");
  const gmailAppPassword = Deno.env.get("GMAIL_APP_PASSWORD");
  const appBaseUrl = Deno.env.get("APP_BASE_URL");

  if (!gmailUser || !gmailAppPassword || !appBaseUrl) {
    return { ok: false, error: "Missing GMAIL_USER, GMAIL_APP_PASSWORD, or APP_BASE_URL secret" };
  }

  const checkInUrl = buildCheckInUrl(appBaseUrl, rsvp.id);
  const html = buildEmailHtml(rsvp, checkInUrl);
  const isComing = rsvp.attendance_status === "attending" || rsvp.attendance_status === "maybe";
  const subject = isComing
    ? "You're confirmed! Stephen's 80th Birthday Celebration"
    : "Thanks for your response — Stephen's 80th Birthday";

  const client = new SMTPClient({
    connection: {
      hostname: "smtp.gmail.com",
      port: 465,
      tls: true,
      auth: { username: gmailUser, password: gmailAppPassword },
    },
  });

  try {
    await client.send({
      from: `Stephen's 80th Birthday <${gmailUser}>`,
      to: `${rsvp.full_name} <${rsvp.email}>`,
      subject,
      html,
    });
    await client.close();
    return { ok: true };
  } catch (err) {
    try {
      await client.close();
    } catch {
      // ignore close errors — the send failure is what matters
    }
    return { ok: false, error: `Gmail SMTP send failed: ${String(err).slice(0, 300)}` };
  }
}
