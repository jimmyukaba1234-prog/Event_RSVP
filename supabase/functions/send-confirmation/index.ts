// Edge Function: send-confirmation
//
// Called by the public RSVP page right after a successful insert. Sends
// the guest a confirmation email (with a check-in QR code for anyone
// attending/maybe), then marks confirmation_sent=true so the admin
// "send to pending guests" backfill doesn't re-send it.
//
// Uses service_role (server-side only secret) to read/write the row —
// the browser never gets read access to this table, by design.

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

  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid request body" }, 400, headers);
  }

  if (!body.id) {
    return jsonResponse({ error: "Missing id" }, 400, headers);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing Supabase server configuration");
    }
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: rsvp, error: fetchError } = await supabase
      .from("rsvps")
      .select("id, full_name, email, attendance_status, confirmation_sent")
      .eq("id", body.id)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!rsvp) {
      return jsonResponse({ error: "RSVP not found" }, 404, headers);
    }

    if (rsvp.confirmation_sent) {
      return jsonResponse({ ok: true, alreadySent: true }, 200, headers);
    }

    const result = await sendConfirmationEmail(rsvp);
    if (!result.ok) {
      console.error("send-confirmation: email failed:", result.error);
      return jsonResponse({ error: "Unable to send confirmation email" }, 500, headers);
    }

    const { error: updateError } = await supabase
      .from("rsvps")
      .update({ confirmation_sent: true })
      .eq("id", body.id);

    if (updateError) throw updateError;

    return jsonResponse({ ok: true }, 200, headers);
  } catch (err) {
    console.error("send-confirmation error:", err);
    return jsonResponse({ error: "Unable to send confirmation email" }, 500, headers);
  }
});
