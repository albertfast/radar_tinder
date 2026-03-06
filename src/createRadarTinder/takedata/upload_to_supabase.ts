/**
 * Upload `external_radars`-ready government camera rows to Supabase.
 *
 * Expected input is the JSON emitted by `process_geojson.ts`:
 *   src/createRadarTinder/takedata/output/government_cameras_external_radars.json
 *
 * Required env vars:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY)
 *
 * Usage:
 *   bun run src/createRadarTinder/takedata/upload_to_supabase.ts
 *   bun run src/createRadarTinder/takedata/upload_to_supabase.ts path/to/file.json
 */

import * as fs from 'fs';
import * as path from 'path';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
const BATCH_SIZE = 250;
const SCRIPT_DIR = path.resolve(path.dirname(process.argv[1] || '.'));
const DEFAULT_INPUT_FILE = path.join(SCRIPT_DIR, 'output', 'government_cameras_external_radars.json');

type UploadRow = {
  source: string;
  source_id: string;
  type: string;
  latitude: number;
  longitude: number;
  confidence: number;
  verified: boolean;
  metadata: Record<string, unknown>;
};

const requireConfig = () => {
  if (!SUPABASE_URL) {
    throw new Error('SUPABASE_URL is required.');
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_KEY is required.');
  }
};

const readRows = (inputPath: string): UploadRow[] => {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  const parsed = JSON.parse(fs.readFileSync(inputPath, 'utf-8')) as UploadRow[];
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected array payload in ${inputPath}`);
  }

  return parsed;
};

const toPostgrestPayload = (rows: UploadRow[]) => {
  const now = new Date().toISOString();
  return rows.map((row) => ({
    source: row.source,
    source_id: row.source_id,
    type: row.type,
    location: `SRID=4326;POINT(${row.longitude} ${row.latitude})`,
    confidence: row.confidence,
    verified: row.verified,
    last_seen_at: now,
    updated_at: now,
    metadata: row.metadata,
  }));
};

const uploadBatch = async (rows: UploadRow[]) => {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/external_radars?on_conflict=source,source_id`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(toPostgrestPayload(rows)),
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${await response.text()}`);
  }
};

const main = async () => {
  requireConfig();

  const inputPath = path.resolve(process.cwd(), process.argv[2] || DEFAULT_INPUT_FILE);
  const rows = readRows(inputPath);

  if (rows.length === 0) {
    console.log(`No rows to upload from ${inputPath}`);
    return;
  }

  console.log('======================================================================');
  console.log('☁️  GOVERNMENT CAMERA UPLOAD');
  console.log('======================================================================');
  console.log(`Input: ${inputPath}`);
  console.log(`Rows: ${rows.length}`);

  let uploaded = 0;
  for (let index = 0; index < rows.length; index += BATCH_SIZE) {
    const batch = rows.slice(index, index + BATCH_SIZE);
    await uploadBatch(batch);
    uploaded += batch.length;
    console.log(`Uploaded ${uploaded}/${rows.length}`);
  }

  console.log('Upload complete.');
};

main().catch((error) => {
  console.error(`Upload failed: ${(error as Error).message}`);
  process.exitCode = 1;
});
