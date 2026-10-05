// Edge Function: checkin
//
// Powers checkin.html, the page a guest's QR code links to.
// GET  ?id=<rsvp_id>  -> look up the guest's name/status for display only (no mutation)
// POST ?id=<rsvp_id>  -> mark checked_in=true, checked_in_at=now() (idempotent)
//
// Uses service_role server-side, same as every other admin-facing function
// in this project — the browser never gets direct table access.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, headers);
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return jsonResponse({ error: "Missing id" }, 400, headers);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing Supabase server configuration");
    }
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    if (req.method === "GET") {
      const { data: rsvp, error } = await supabase
        .from("rsvps")
        .select("full_name, attendance_status, checked_in, checked_in_at")
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;
      if (!rsvp) {
        return jsonResponse({ error: "Guest not found" }, 404, headers);
      }
      return jsonResponse({ ok: true, rsvp }, 200, headers);
    }

    // POST — perform the check-in
    const { data: existing, error: fetchError } = await supabase
      .from("rsvps")
      .select("full_name, attendance_status, checked_in, checked_in_at")
      .eq("id", id)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!existing) {
      return jsonResponse({ error: "Guest not found" }, 404, headers);
    }

    if (existing.checked_in) {
      return jsonResponse({ ok: true, alreadyCheckedIn: true, rsvp: existing }, 200, headers);
    }

    const { data: updated, error: updateError } = await supabase
      .from("rsvps")
      .update({ checked_in: true, checked_in_at: new Date().toISOString() })
      .eq("id", id)
      .select("full_name, attendance_status, checked_in, checked_in_at")
      .maybeSingle();

    if (updateError) throw updateError;

    return jsonResponse({ ok: true, rsvp: updated }, 200, headers);
  } catch (err) {
    console.error("checkin error:", err);
    return jsonResponse({ error: "Unable to process check-in" }, 500, headers);
  }
});
