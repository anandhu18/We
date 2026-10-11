import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply(405, { error: "Method not allowed." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const adminPin = Deno.env.get("ADMIN_PIN");
  const adminEmail = Deno.env.get("ADMIN_EMAIL");
  const adminPassword = Deno.env.get("ADMIN_PASSWORD");

  if (!supabaseUrl || !anonKey || !serviceKey || !adminPin || !adminEmail || !adminPassword) {
    return reply(503, { error: "Admin PIN login is not configured. Contact the site administrator." });
  }

  let body: { pin?: unknown };
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: "Invalid request." });
  }
  if (typeof body.pin !== "string" || body.pin.length < 1 || body.pin.length > 64) {
    return reply(400, { error: "Enter your admin PIN." });
  }

  // Use the gateway-provided client address only for throttling; never trust a client-supplied body field.
  const forwarded = req.headers.get("x-forwarded-for") ?? "";
  const realIp = req.headers.get("x-real-ip") ?? "";
  const clientIp = (realIp || forwarded.split(",").pop() || "unknown").trim().slice(0, 100);
  const ipHash = await sha256(clientIp);
  const serviceHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  try {
    const checkUrl = new URL("/rest/v1/admin_pin_attempts", supabaseUrl);
    checkUrl.searchParams.set("select", "id");
    checkUrl.searchParams.set("ip_hash", `eq.${ipHash}`);
    checkUrl.searchParams.set("attempted_at", `gt.${since}`);
    const check = await fetch(checkUrl, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
    if (!check.ok) return reply(503, { error: "Secure login is temporarily unavailable." });
    const attempts = await check.json();
    if (Array.isArray(attempts) && attempts.length >= 5) {
      return reply(429, { error: "Too many attempts. Wait 15 minutes and try again." });
    }

    if (body.pin !== adminPin) {
      await fetch(new URL("/rest/v1/admin_pin_attempts", supabaseUrl), {
        method: "POST",
        headers: { ...serviceHeaders, Prefer: "return=minimal" },
        body: JSON.stringify({ ip_hash: ipHash }),
      });
      return reply(401, { error: "PIN verification failed." });
    }

    // The PIN only unlocks a server-configured admin account; never trust a client-supplied email or user ID.
    const signIn = await fetch(new URL("/auth/v1/token?grant_type=password", supabaseUrl), {
      method: "POST",
      headers: { apikey: anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email: adminEmail, password: adminPassword }),
    });
    if (!signIn.ok) return reply(503, { error: "The configured admin account could not sign in. Contact the site administrator." });
    const session = await signIn.json();

    const statusResponse = await fetch(new URL("/rest/v1/rpc/my_status", supabaseUrl), {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    if (!statusResponse.ok) return reply(403, { error: "The configured account does not have admin permissions." });
    const status = await statusResponse.json();
    if (!status || status.role !== "admin") return reply(403, { error: "The configured account does not have admin permissions." });

    // Clear failed attempts after successful admin verification.
    const clearUrl = new URL("/rest/v1/admin_pin_attempts", supabaseUrl);
    clearUrl.searchParams.set("ip_hash", `eq.${ipHash}`);
    await fetch(clearUrl, { method: "DELETE", headers: serviceHeaders });
    return reply(200, { session: { access_token: session.access_token, refresh_token: session.refresh_token } });
  } catch {
    return reply(503, { error: "Secure login is temporarily unavailable." });
  }
});
