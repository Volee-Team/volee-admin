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

// Email + password only: the app's username sign-in function doesn't accept
// calls from web pages, and admins all have an email on their account.
async function signIn(login, password) {
  if (!login.includes("@")) throw new Error("Use the email address on your Volee account.");
  const { error } = await sb.auth.signInWithPassword({ email: login, password });
  if (error) throw new Error(error.message === "Invalid login credentials" ? "Wrong email or password." : error.message);
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

const loaders = { dashboard: loadDashboard, seasons: loadSeasons, players: async () => {}, matches: loadMatches,
                  safety: loadSafety, announce: loadAnnounce, settings: loadSettings, activity: loadActivity };
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

const addDays = (iso, n) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const addMonths = (iso, n) => { const d = new Date(iso + "T12:00:00"); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 10); };

async function loadSeasons() {
  const el = $("#tab-seasons");
  el.innerHTML = `<p class="muted">Loading…</p>`;
  const [singles, seasons] = await Promise.all([rpc("admin_singles_seasons"), rpc("admin_seasons")]);
  const tone = { current: "good", upcoming: "warn", finished: "" };
  el.innerHTML = `
    <h2>Singles seasons</h2>
    <div class="card">
      <p class="muted small">The app shows "Season N · days left" from these, and juniors who turned 18 move up when their season ends. Seasons can't overlap. Only seasons that haven't started can be deleted.</p>
      <table><tr><th>#</th><th>Name</th><th>Starts</th><th>Ends (next starts)</th><th></th><th></th></tr>
      ${(singles ?? []).map((s) => `<tr>
        <td>${esc(s.number)}</td>
        <td><input value="${esc(s.name)}" data-sname="${s.id}"></td>
        <td><input type="date" value="${s.starts_on}" data-sstart="${s.id}"></td>
        <td><input type="date" value="${s.ends_on}" data-send="${s.id}"></td>
        <td><span class="pill ${tone[s.status] ?? ""}">${esc(s.status)}</span></td>
        <td class="row"><button class="btn" data-ssave="${s.id}">Save</button>${s.status === "upcoming" ? `<button class="btn danger" data-sdel="${s.id}">Delete</button>` : ""}</td></tr>`).join("")}
      </table>
    </div>
    <form class="card" id="new-singles">
      <b>Add a singles season</b>
      <div class="grid2" style="margin-top:8px">
        <label>Name<input name="name" placeholder="Season ${(singles?.length ?? 0) + 1}" required></label>
        <label>Starts<input name="start" type="date" value="${singles?.length ? singles[singles.length - 1].ends_on : ""}" required></label>
        <label>Ends<input name="end" type="date" value="${singles?.length ? addMonths(singles[singles.length - 1].ends_on, 4) : ""}" required></label>
      </div>
      <button class="primary" type="submit" style="margin-top:10px">Add season</button>
    </form>

    <h2>Doubles seasons</h2>
    <div class="card"><div class="row">
      <button class="btn" id="run-tick">Run the daily tick now</button>
      <span class="muted small">Moves seasons that move by date along, and sends any registration reminders due. Also runs by itself every morning.</span>
    </div></div>
    ${(seasons ?? []).map(seasonCard).join("") || `<p class="muted">No doubles seasons yet.</p>`}

    <h2>Create a doubles season</h2>
    <form class="card" id="new-doubles">
      <div class="grid2">
        <label>Name<input name="name" placeholder="Spring 2027" required></label>
        <label>Regions (comma-separated)<input name="regions" placeholder="Charlotte, Decorah" required></label>
        <label>Season starts<input name="starts" type="date" required></label>
        <label>Season ends<input name="ends" type="date" required></label>
        <label>Registration opens<input name="opens" type="date" required></label>
        <label>Registration closes<input name="closes" type="date" required></label>
        <label>Late registration ends<input name="late" type="date" required></label>
        <label class="row" style="flex-direction:row;align-items:center;margin-top:22px"><input type="checkbox" name="managed" checked style="width:auto"> Move by date automatically</label>
      </div>
      <p class="muted small">Pick the start and the other dates fill in with the usual spacing (registration 30 days before, late registration 7 days after, about 4 months long); change any of them. Registration reminders go out once it opens, so only open it when the doubles update is live.</p>
      <button class="primary" type="submit">Create season</button>
    </form>`;

  // singles
  el.querySelectorAll("[data-ssave]").forEach((b) => (b.onclick = () => act(async () => {
    const id = b.dataset.ssave;
    await rpc("admin_save_singles_season", { p_id: id, p_name: el.querySelector(`[data-sname="${id}"]`).value,
      p_starts_on: el.querySelector(`[data-sstart="${id}"]`).value, p_ends_on: el.querySelector(`[data-send="${id}"]`).value });
    toast("Season saved");
  }, loadSeasons)));
  el.querySelectorAll("[data-sdel]").forEach((b) => (b.onclick = () => act(async () => {
    if (!confirm("Delete this upcoming season?")) return;
    await rpc("admin_delete_singles_season", { p_id: b.dataset.sdel });
    toast("Season deleted");
  }, loadSeasons)));
  $("#new-singles").onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    act(async () => {
      await rpc("admin_save_singles_season", { p_id: null, p_name: f.get("name"), p_starts_on: f.get("start"), p_ends_on: f.get("end") });
      toast("Season added");
    }, loadSeasons);
  };

  // doubles
  $("#run-tick").onclick = () => act(async () => toast("Tick ran: " + JSON.stringify(await rpc("admin_run_season_tick"))), loadSeasons);
  const nf = $("#new-doubles");
  nf.starts.onchange = () => {
    const s = nf.starts.value; if (!s) return;
    nf.opens.value = addDays(s, -30); nf.closes.value = s; nf.late.value = addDays(s, 7); nf.ends.value = addMonths(s, 4);
  };
  nf.onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(nf);
    const regions = String(f.get("regions")).split(",").map((x) => x.trim()).filter(Boolean);
    act(async () => {
      if (!confirm(`Create "${f.get("name")}" for ${regions.join(", ")}?`)) return;
      await rpc("admin_create_doubles_season", {
        p_name: f.get("name"), p_bracket: "adult", p_registration_opens_on: f.get("opens"),
        p_registration_closes_on: f.get("closes"), p_late_registration_ends_on: f.get("late"),
        p_starts_on: f.get("starts"), p_ends_on: f.get("ends"), p_regions: regions, p_managed: f.get("managed") === "on" });
      toast("Season created");
    }, loadSeasons);
  };
  el.querySelectorAll("[data-state]").forEach((sel) => (sel.onchange = () => act(async () => {
    if (!confirm(`Move this season to "${sel.value.replaceAll("_", " ")}"?`)) return;
    await rpc("admin_set_season_state", { p_season: sel.dataset.state, p_state: sel.value });
    toast("Season moved to " + sel.value.replaceAll("_", " "));
  }, loadSeasons)));
  el.querySelectorAll("[data-managed]").forEach((cb) => (cb.onchange = () => act(async () => {
    await rpc("admin_set_season_managed", { p_season: cb.dataset.managed, p_managed: cb.checked });
    toast(cb.checked ? "Now moves by date automatically" : "Now only moves when you move it");
  }, loadSeasons)));
  el.querySelectorAll("[data-savedates]").forEach((b) => (b.onclick = () => act(async () => {
    const id = b.dataset.savedates, v = (k) => el.querySelector(`[data-d="${id}-${k}"]`).value;
    await rpc("admin_update_doubles_season", { p_id: id, p_name: v("name"), p_registration_opens_on: v("opens"),
      p_registration_closes_on: v("closes"), p_late_registration_ends_on: v("late"), p_starts_on: v("starts"), p_ends_on: v("ends") });
    toast("Season updated");
  }, loadSeasons)));
  el.querySelectorAll("[data-addladder]").forEach((b) => (b.onclick = () => act(async () => {
    const region = prompt("Region for the new Men's and Women's ladders (e.g. Atlanta)");
    if (!region) return;
    await rpc("admin_add_ladder", { p_season: b.dataset.addladder, p_region: region });
    toast("Ladders added for " + region);
  }, loadSeasons)));
  el.querySelectorAll("[data-teams]").forEach((b) => (b.onclick = () => loadTeams(b.dataset.teams).catch((e) => toast(e.message, true))));
}

function seasonCard(s) {
  const tone = { active: "good", registration_open: "good", late_registration: "warn", closed: "bad", archived: "" }[s.state] ?? "";
  const d = (k, v) => `<input type="date" value="${v}" data-d="${s.id}-${k}">`;
  return `<div class="card">
    <div class="season-head">
      <div><input value="${esc(s.name)}" data-d="${s.id}-name" style="font-weight:700;font-size:16px;width:auto"> <span class="pill ${tone}">${esc(s.state.replaceAll("_", " "))}</span>
        <div class="muted small" style="margin-top:4px">${esc(s.bracket)} · ${esc(s.ladders)} ladders · ${esc(s.teams)} teams · ${esc(s.open_challenges)} open challenges</div></div>
      <label class="row small" style="flex-direction:row"><input type="checkbox" data-managed="${s.id}" ${s.lifecycle_managed ? "checked" : ""} style="width:auto"> Move by date automatically</label>
    </div>
    <div class="dates">
      <div><b>Registration opens</b>${d("opens", s.registration_opens_on)}</div>
      <div><b>Registration closes</b>${d("closes", s.registration_closes_on)}</div>
      <div><b>Late registration ends</b>${d("late", s.late_registration_ends_on)}</div>
      <div><b>Starts</b>${d("starts", s.starts_on)}</div>
      <div><b>Ends</b>${d("ends", s.ends_on)}</div>
    </div>
    <div class="row">
      <button class="btn" data-savedates="${s.id}">Save name & dates</button>
      <label class="row small" style="flex-direction:row">Stage
        <select data-state="${s.id}" style="width:auto">${STATES.map((x) => `<option value="${x}" ${x === s.state ? "selected" : ""}>${x.replaceAll("_", " ")}</option>`).join("")}</select></label>
      <button class="btn" data-addladder="${s.id}">Add a region</button>
      <button class="btn" data-teams="${s.id}">Teams</button>
    </div>
    <div id="teams-${s.id}"></div>
  </div>`;
}

async function loadTeams(seasonId) {
  const box = $("#teams-" + seasonId);
  box.innerHTML = `<p class="muted">Loading teams…</p>`;
  const teams = await rpc("admin_doubles_teams", { p_season: seasonId });
  const states = ["pending", "confirmed", "withdrawn", "disqualified", "dissolved"];
  box.innerHTML = teams.length ? `<table style="margin-top:10px"><tr><th>Team</th><th>Ladder</th><th>Roster</th><th>State</th><th></th></tr>${teams.map((t) => `<tr>
      <td><input value="${esc(t.name ?? "")}" data-tname="${t.id}" placeholder="Unnamed"></td>
      <td>${esc(t.ladder)}</td>
      <td>${t.roster.map((m) => `<div>${esc(m.name)} <span class="muted small">${esc(m.role)} · ${esc(m.status)}</span> <button class="link small" data-rm="${m.member_id}" data-rmname="${esc(m.name)}">remove</button></div>`).join("")}</td>
      <td><select data-tstate="${t.id}" style="width:auto">${states.map((x) => `<option ${x === t.state ? "selected" : ""}>${x}</option>`).join("")}</select></td>
      <td><button class="btn" data-tsave="${t.id}">Save</button></td></tr>`).join("")}</table>` : `<p class="muted">No teams in this season.</p>`;
  box.querySelectorAll("[data-tsave]").forEach((b) => (b.onclick = () => act(async () => {
    const id = b.dataset.tsave;
    await rpc("admin_update_team", { p_id: id, p_name: box.querySelector(`[data-tname="${id}"]`).value, p_state: box.querySelector(`[data-tstate="${id}"]`).value });
    toast("Team saved");
  }, () => loadTeams(seasonId))));
  box.querySelectorAll("[data-rm]").forEach((b) => (b.onclick = () => act(async () => {
    if (!confirm(`Remove ${b.dataset.rmname} from this team? The roster lock doesn't apply to admins.`)) return;
    await rpc("admin_remove_team_member", { p_member: b.dataset.rm });
    toast("Removed");
  }, () => loadTeams(seasonId))));
}

// Run an action, report errors, then reload the section it belongs to.
async function act(fn, reload) {
  try { await fn(); } catch (e) { toast(e.message, true); }
  if (reload) reload().catch(() => {});
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
            .map((r) => `<tr class="click" data-player="${r.id}"><td>${esc(r.display_name)} ${r.minor ? '<span class="pill warn">U18</span>' : ""}${r.test_account ? ' <span class="pill">test</span>' : ""}${r.hidden ? ' <span class="pill">hidden</span>' : ""}</td><td>${esc(r.username ?? "")}</td><td>${esc(r.email)}</td><td>${esc(r.city ?? "")}</td><td>${r.ntrp ? "NTRP " + esc(r.ntrp) : r.tier ? "Tier " + esc(r.tier) : r.managing ? "Manager" : "—"}</td><td>${day(r.joined_at)}</td><td>${when(r.last_sign_in_at)}</td></tr>`)
            .join("")}</table></div>`
        : `<p class="muted">No players match.</p>`;
      document.querySelectorAll("[data-player]").forEach((tr) => (tr.onclick = () => loadPlayer(tr.dataset.player).catch((e) => toast(e.message, true))));
    } catch (err) { toast(err.message, true); }
  }, 250);
});

async function loadPlayer(id) {
  const el = $("#player-detail");
  el.innerHTML = `<p class="muted">Loading…</p>`;
  const [d, flags] = await Promise.all([rpc("admin_player", { p_id: id }), rpc("admin_player_flags", { p_id: id })]);
  const p = d.profile;
  const sus = flags.suspension;
  el.innerHTML = `
    <div class="card">
      <div class="season-head">
        <div><b style="font-size:18px">${esc(p.display_name)}</b> ${p.minor ? '<span class="pill warn">Under 18</span>' : '<span class="pill">Adult</span>'}
          ${sus ? '<span class="pill bad">Suspended</span>' : ""}${flags.is_admin ? ' <span class="pill good">Admin</span>' : ""}
          <div class="muted small">${[p.username ? "@" + esc(p.username) : "", esc(p.email), esc(p.city ?? "")].filter(Boolean).join(" · ")}</div></div>
        <div class="row">
          ${sus ? `<button class="btn" id="unsuspend">Lift suspension</button>` : `<button class="btn danger" id="suspend">Suspend</button>`}
          <button class="btn" id="toggle-admin">${flags.is_admin ? "Remove admin" : "Make admin"}</button>
        </div>
      </div>
      ${sus ? `<p class="small" style="color:var(--bad)">Suspended ${when(sus.created_at)}${sus.reason ? " — " + esc(sus.reason) : ""}. They can't sign in and nobody can see them.</p>` : ""}
      <div class="dates">
        <div><b>Record</b>${esc(d.record.wins)}–${esc(d.record.losses)}</div>
        <div><b>Last ranked match</b>${day(p.last_ranked_match_at)}</div>
        <div><b>Joined</b>${day(p.joined_at)}</div>
        <div><b>Last sign-in</b>${when(p.last_sign_in_at)}</div>
        <div><b>Push</b>${p.has_push ? "On" : "Off"}</div>
        <div><b>Blocked by</b>${esc(d.blocked_by)} player(s)</div>
        <div><b>Family</b>${d.family ? esc(d.family.role) + " · " + esc(d.family.subscription_status) : "—"}</div>
      </div>
    </div>
    <h2>Edit</h2>
    <form class="card" id="edit-player">
      <div class="grid2">
        <label>Name<input name="display_name" value="${esc(p.display_name)}"></label>
        <label>City<input name="city" value="${esc(p.city ?? "")}"></label>
        <label>Ladder<select name="gender">${["Mens", "Womens", "Boys", "Girls"].map((g) => `<option ${g === p.gender ? "selected" : ""}>${g}</option>`).join("")}</select></label>
        <label>Birthday<input name="date_of_birth" type="date" value="${p.date_of_birth ?? ""}"></label>
        <label>Level type<select name="level_type"><option value="ntrp" ${p.ntrp ? "selected" : ""}>Adult (NTRP)</option><option value="tier" ${p.tier ? "selected" : ""}>Junior (tier)</option></select></label>
        <label>NTRP<select name="ntrp">${["", "2.0", "2.5", "3.0", "3.5", "4.0", "4.5", "5.0"].map((x) => `<option ${p.ntrp && Number(p.ntrp) === Number(x) ? "selected" : ""}>${x}</option>`).join("")}</select></label>
        <label>Tier (1–6)<select name="tier">${["", 1, 2, 3, 4, 5, 6].map((x) => `<option ${p.tier === x ? "selected" : ""}>${x}</option>`).join("")}</select></label>
        <label>Rating<input name="rating" type="number" value="${esc(p.rating)}"></label>
        <label>No-shows<input name="no_show_count" type="number" min="0" value="${esc(p.no_show_count ?? 0)}"></label>
        <label class="row" style="flex-direction:row;align-items:center;margin-top:22px"><input type="checkbox" name="is_hidden" ${p.hidden ? "checked" : ""} style="width:auto"> Hidden from other players</label>
      </div>
      <button class="primary" type="submit" style="margin-top:10px">Save changes</button>
    </form>
    <h2>Recent challenges</h2><div class="card">${table(d.recent_challenges, ["opponent", "status", "challenge_type", "scheduled_for", "created_at"])}</div>
    <h2>Reports against them</h2><div class="card">${table(d.reports_against, ["reporter", "reason", "note", "created_at", "resolved"])}</div>
    <h2>Doubles</h2><div class="card">${table(d.doubles_teams, ["name", "state", "member_status"])}</div>`;

  const reload = () => loadPlayer(id);
  $("#edit-player").onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const patch = {
      display_name: f.get("display_name"), city: f.get("city"), gender: f.get("gender"),
      date_of_birth: f.get("date_of_birth") || null, rating: Number(f.get("rating")),
      no_show_count: Number(f.get("no_show_count")), is_hidden: f.get("is_hidden") === "on",
    };
    if (f.get("level_type") === "ntrp") { if (!f.get("ntrp")) return toast("Pick an NTRP level", true); patch.ntrp = Number(f.get("ntrp")); }
    else { if (!f.get("tier")) return toast("Pick a tier", true); patch.tier = Number(f.get("tier")); }
    act(async () => { await rpc("admin_update_player", { p_id: id, p_patch: patch }); toast("Saved"); }, reload);
  };
  if ($("#suspend")) $("#suspend").onclick = () => act(async () => {
    const reason = prompt(`Suspend ${p.display_name}? They'll be signed out, can't sign back in, and will be hidden. Reason (optional):`);
    if (reason === null) return;
    await rpc("admin_suspend_player", { p_id: id, p_reason: reason });
    toast("Suspended");
  }, reload);
  if ($("#unsuspend")) $("#unsuspend").onclick = () => act(async () => {
    if (!confirm(`Lift ${p.display_name}'s suspension?`)) return;
    await rpc("admin_unsuspend_player", { p_id: id });
    toast("Suspension lifted");
  }, reload);
  $("#toggle-admin").onclick = () => act(async () => {
    const on = !flags.is_admin;
    if (!confirm(on ? `Give ${p.display_name} full admin access?` : `Remove ${p.display_name}'s admin access?`)) return;
    await rpc("admin_set_admin", { p_id: id, p_on: on });
    toast(on ? "Admin access granted" : "Admin access removed");
  }, reload);
}

// ---------------------------------------------------------------- matches

async function loadMatches() {
  const el = $("#tab-matches");
  el.innerHTML = `<p class="muted">Loading…</p>`;
  const [challenges, matches, dmatches, flex] = await Promise.all([
    rpc("admin_singles_challenges"), rpc("admin_singles_matches"), rpc("admin_doubles_matches"), rpc("admin_flex_requests")]);
  const open = (challenges ?? []).filter((c) => !["completed", "declined", "cancelled"].includes(c.status));
  el.innerHTML = `
    <h2>Open singles challenges</h2>
    <div class="card">${open.length ? `<table><tr><th>From</th><th>To</th><th>Status</th><th>When</th><th>Reported score</th><th></th></tr>${open.map((c) => `<tr>
      <td>${esc(c.from_player)}</td><td>${esc(c.to_player ?? "open")}</td>
      <td>${esc(c.status)}${c.disputed ? ' <span class="pill bad">disputed</span>' : ""}</td><td>${when(c.scheduled_for)}</td>
      <td>${c.proposed_score ? esc(c.proposed_score) + " · " + esc(c.proposed_winner) + " won" : "—"}</td>
      <td class="row">${c.proposed_score ? `<button class="btn" data-accept="${c.id}">Accept score</button>` : ""}<button class="btn danger" data-cancel="${c.id}">Cancel</button></td></tr>`).join("")}</table>` : `<p class="muted">None.</p>`}</div>
    <h2>Singles matches</h2>
    <div class="card">${(matches ?? []).length ? `<table><tr><th>Played</th><th>Players</th><th>Winner</th><th>Score</th><th>Ranked</th><th>Status</th><th></th></tr>${matches.map((m) => `<tr>
      <td>${when(m.played_at)}</td><td>${esc(m.player_1)} vs ${esc(m.player_2)}</td><td>${esc(m.winner ?? "—")}</td><td>${esc(m.score ?? "")}</td>
      <td>${m.is_ranked === false ? "no" : "yes"}</td><td>${esc(m.status)}</td>
      <td>${m.status !== "void" ? `<button class="btn danger" data-void="${m.id}">Void</button>` : ""}</td></tr>`).join("")}</table>` : `<p class="muted">None.</p>`}
      <p class="muted small">Voiding takes a match off records and standings. Rating changes it already caused stay, because later matches were rated on top of them.</p></div>
    <h2>Doubles matches</h2>
    <div class="card">${(dmatches ?? []).length ? `<table><tr><th>When</th><th>Teams</th><th>Winner</th><th>Score</th><th>Status</th><th></th></tr>${dmatches.map((m) => `<tr>
      <td>${when(m.created_at)}</td><td>${esc(m.challenger)} vs ${esc(m.challenged)}</td><td>${esc(m.winner ?? "—")}</td><td>${esc(m.score ?? m.default_reason ?? "")}</td><td>${esc(m.status)}</td>
      <td>${m.status !== "void" ? `<button class="btn danger" data-dvoid="${m.id}">Void</button>` : ""}</td></tr>`).join("")}</table>` : `<p class="muted">None.</p>`}</div>
    <h2>Flex requests</h2>
    <div class="card">${(flex ?? []).length ? `<table><tr><th>When</th><th>Posted by</th><th>Where</th><th>State</th><th></th></tr>${flex.map((r) => `<tr>
      <td>${when(r.scheduled_for)}</td><td>${esc(r.posted_by)}</td><td>${esc(r.location_name ?? r.city ?? "")}</td><td>${esc(r.state)}${r.is_mixed ? " · mixed" : ""}</td>
      <td>${r.state === "open" ? `<button class="btn danger" data-fcancel="${r.id}">Cancel</button>` : ""}</td></tr>`).join("")}</table>` : `<p class="muted">None.</p>`}</div>`;

  const ask = (q) => { const r = prompt(q); return r === null ? null : r; };
  el.querySelectorAll("[data-accept]").forEach((b) => (b.onclick = () => act(async () => {
    if (!confirm("Accept the reported score? Ratings and the ladder update as if both players confirmed.")) return;
    await rpc("admin_accept_proposed_score", { p_id: b.dataset.accept }); toast("Score accepted");
  }, loadMatches)));
  el.querySelectorAll("[data-cancel]").forEach((b) => (b.onclick = () => act(async () => {
    const reason = ask("Cancel this challenge? Reason (optional):"); if (reason === null) return;
    await rpc("admin_cancel_challenge", { p_id: b.dataset.cancel, p_reason: reason }); toast("Challenge cancelled");
  }, loadMatches)));
  el.querySelectorAll("[data-void]").forEach((b) => (b.onclick = () => act(async () => {
    const reason = ask("Void this match? Reason (optional):"); if (reason === null) return;
    await rpc("admin_void_match", { p_id: b.dataset.void, p_reason: reason }); toast("Match voided");
  }, loadMatches)));
  el.querySelectorAll("[data-dvoid]").forEach((b) => (b.onclick = () => act(async () => {
    const reason = ask("Void this doubles match? It comes off the standings. Reason (optional):"); if (reason === null) return;
    await rpc("admin_void_doubles_match", { p_id: b.dataset.dvoid, p_reason: reason }); toast("Match voided");
  }, loadMatches)));
  el.querySelectorAll("[data-fcancel]").forEach((b) => (b.onclick = () => act(async () => {
    if (!confirm("Cancel this Flex request?")) return;
    await rpc("admin_cancel_flex", { p_id: b.dataset.fcancel }); toast("Flex request cancelled");
  }, loadMatches)));
}

// ---------------------------------------------------------------- announce

async function loadAnnounce() {
  const el = $("#tab-announce");
  el.innerHTML = `
    <h2>Send an announcement</h2>
    <form class="card" id="announce">
      <div class="grid2">
        <label>Who gets it<select name="audience">
          <option value="everyone">Everyone</option><option value="adults">Adult players</option>
          <option value="juniors">Junior players</option><option value="families">Family managers (parents)</option>
          <option value="city">Players in a city</option><option value="player">One player</option></select></label>
        <label id="a-city" class="hidden">City<input name="city" placeholder="Charlotte"></label>
        <label id="a-player" class="hidden">Player (search)<input name="playerq" placeholder="Name or email" autocomplete="off"><select name="player"></select></label>
      </div>
      <label style="margin-top:10px">Title <span class="muted small" id="t-count"></span><input name="title" maxlength="60" required></label>
      <label style="margin-top:10px">Message <span class="muted small" id="b-count"></span><textarea name="body" rows="3" maxlength="300" required></textarea></label>
      <p class="muted small">Arrives as a push notification and in the app. Test accounts and suspended players are skipped.</p>
      <div class="row"><button class="btn" type="button" id="a-preview">How many people?</button><span id="a-n" class="muted"></span>
        <button class="primary" type="submit">Send</button></div>
    </form>`;
  const f = $("#announce");
  const sync = () => {
    $("#a-city").classList.toggle("hidden", f.audience.value !== "city");
    $("#a-player").classList.toggle("hidden", f.audience.value !== "player");
    $("#t-count").textContent = `${f.title.value.length}/60`; $("#b-count").textContent = `${f.body.value.length}/300`;
  };
  f.audience.onchange = sync; f.title.oninput = sync; f.body.oninput = sync; sync();
  let t;
  f.playerq.oninput = () => { clearTimeout(t); t = setTimeout(async () => {
    const rows = f.playerq.value.trim().length < 2 ? [] : await rpc("admin_find_players", { p_q: f.playerq.value.trim() });
    f.player.innerHTML = rows.map((r) => `<option value="${r.id}">${esc(r.display_name)} — ${esc(r.email)}</option>`).join("");
  }, 250); };
  const args = (send) => ({ p_audience: f.audience.value, p_city: f.city.value || null, p_player: f.player.value || null,
                            p_title: f.title.value, p_body: f.body.value, p_send: send });
  $("#a-preview").onclick = async () => {
    try { $("#a-n").textContent = `Goes to ${await rpc("admin_announce", args(false))} people`; } catch (e) { toast(e.message, true); }
  };
  f.onsubmit = async (e) => {
    e.preventDefault();
    try {
      const n = await rpc("admin_announce", args(false));
      if (!n) return toast("Nobody matches that audience.", true);
      if (!confirm(`Send "${f.title.value}" to ${n} people now? This can't be unsent.`)) return;
      const sent = await rpc("admin_announce", args(true));
      toast(`Sent to ${sent} people`);
      f.reset(); sync(); $("#a-n").textContent = "";
    } catch (err) { toast(err.message, true); }
  };
}

// ---------------------------------------------------------------- activity

async function loadActivity() {
  const el = $("#tab-activity");
  el.innerHTML = `<p class="muted">Loading…</p>`;
  const rows = await rpc("admin_activity");
  el.innerHTML = `<h2>Admin activity</h2><div class="card">${table(rows, ["created_at", "admin", "action", "target", "detail"])}</div>`;
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
