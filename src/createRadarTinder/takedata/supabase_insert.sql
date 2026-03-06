-- Supabase INSERT statement for traffic cameras
-- Generated: 2026-03-06T10:27:49.769Z
-- Total records: 16

INSERT INTO traffic_cameras (
  source, source_id, latitude, longitude, camera_type, 
  speed_limit, road_name, direction, country, verified
) VALUES
  ('dc_gov', 'dc_speed_8084', 38.9658392064136, -77.07603228940091, 'speed_fixed', 35, 'Connecticut Avenue', 'N', 'US', true),
  ('dc_gov', 'dc_speed_8085', 38.96583517216789, -77.07603005809914, 'speed_fixed', 35, 'Connecticut Avenue', 'S', 'US', true),
  ('dc_gov', 'dc_speed_8091', 38.959453019176884, -77.07234049472059, 'speed_fixed', 35, 'Connecticut Avenue', 'N', 'US', true),
  ('dc_gov', 'dc_speed_8090', 38.959449480581014, -77.07233782589387, 'speed_fixed', 35, 'Connecticut Avenue', 'S', 'US', true),
  ('dc_gov', 'dc_speed_8044', 38.95553582330246, -77.07010188250685, 'speed_fixed', 35, 'Connecticut Avenue', 'N', 'US', true),
  ('dc_gov', 'dc_speed_8045', 38.95551916310563, -77.07009337475819, 'speed_fixed', 35, 'Connecticut Avenue', 'S', 'US', true),
  ('dc_gov', 'dc_speed_8086', 38.94275788812711, -77.06262093193715, 'speed_fixed', 30, 'Connecticut Avenue', 'N', 'US', true),
  ('dc_gov', 'dc_speed_8087', 38.94275138637489, -77.06261676205085, 'speed_fixed', 30, 'Connecticut Avenue', 'S', 'US', true),
  ('dc_gov', 'dc_speed_8081', 38.937795439295385, -77.05979050598398, 'speed_fixed', 30, 'Connecticut Avenue', 'N', 'US', true),
  ('dc_gov', 'dc_speed_8080', 38.93778848729856, -77.05978579415614, 'speed_fixed', 30, 'Connecticut Avenue', 'S', 'US', true),
  ('dc_gov', 'dc_speed_8082', 38.935052858080255, -76.96362745728423, 'speed_fixed', 35, 'Rhode Island Avenue', 'E', 'US', true),
  ('dc_gov', 'dc_speed_8083', 38.9350482483025, -76.96363540646723, 'speed_fixed', 35, 'Rhode Island Avenue', 'W', 'US', true),
  ('dc_gov', 'dc_speed_8075', 38.93126900937918, -76.97100535145623, 'speed_fixed', 35, 'Rhode Island Avenue', 'E', 'US', true),
  ('dc_gov', 'dc_speed_8074', 38.93124602990341, -76.97104459690816, 'speed_fixed', 35, 'Rhode Island Avenue', 'W', 'US', true),
  ('dc_gov', 'dc_speed_8057', 38.92563262220941, -76.98255624315532, 'speed_fixed', 35, 'Rhode Island Avenue', 'E', 'US', true),
  ('dc_gov', 'dc_speed_8056', 38.9256287765405, -76.98256216018564, 'speed_fixed', 35, 'Rhode Island Avenue', 'W', 'US', true)
ON CONFLICT (source_id) DO UPDATE SET
  latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude,
  updated_at = NOW();
