# Volee Admin

The admin website for Volee. Sign in with a Volee account that's on the admin
list (`app_admins`); everyone else sees nothing.

It's a static page: all data and actions go through `admin_*` database
functions in the Volee project, each of which checks `app_is_admin()` on the
server. The key in `app.js` is the same public key the iOS app ships with.

Sections:
- Dashboard: players, sign-ups, activity, play, health.
- Seasons: singles seasons (add/edit/delete future); doubles seasons (create with
  any dates and regions, edit dates, stage, auto-move, add regions, teams: rename,
  change state, remove a player).
- Players: search; edit name/city/ladder/birthday/level/rating/no-shows/hidden;
  suspend (signed out, can't sign in, hidden) or lift; grant/remove admin.
- Matches: open singles challenges (cancel, accept a reported score), singles and
  doubles matches (void), Flex requests (cancel).
- Safety: reports, doubles alerts, sandbagger flags, kids turning 18, feedback.
- Announce: push + in-app message to everyone, adults, juniors, parents, a city or
  one player, with a recipient count first.
- Settings: switches, ML shadow scoreboard.
- Activity: every admin change, who made it and when.

Run locally: `python3 -m http.server 8770` and open http://localhost:8770.
