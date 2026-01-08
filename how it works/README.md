Radar Tinder: How It Works

Overview
Radar Tinder connects drivers through shared radar reports and live rankings. The app combines:
- Real-time community reporting (Supabase)
- Turn-by-turn navigation (Google Maps)
- On-device AI diagnostics (ONNX Runtime)

Identity & Profiles
- Users sign up with email and choose a unique username.
- Display name defaults to username (can be changed later).
- Avatar image is user-controlled (URL field or storage upload) and shown on the leaderboard.
- Login supports email or username. When a username is entered, the app resolves it to the stored email via RPC.

Leaderboard & Points
- Leaderboard reads from the profiles table (points + rank + avatar).
- Realtime updates are pushed via Supabase Realtime channels.
- A points ledger tracks every reward event (report, confirmation, or bonus).
- Rank is derived from points on the server to keep the leaderboard consistent.

Community Reporting Flow
1) Driver reports a radar (radar_reports).
2) A trigger rewards the reporter and writes to points_ledger.
3) Other drivers confirm the report (report_confirmations).
4) Confirmations reward the confirmer and optionally the reporter.
5) Verified reports can be promoted into radars for navigation alerts.

Navigation Flow
- The app requests a route from Google Directions.
- Step-by-step instructions are shown in Driving Mode.
- Nearby reports are merged from Supabase + OSM Overpass.

AI Diagnostics Flow
- Images are resized on device.
- ONNX models run locally (no backend required).
- Results are mapped to readable warnings and recommendations.

Supabase Schema Expectations (summary)
- profiles: username (unique), display_name, avatar_url, points, rank, xp, level, stats (jsonb)
- radars: aggregated radar locations
- radar_reports: raw user reports (location + type)
- report_confirmations: verification events
- points_ledger: immutable point events

See diagram.mmd for the full Mermaid diagram.
