// Edge Function: admin-rsvps
//
// Returns RSVP records for the admin dashboard. This is the ONLY place
// the Supabase service_role key is used — it lives here as a platform
// secret (Deno.env.get), never in any browser-shipped file.
//
// NO ACCESS CONTROL: by explicit, informed decision, this endpoint has no
// token/auth check. Anyone who has this URL can read every guest's name,
// email, and attendance status — CORS only restricts which *browser
// origins* can call it, it does nothing against direct requests (curl,
// scripts, etc.). Accepted deliberately for the short lifespan of this
// event; see README "Security & Known Limitations" before reusing this
// pattern anywhere data sensitivity is higher or the dashboard needs to
// stay live longer.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405, headers);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing Supabase server configuration");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data, error } = await supabase
      .from("rsvps")
      .select("id, full_name, email, attendance_status, created_at, checked_in, checked_in_at")
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return jsonResponse({ rsvps: data }, 200, headers);
  } catch (err) {
    console.error("admin-rsvps error:", err);
    return jsonResponse({ error: "Unable to load RSVP data" }, 500, headers);
  }
});
