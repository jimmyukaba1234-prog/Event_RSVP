// Shared CORS allow-list across all Edge Functions in this project.
// Update this list whenever the deployed domain changes (e.g. after
// renaming the Vercel project) — every function below silently fails to
// return usable data to a browser origin that isn't in this set.
const ALLOWED_ORIGINS = new Set<string>([
  "http://localhost:5500",
  "https://stephen80.vercel.app",
  "https://stephen80-git-main-jim-ai-lab.vercel.app",
]);

export function corsHeaders(origin: string | null): HeadersInit {
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Vary": "Origin",
  };
}

export function jsonResponse(body: unknown, status: number, headers: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "content-type": "application/json" },
  });
}
