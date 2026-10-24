# Volee Admin

The admin website for Volee. Sign in with a Volee account that's on the admin
list (`app_admins`); everyone else sees nothing.

It's a static page: all data and actions go through `admin_*` database
functions in the Volee project, each of which checks `app_is_admin()` on the
server. The key in `app.js` is the same public key the iOS app ships with.

Sections: Dashboard, Seasons (singles calendar; doubles launch/state/dates/tick),
Players (search + detail), Safety (reports, doubles alerts, sandbagger flags,
kids turning 18, feedback), Settings (switches, ML shadow scoreboard).

Run locally: `python3 -m http.server 8770` and open http://localhost:8770.
