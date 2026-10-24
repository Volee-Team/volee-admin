// Volee Admin — a static page. Everything it shows or changes goes through
// admin_* database functions that check app_is_admin() on the server, so the
// public key below can't see or do anything an ordinary player can't.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://nkkgpoohmndngvivttdc.supabase.co";
const SUPABASE_KEY = "sb_publishable_UIFcRTrzrhEPpY-wflXhAg_3LAsbqej"; // public key, same one shipped in the app
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const day = (d) => (d ? new Date(d.length === 10 ? d + "T12:00:00" : d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—");
const when = (d) => (d ? new Date(d).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—");
const STATES = ["upcoming", "registration_open", "late_registration", "active", "closed", "archived"];

function toast(msg, err = false) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast" + (err ? " err" : "");
  clearTimeout(toast.h);
  toast.h = setTimeout(() => t.classList.add("hidden"), 3500);
}

async function rpc(fn, args) {
  const { data, error } = await sb.rpc(fn, args ?? {});
  if (error) throw new Error(error.message);
  return data;
}

// One table cell: dates read as dates, objects as compact JSON, the rest escaped.
function cell(v) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return esc(JSON.stringify(v));
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return esc(when(v));
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return esc(day(v));
  return esc(v);
}

// A table from an array of plain objects; columns are the keys of the first row.
function table(rows, cols) {
  if (!rows || !rows.length) return `<p class="muted">Nothing here.</p>`;
  cols = cols ?? Object.keys(rows[0]).filter((k) => !/(^id$|_id$)/.test(k));
  return `<table><tr>${cols.map((c) => `<th>${esc(c.replaceAll("_", " "))}</th>`).join("")}</tr>${rows
    .map((r) => `<tr>${cols.map((c) => `<td>${cell(r[c])}</td>`).join("")}</tr>`)
    .join("")}</table>`;
}

// ---------------------------------------------------------------- auth

async function signIn(login, password) {
  if (login.includes("@")) {
    const { error } = await sb.auth.signInWithPassword({ email: login, password });
    if (error) throw new Error(error.message);
    return;
  }
  // Usernames go through the app's sign-in function, which never reveals emails.
  const r = await fetch(`${SUPABASE_URL}/functions/v1/sign-in`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY },
    body: JSON.stringify({ username: login, password }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok || !body.access_token) throw new Error(body.error || "Wrong username or password.");
  const { error } = await sb.auth.setSession({ access_token: body.access_token, refresh_token: body.refresh_token });
  if (error) throw new Error(error.message);
}

async function boot() {
  const { data } = await sb.auth.getSession();
  if (!data.session) return showSignIn();
  let ok = false;
  try { ok = await rpc("app_is_admin"); } catch { ok = false; }
  if (!ok) {
    await sb.auth.signOut();
    return showSignIn("That account isn't a Volee admin.");
  }
  $("#signin").classList.add("hidden");
  $("#app").classList.remove("hidden");
  $("#who").textContent = data.session.user.email ?? "";
  show("dashboard");
}

function showSignIn(msg = "") {
  $("#app").classList.add("hidden");
  $("#signin").classList.remove("hidden");
  $("#signin-error").textContent = msg;
}

$("#signin-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = e.submitter; btn.disabled = true;
  $("#signin-error").textContent = "";
  try { await signIn($("#login").value.trim(), $("#password").value); $("#password").value = ""; await boot(); }
  catch (err) { $("#signin-error").textContent = err.message; }
  finally { btn.disabled = false; }
});
$("#signout").addEventListener("click", async () => { await sb.auth.signOut(); showSignIn(); });

// ---------------------------------------------------------------- tabs

const loaders = { dashboard: loadDashboard, seasons: loadSeasons, players: () => {}, safety: loadSafety, settings: loadSettings };
function show(tab) {
  document.querySelectorAll("nav button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll("main > section").forEach((s) => s.classList.toggle("hidden", s.id !== "tab-" + tab));
  loaders[tab]().catch((e) => toast(e.message, true));
}
document.querySelectorAll("nav button").forEach((b) => b.addEventListener("click", () => show(b.dataset.tab)));

// ---------------------------------------------------------------- dashboard

async function loadDashboard() {
  const el = $("#tab-dashboard");
  el.innerHTML = `<p class="muted">Loading…</p>`;
  const d = await rpc("admin_dashboard");
  const tile = (n, l) => `<div class="tile"><div class="n">${esc(n)}</div><div class="l">${esc(l)}</div></div>`;
  const weeks = d.signups_by_week ?? [];
  const max = Math.max(1, ...weeks.map((w) => w.n));
  const s = d.singles_season;
  el.innerHTML = `
    <h2>Players (real accounts)</h2>
    <div class="tiles">
      ${tile(d.players, "Players")}${tile(d.adults, "Adults")}${tile(d.juniors, "Juniors")}${tile(d.managing_parents, "Managing parents")}
      ${tile(d.active_7d, "Signed in, last 7 days")}${tile(d.active_30d, "Signed in, last 30 days")}
      ${tile(d.signups_7d, "New, last 7 days")}${tile(d.signups_30d, "New, last 30 days")}
    </div>
    <h2>Sign-ups per week</h2>
    <div class="card">
      <div class="bars">${weeks.map((w) => `<div class="bar" style="height:${(w.n / max) * 100}%"><span>${w.n}</span></div>`).join("")}</div>
      <div class="barlabels">${weeks.map((w) => `<div>${esc(new Date(w.week + "T12:00:00").toLocaleDateString(undefined, { month: "numeric", day: "numeric" }))}</div>`).join("")}</div>
    </div>
    <h2>Play</h2>
    <div class="tiles">
      ${tile(d.singles_matches_30d, "Singles matches, 30 days")}${tile(d.singles_matches_total, "Singles matches, all time")}
      ${tile(d.challenges_pending, "Challenges awaiting a reply")}${tile(d.challenges_upcoming, "Matches scheduled")}
      ${tile(d.open_challenges, "Open challenges posted")}${tile(d.doubles_teams, "Doubles teams")}${tile(d.flex_open, "Flex requests open")}
    </div>
    <h2>Health</h2>
    <div class="tiles">
      ${tile(d.push_players, "Players with push on")}${tile(d.reports_open, "Unresolved reports")}${tile(d.feedback_30d, "Feedback, 30 days")}
      ${tile(`Season ${s.number}`, `Singles · ${day(s.starts_on)} → ${day(s.ends_on)}`)}
    </div>`;
}

// ---------------------------------------------------------------- seasons

async function loadSeasons() {
  const el = $("#tab-seasons");
  el.innerHTML = `<p class="muted">Loading…</p>`;
  const [seasons, dash] = await Promise.all([rpc("admin_seasons"), rpc("admin_dashboard")]);
  const s = dash.singles_season;
  el.innerHTML = `
    <h2>Singles</h2>
    <div class="card">
      <b>Season ${esc(s.number)}</b> · ${day(s.starts_on)} → ${day(s.ends_on)}
      <p class="muted small">Singles seasons run on a fixed four-month calendar (Mar 1, Jul 1, Nov 1). They roll over on their own; juniors who turned 18 move up when theirs ends.</p>
    </div>
    <h2>Doubles</h2>
    <div class="card">
      <div class="row">
        <button class="btn" id="run-tick">Run the daily tick now</button>
        <span class="muted small">Moves managed seasons along by date and sends any reminders due. It also runs by itself every morning.</span>
      </div>
    </div>
    ${(seasons ?? []).map(seasonCard).join("") || `<p class="muted">No doubles seasons yet.</p>`}
    <h2>Launch a new doubles season</h2>
    <form class="card" id="launch">
      <div class="grid2">
        <label>Name<input name="name" placeholder="Spring 2027" required></label>
        <label>Season starts<input name="start" type="date" required></label>
        <label>Regions (comma-separated, blank = all)<input name="regions" placeholder="Charlotte, Decorah"></label>
      </div>
      <p class="muted small">Registration opens 30 days before the start, closes on the start date, late registration runs 7 more days, and the season lasts about 4 months. The daily tick moves it along and sends the registration reminders, so only launch once the app version with doubles is live.</p>
      <button class="primary" type="submit">Launch season</button>
    </form>`;

  $("#run-tick").onclick = () => act(async () => {
    const r = await rpc("admin_run_season_tick");
    toast("Tick ran: " + JSON.stringify(r));
  });
  el.querySelectorAll("[data-state]").forEach((sel) => (sel.onchange = () => act(async () => {
    if (!confirm(`Move this season to "${sel.value.replaceAll("_", " ")}"?`)) return loadSeasons();
    await rpc("admin_set_season_state", { p_season: sel.dataset.state, p_state: sel.value });
    toast("Season moved to " + sel.value.replaceAll("_", " "));
  })));
  el.querySelectorAll("[data-managed]").forEach((cb) => (cb.onchange = () => act(async () => {
    await rpc("admin_set_season_managed", { p_season: cb.dataset.managed, p_managed: cb.checked });
    toast(cb.checked ? "The daily tick now moves this season by date" : "This season now only moves when you move it");
  })));
  el.querySelectorAll("[data-shift]").forEach((b) => (b.onclick = () => act(async () => {
    await rpc("admin_shift_season", { p_season: b.dataset.shift, p_days: Number(b.dataset.days) });
    toast(`Dates moved ${Number(b.dataset.days) > 0 ? "later" : "earlier"} by ${Math.abs(b.dataset.days)} day(s)`);
  })));
  $("#launch").onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const regions = String(f.get("regions") || "").split(",").map((x) => x.trim()).filter(Boolean);
    act(async () => {
      if (!confirm(`Launch "${f.get("name")}" starting ${f.get("start")}? Registration reminders will start going out to players.`)) return;
      await rpc("admin_launch_season", { p_name: f.get("name"), p_starts_on: f.get("start"), p_regions: regions.length ? regions : null });
      toast("Season launched");
    });
  };
}

function seasonCard(s) {
  const tone = { active: "good", registration_open: "good", late_registration: "warn", closed: "bad", archived: "" }[s.state] ?? "";
  return `<div class="card">
    <div class="season-head">
      <div><b style="font-size:17px">${esc(s.name)}</b> <span class="pill ${tone}">${esc(s.state.replaceAll("_", " "))}</span>
        <div class="muted small">${esc(s.bracket)} · ${esc(s.ladders)} ladders · ${esc(s.teams)} teams · ${esc(s.open_challenges)} open challenges</div></div>
      <div class="row">
        <label class="row small" style="flex-direction:row"><input type="checkbox" data-managed="${s.id}" ${s.lifecycle_managed ? "checked" : ""} style="width:auto"> Move by date automatically</label>
      </div>
    </div>
    <div class="dates">
      <div><b>Registration opens</b>${day(s.registration_opens_on)}</div>
      <div><b>Registration closes</b>${day(s.registration_closes_on)}</div>
      <div><b>Late registration ends</b>${day(s.late_registration_ends_on)}</div>
      <div><b>Starts</b>${day(s.starts_on)}</div>
      <div><b>Ends</b>${day(s.ends_on)}</div>
    </div>
    <div class="row">
      <label class="row small" style="flex-direction:row">State
        <select data-state="${s.id}" style="width:auto">${STATES.map((x) => `<option value="${x}" ${x === s.state ? "selected" : ""}>${x.replaceAll("_", " ")}</option>`).join("")}</select></label>
      <span class="muted small">Shift all dates:</span>
      ${[-7, -1, 1, 7].map((n) => `<button class="btn" data-shift="${s.id}" data-days="${n}">${n > 0 ? "+" : ""}${n}d</button>`).join("")}
    </div>
  </div>`;
}

async function act(fn) {
  try { await fn(); } catch (e) { toast(e.message, true); }
  if (!$("#tab-seasons").classList.contains("hidden")) loadSeasons().catch(() => {});
}

// ---------------------------------------------------------------- players

let searchTimer;
$("#player-q").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    const q = e.target.value.trim();
    $("#player-detail").innerHTML = "";
    if (q.length < 2) return ($("#player-results").innerHTML = "");
    try {
      const rows = await rpc("admin_find_players", { p_q: q });
      $("#player-results").innerHTML = rows.length
        ? `<div class="card"><table><tr><th>Name</th><th>Username</th><th>Email</th><th>City</th><th>Level</th><th>Joined</th><th>Last sign-in</th></tr>${rows
            .map((r) => `<tr class="click" data-player="${r.id}"><td>${esc(r.display_name)} ${r.minor ? '<span class="pill warn">U18</span>' : ""}${r.test_account ? ' <span class="pill">test</span>' : ""}${r.hidden ? ' <span class="pill">hidden</span>' : ""}</td><td>${esc(r.username)}</td><td>${esc(r.email)}</td><td>${esc(r.city)}</td><td>${r.ntrp ? "NTRP " + esc(r.ntrp) : r.tier ? "Tier " + esc(r.tier) : r.managing ? "Manager" : "—"}</td><td>${day(r.joined_at)}</td><td>${when(r.last_sign_in_at)}</td></tr>`)
            .join("")}</table></div>`
        : `<p class="muted">No players match.</p>`;
      document.querySelectorAll("[data-player]").forEach((tr) => (tr.onclick = () => loadPlayer(tr.dataset.player)));
    } catch (err) { toast(err.message, true); }
  }, 250);
});

async function loadPlayer(id) {
  const el = $("#player-detail");
  el.innerHTML = `<p class="muted">Loading…</p>`;
  const d = await rpc("admin_player", { p_id: id });
  const p = d.profile;
  el.innerHTML = `
    <div class="card">
      <b style="font-size:18px">${esc(p.display_name)}</b> ${p.minor ? '<span class="pill warn">Under 18</span>' : '<span class="pill">Adult</span>'}
      <div class="muted small">${[p.username ? "@" + esc(p.username) : "", esc(p.email), esc(p.city)].filter(Boolean).join(" · ")}</div>
      <div class="dates">
        <div><b>Level</b>${p.ntrp ? "NTRP " + esc(p.ntrp) + " (" + esc(p.ntrp_source) + ")" : p.tier ? "Tier " + esc(p.tier) : "—"}</div>
        <div><b>Record</b>${esc(d.record.wins)}–${esc(d.record.losses)}</div>
        <div><b>Rating</b>${esc(p.rating)} ± ${esc(Math.round(p.rating_deviation ?? 0))}</div>
        <div><b>Last ranked match</b>${day(p.last_ranked_match_at)}</div>
        <div><b>No-shows</b>${esc(p.no_show_count ?? 0)}</div>
        <div><b>Joined</b>${day(p.joined_at)}</div>
        <div><b>Last sign-in</b>${when(p.last_sign_in_at)}</div>
        <div><b>Push</b>${p.has_push ? "On" : "Off"}</div>
        <div><b>Blocked by</b>${esc(d.blocked_by)} player(s)</div>
        <div><b>Family</b>${d.family ? esc(d.family.role) + " · " + esc(d.family.subscription_status) : "—"}</div>
      </div>
    </div>
    <h2>Recent challenges</h2><div class="card">${table(d.recent_challenges, ["opponent", "status", "challenge_type", "scheduled_for", "created_at"])}</div>
    <h2>Reports against them</h2><div class="card">${table(d.reports_against, ["reporter", "reason", "note", "created_at", "resolved"])}</div>
    <h2>Doubles</h2><div class="card">${table(d.doubles_teams, ["name", "state", "member_status"])}</div>`;
}

// ---------------------------------------------------------------- safety

async function loadSafety() {
  const el = $("#tab-safety");
  el.innerHTML = `<p class="muted">Loading…</p>`;
  const [reports, alerts, sandbag, kids, feedback] = await Promise.all([
    rpc("admin_reports"), rpc("admin_alerts"), rpc("admin_sandbag_summary"), rpc("admin_kids_turning_18"), rpc("admin_feedback"),
  ]);
  el.innerHTML = `
    <h2>Player reports</h2>
    <div class="card">${(reports ?? []).length ? `<table><tr><th>Reported</th><th>By</th><th>Reason</th><th>Note</th><th>When</th><th></th></tr>${reports
      .map((r) => `<tr><td>${esc(r.reported)}</td><td>${esc(r.reporter)}</td><td>${esc(r.reason)}</td><td>${esc(r.note)}${r.resolution_note ? `<div class="muted small">Resolved: ${esc(r.resolution_note)}</div>` : ""}</td><td>${when(r.created_at)}</td><td>${r.resolved ? '<span class="pill good">Resolved</span>' : `<button class="btn" data-resolve="${r.id}">Resolve</button>`}</td></tr>`)
      .join("")}</table>` : `<p class="muted">No reports.</p>`}</div>
    <h2>Doubles alerts</h2><div class="card">${(alerts ?? []).length ? `<table><tr><th>Alert</th><th>When</th><th></th></tr>${alerts
      .map((a) => `<tr><td>${esc((a.kind ?? "").replaceAll("_", " "))}<div class="muted small">${esc(typeof a.detail === "object" && a.detail !== null ? JSON.stringify(a.detail) : a.detail ?? "")}</div></td><td>${when(a.created_at)}</td><td>${a.acknowledged_at ? '<span class="pill good">Seen</span>' : `<button class="btn" data-ack="${a.id}">Mark seen</button>`}</td></tr>`)
      .join("")}</table>` : `<p class="muted">No alerts.</p>`}</div>
    <h2>Sandbagger flags</h2><div class="card">${table(sandbag)}</div>
    <h2>Kids turning 18 soon</h2><div class="card">${table(kids)}</div>
    <h2>Feedback</h2><div class="card">${table(feedback, ["player", "message", "app_version", "created_at"])}</div>`;
  el.querySelectorAll("[data-resolve]").forEach((b) => (b.onclick = async () => {
    const note = prompt("Resolution note (optional)") ?? null;
    if (note === null) return;
    try { await rpc("admin_resolve_report", { p_id: b.dataset.resolve, p_note: note }); toast("Report resolved"); loadSafety(); }
    catch (e) { toast(e.message, true); }
  }));
  el.querySelectorAll("[data-ack]").forEach((b) => (b.onclick = async () => {
    try { await rpc("admin_ack_alert", { p_alert: b.dataset.ack }); toast("Marked seen"); loadSafety(); }
    catch (e) { toast(e.message, true); }
  }));
}

// ---------------------------------------------------------------- settings

async function loadSettings() {
  const el = $("#tab-settings");
  el.innerHTML = `<p class="muted">Loading…</p>`;
  const [kidAlerts, storeUrl, ml] = await Promise.all([
    rpc("admin_get_setting", { p_key: "kid_age_alerts" }), rpc("admin_get_setting", { p_key: "app_store_url" }), rpc("admin_ml_scoreboard"),
  ]);
  el.innerHTML = `
    <h2>App settings</h2>
    <div class="card">
      <label class="row" style="flex-direction:row;font-size:15px;color:var(--text)"><input type="checkbox" id="kid-alerts" ${kidAlerts === "on" ? "checked" : ""} style="width:auto">
        Tell parents when a family member is about to turn 18</label>
      <p class="muted small">Daily at 9:30 UTC. Parents get a reminder to hand the account over.</p>
    </div>
    <div class="card">
      <label>App Store link used in invite texts<input id="store-url" value="${esc(storeUrl)}"></label>
      <div class="row" style="margin-top:8px"><button class="btn" id="save-url">Save link</button></div>
    </div>
    <h2>ML win-chance forecasts (shadow mode)</h2>
    <div class="card"><p class="muted small">Hidden from players. Scored on real adult singles matches as results come in; lower log loss is better, 0.693 is a coin flip.</p><pre>${esc(JSON.stringify(ml, null, 2))}</pre></div>`;
  $("#kid-alerts").onchange = async (e) => {
    try { await rpc("admin_set_setting", { p_key: "kid_age_alerts", p_value: e.target.checked ? "on" : "off" }); toast(e.target.checked ? "Parent alerts on" : "Parent alerts off"); }
    catch (err) { toast(err.message, true); e.target.checked = !e.target.checked; }
  };
  $("#save-url").onclick = async () => {
    try { await rpc("admin_set_setting", { p_key: "app_store_url", p_value: $("#store-url").value.trim() }); toast("Saved"); }
    catch (err) { toast(err.message, true); }
  };
}

sb.auth.onAuthStateChange((event) => { if (event === "SIGNED_OUT") showSignIn(); });
boot();
