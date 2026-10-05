// Edge Function: send-pending-confirmations
//
// Admin-triggered backfill: sends the confirmation email to every guest
// who doesn't have one yet (confirmation_sent = false) — covers RSVPs
// submitted before this feature existed, or any that failed to send
// earlier. Idempotent: guests who already got one are skipped, so this
// is always safe to click again.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { sendConfirmationEmail } from "../_shared/email.ts";

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, headers);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing Supabase server configuration");
    }
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: pending, error: fetchError } = await supabase
      .from("rsvps")
      .select("id, full_name, email, attendance_status, confirmation_sent")
      .eq("confirmation_sent", false);

    if (fetchError) throw fetchError;

    let sent = 0;
    let failed = 0;

    for (const rsvp of pending ?? []) {
      const result = await sendConfirmationEmail(rsvp);
      if (result.ok) {
        const { error: updateError } = await supabase
          .from("rsvps")
          .update({ confirmation_sent: true })
          .eq("id", rsvp.id);
        if (updateError) {
          console.error("send-pending-confirmations: update failed for", rsvp.id, updateError);
          failed++;
        } else {
          sent++;
        }
      } else {
        console.error("send-pending-confirmations: email failed for", rsvp.id, result.error);
        failed++;
      }
    }

    return jsonResponse({ ok: true, sent, failed, total: (pending ?? []).length }, 200, headers);
  } catch (err) {
    console.error("send-pending-confirmations error:", err);
    return jsonResponse({ error: "Unable to send pending confirmations" }, 500, headers);
  }
});
