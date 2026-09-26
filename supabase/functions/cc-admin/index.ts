// Cross Core Ops Suite — account administration + automatic lead search
// Deploy: Supabase → Edge Functions → Deploy a new function → Via Editor → name it "cc-admin" → paste this file → Deploy.
// Account actions (HR and company heads): create (new login + temporary password), reset (new temporary password), set_active.
// Lead search actions: lead_search and search_status (any active employee), set_search_key (company heads).
// Video call backup: meet_link (any active employee) creates one Google Meet link per call with the company Google
//   account (Meet REST API); google_config / google_auth_url / google_connect / google_disconnect / google_status (heads).
//   The search key is stored server-side only (table cc_secrets, or the LEAD_SEARCH_KEY secret) and is never sent to browsers.
//   Results are real web search results for public LinkedIn profile pages (site:linkedin.com/in). Nothing is generated.
// No external imports, so it deploys cleanly from the dashboard editor.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };

async function call(path: string, init: RequestInit = {}) {
  const r = await fetch(`${URL_}${path}`, { ...init, headers: { ...svc, ...(init.headers || {}) } });
  const text = await r.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) throw new Error(data?.msg || data?.message || data?.error_description || data?.error || `HTTP ${r.status}`);
  return data;
}
const people = {
  get: async (filter: string) => (await call(`/rest/v1/cc_people?${filter}&select=*`))?.[0] || null,
  upsert: (row: Record<string, unknown>) => call(`/rest/v1/cc_people?on_conflict=email`, {
    method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(row) }),
  patch: (email: string, patch: Record<string, unknown>) => call(`/rest/v1/cc_people?email=eq.${encodeURIComponent(email)}`, {
    method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(patch) }),
};
const authAdmin = {
  create: (body: Record<string, unknown>) => call(`/auth/v1/admin/users`, { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: Record<string, unknown>) => call(`/auth/v1/admin/users/${id}`, { method: "PUT", body: JSON.stringify(body) }),
};

/* ---- automatic lead search ---- */
const secrets = {
  get: async (k: string) => (await call(`/rest/v1/cc_secrets?k=eq.${encodeURIComponent(k)}&select=v`))?.[0]?.v ?? null,
  set: (k: string, v: string) => call(`/rest/v1/cc_secrets?on_conflict=k`, {
    method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ k, v, updated_at: new Date().toISOString() }) }),
};
async function searchConfig() {
  let provider = Deno.env.get("LEAD_SEARCH_PROVIDER") || "", key = Deno.env.get("LEAD_SEARCH_KEY") || "";
  if (!key) { try { key = (await secrets.get("search_key")) || ""; provider = (await secrets.get("search_provider")) || provider; } catch (_) { /* table not created yet */ } }
  let limit = 1000; try { limit = Number(await secrets.get("search_limit")) || 1000; } catch (_) {}
  return { provider: ["brave", "tavily"].includes(provider) ? provider : "serper", key, limit };
}
const monthKey = () => "usage:" + new Date().toISOString().slice(0, 7);
async function usage() { try { return Number(await secrets.get(monthKey())) || 0; } catch (_) { return 0; } }
async function addUsage(n: number) { try { await secrets.set(monthKey(), String((await usage()) + n)); } catch (_) {} }
const LI = /^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/[^/?#\s]+/i;
type Hit = { link: string; title: string; snippet: string };
async function searchPage(cfg: { provider: string; key: string }, q: string, page: number, gl: string): Promise<Hit[] | null> {
  const base = Deno.env.get("LEAD_SEARCH_BASE"); // testing override only
  if (cfg.provider === "tavily") {
    if (page > 1) return null; // Tavily has no pages; the portal sends several query variants instead
    const COUNTRY: Record<string, string> = { us: "united states", au: "australia", gb: "united kingdom", ca: "canada", nz: "new zealand", ph: "philippines", sg: "singapore", ae: "united arab emirates", in: "india" };
    const plain = q.replace(/site:linkedin\.com\/in/i, "").replace(/-"[^"]*"/g, "").replace(/[()"]/g, "").replace(/\s+OR\s+/g, ", ").replace(/\s+/g, " ").trim();
    const r = await fetch(`${base || "https://api.tavily.com"}/search`, {
      method: "POST", headers: { Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: `${plain} LinkedIn profile`, search_depth: "basic", max_results: 20, include_domains: ["linkedin.com"], ...(COUNTRY[gl] ? { country: COUNTRY[gl] } : {}) }) });
    if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? "The search key was rejected by Tavily" : r.status === 429 || r.status === 432 ? "This month's free Tavily searches are used up" : `Tavily returned HTTP ${r.status}`);
    const d = await r.json();
    const list = d?.results || [];
    return list.length ? list.map((x: any) => ({ link: x.url, title: x.title || "", snippet: x.content || "" })) : null;
  }
  if (cfg.provider === "brave") {
    const u = `${base || "https://api.search.brave.com"}/res/v1/web/search?q=${encodeURIComponent(q)}&count=20&offset=${page - 1}${gl ? "&country=" + gl : ""}`;
    const r = await fetch(u, { headers: { "X-Subscription-Token": cfg.key, Accept: "application/json" } });
    if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? "The search key was rejected by Brave" : r.status === 429 ? "Search limit reached at Brave" : `Brave returned HTTP ${r.status}`);
    const d = await r.json();
    const list = d?.web?.results || [];
    return list.length ? list.map((x: any) => ({ link: x.url, title: x.title || "", snippet: (x.description || "").replace(/<[^>]+>/g, "") })) : null;
  }
  const r = await fetch(`${base || "https://google.serper.dev"}/search`, {
    method: "POST", headers: { "X-API-KEY": cfg.key, "Content-Type": "application/json" },
    body: JSON.stringify({ q, num: 10, page, ...(gl ? { gl } : {}) }) });
  if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? "The search key was rejected by Serper" : r.status === 429 ? "Search limit reached at Serper" : `Serper returned HTTP ${r.status}`);
  const d = await r.json();
  const list = d?.organic || [];
  return list.length ? list.map((x: any) => ({ link: x.link, title: x.title || "", snippet: x.snippet || "" })) : null;
}

/* ---- Google Meet links (Meet REST API, company Google account) ---- */
const GTEST = Deno.env.get("GOOGLE_TEST_BASE"); // testing override only
const G_TOKEN = `${GTEST || "https://oauth2.googleapis.com"}/token`;
const G_MEET = `${GTEST || "https://meet.googleapis.com"}/v2/spaces`;
const G_SCOPE = "openid email https://www.googleapis.com/auth/meetings.space.created";
async function googleToken() {
  const [id, secret, refresh] = [await secrets.get("google_client_id"), await secrets.get("google_client_secret"), await secrets.get("google_refresh")];
  if (!id || !secret || !refresh) return null;
  const r = await fetch(G_TOKEN, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: refresh, grant_type: "refresh_token" }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error_description || d.error || `Google token error ${r.status}`);
  return d.access_token as string;
}
function jwtEmail(idToken?: string) { try { return JSON.parse(atob(String(idToken).split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).email || ""; } catch (_) { return ""; } }

function tempPassword(): string {
  const words = ["Core", "Cross", "Team", "Ops", "Bright", "Swift", "Solid", "Prime", "Clear", "Bold"];
  const b = crypto.getRandomValues(new Uint8Array(6));
  return `${words[b[0] % 10]}${words[b[1] % 10]}${((b[2] << 8) | b[3]) % 9000 + 1000}${"!@#$%*"[b[4] % 6]}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    // Who is calling?
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const u = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: SERVICE, Authorization: `Bearer ${token}` } });
    if (!u.ok) return json({ error: "Not signed in" }, 401);
    const who = await u.json();
    const caller = await people.get(`user_id=eq.${who.id}`);
    if (!caller?.active) return json({ error: "Your account is not active" }, 403);
    const body = await req.json();

    if (body.action === "search_status") {
      const cfg = await searchConfig();
      return json({ ok: true, configured: !!cfg.key, provider: cfg.provider, used: await usage(), limit: cfg.limit });
    }
    if (body.action === "set_search_key") {
      if (caller.role !== "head") return json({ error: "Only company heads can change the search key" }, 403);
      const provider = ["brave", "tavily"].includes(body.provider) ? body.provider : "serper";
      if (typeof body.key === "string") await secrets.set("search_key", body.key.trim());
      await secrets.set("search_provider", provider);
      if (body.limit) await secrets.set("search_limit", String(Math.max(10, Math.min(100000, Number(body.limit) || 2000))));
      const cfg = await searchConfig();
      return json({ ok: true, configured: !!cfg.key, provider: cfg.provider, limit: cfg.limit });
    }
    if (body.action === "meet_link") {
      const callId = String(body.callId || "");
      if (!/^[a-z0-9]{8,40}$/i.test(callId)) return json({ error: "Invalid call" }, 400);
      const existing = await secrets.get("meet:" + callId).catch(() => null);
      if (existing) return json({ ok: true, url: existing, reused: true });
      const token = await googleToken();
      if (!token) return json({ error: "Google Meet is not connected — a system administrator connects it in Administration → Video calls" }, 400);
      const r = await fetch(G_MEET, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ config: { accessType: "OPEN" } }) });
      let d = await r.json().catch(() => ({}));
      if (!r.ok) { // older API versions reject config — retry with an empty space
        const r2 = await fetch(G_MEET, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: "{}" });
        d = await r2.json().catch(() => ({})); if (!r2.ok) return json({ error: d?.error?.message || `Google Meet error ${r2.status}` }, 502);
      }
      const again = await secrets.get("meet:" + callId).catch(() => null); // another participant may have created one meanwhile
      if (again) return json({ ok: true, url: again, reused: true });
      await secrets.set("meet:" + callId, d.meetingUri);
      return json({ ok: true, url: d.meetingUri });
    }
    if (String(body.action || "").startsWith("google_")) {
      if (body.action === "google_status") {
        return json({ ok: true, connected: !!(await secrets.get("google_refresh")), email: await secrets.get("google_email"), client: !!(await secrets.get("google_client_id")) });
      }
      if (caller.role !== "head") return json({ error: "Only company heads can connect Google" }, 403);
      if (body.action === "google_config") {
        if (body.client_id) await secrets.set("google_client_id", String(body.client_id).trim());
        if (body.client_secret) await secrets.set("google_client_secret", String(body.client_secret).trim());
        return json({ ok: true });
      }
      if (body.action === "google_auth_url") {
        const id = await secrets.get("google_client_id"); if (!id) return json({ error: "Save the Google OAuth client ID first" }, 400);
        const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        Object.entries({ client_id: id, redirect_uri: String(body.redirect_uri || ""), response_type: "code", scope: G_SCOPE, access_type: "offline", prompt: "consent", include_granted_scopes: "true", state: String(body.state || "") })
          .forEach(([k, v]) => u.searchParams.set(k, v));
        return json({ ok: true, url: u.toString() });
      }
      if (body.action === "google_connect") {
        const [id, secret] = [await secrets.get("google_client_id"), await secrets.get("google_client_secret")];
        if (!id || !secret) return json({ error: "Save the Google OAuth client ID and secret first" }, 400);
        const r = await fetch(G_TOKEN, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ code: String(body.code || ""), client_id: id, client_secret: secret, redirect_uri: String(body.redirect_uri || ""), grant_type: "authorization_code" }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) return json({ error: d.error_description || d.error || `Google returned ${r.status}` }, 400);
        if (!d.refresh_token) return json({ error: "Google did not return a long-term token. Remove the app's access in your Google account settings and connect again." }, 400);
        await secrets.set("google_refresh", d.refresh_token);
        await secrets.set("google_email", jwtEmail(d.id_token));
        return json({ ok: true, email: jwtEmail(d.id_token) });
      }
      if (body.action === "google_disconnect") { await secrets.set("google_refresh", ""); await secrets.set("google_email", ""); return json({ ok: true }); }
      return json({ error: "Unknown action" }, 400);
    }
    if (body.action === "lead_search") {
      const cfg = await searchConfig();
      if (!cfg.key) return json({ error: "Automatic search is not connected yet — a company head adds the search key in Administration" }, 400);
      const queries = (Array.isArray(body.queries) ? body.queries : [body.query]).slice(0, 10).map((x: unknown) => String(x || "").slice(0, 400).trim()).filter(Boolean);
      if (!queries.length || queries.some((q: string) => !/site:linkedin\.com\/in/i.test(q))) return json({ error: "Searches are limited to LinkedIn profile pages" }, 400);
      const pages = Math.max(1, Math.min(10, Number(body.pages) || 1));
      const used = await usage();
      if (used + pages * queries.length > cfg.limit) return json({ error: `This month's search limit (${cfg.limit} searches) has been reached. A company head can raise it in Administration.` }, 429);
      const gl = /^[a-z]{2}$/i.test(String(body.gl || "")) ? String(body.gl).toLowerCase() : "";
      const out: Hit[] = []; const seen = new Set<string>(); let done = 0;
      for (const q of queries) for (let p = 1; p <= pages; p++) {
        const hits = await searchPage(cfg, q, p, gl); done++;
        if (!hits) break;
        for (const h of hits) {
          const m = String(h.link || "").match(LI); if (!m) continue;
          const k = m[0].toLowerCase().replace(/^https?:\/\/([a-z]{2,3}\.)?/, "");
          if (seen.has(k)) continue; seen.add(k); out.push({ link: m[0], title: h.title, snippet: h.snippet });
        }
      }
      await addUsage(done);
      return json({ ok: true, provider: cfg.provider, results: out, pagesUsed: done, used: used + done, limit: cfg.limit });
    }

    if (!["hr", "head"].includes(caller.role))
      return json({ error: "Only HR and company heads can manage accounts" }, 403);
    const email = String(body.email || "").trim().toLowerCase();
    if (!email.includes("@")) return json({ error: "A valid email is required" }, 400);
    const existing = await people.get(`email=eq.${encodeURIComponent(email)}`);

    if (body.action === "create") {
      const person_key = String(body.person_key || "").trim();
      const role = ["head", "hr", "pm", "staff"].includes(body.role) ? body.role : "staff";
      if (!person_key) return json({ error: "person_key is required" }, 400);
      if ((role === "head" || existing?.role === "head") && caller.role !== "head")
        return json({ error: "Only company heads can create head accounts" }, 403);
      const password = tempPassword();
      await people.upsert({ email, person_key, role, active: true, must_change_pw: true });
      if (existing?.user_id) {
        await authAdmin.update(existing.user_id, { password, ban_duration: "none" });
      } else {
        try {
          const created = await authAdmin.create({ email, password, email_confirm: true, user_metadata: { person_key, name: body.name || "" } });
          await people.patch(email, { user_id: created.id });
        } catch (e) {
          return json({ error: String((e as Error).message) }, 400);
        }
      }
      return json({ ok: true, email, password });
    }

    if (!existing) return json({ error: "No account exists for this email yet" }, 404);
    if (existing.role === "head" && caller.role !== "head") return json({ error: "Only company heads can change head accounts" }, 403);

    if (body.action === "reset") {
      const password = tempPassword();
      if (existing.user_id) await authAdmin.update(existing.user_id, { password, ban_duration: "none" });
      else {
        const created = await authAdmin.create({ email, password, email_confirm: true });
        await people.patch(email, { user_id: created.id });
      }
      await people.patch(email, { must_change_pw: true, active: true });
      return json({ ok: true, email, password });
    }

    if (body.action === "set_active") {
      const active = !!body.active;
      await people.patch(email, { active });
      if (existing.user_id) await authAdmin.update(existing.user_id, { ban_duration: active ? "none" : "876000h" });
      return json({ ok: true, email, active });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
