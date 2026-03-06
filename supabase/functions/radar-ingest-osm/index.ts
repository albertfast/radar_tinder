import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type Bbox = {
  min_lat: number;
  min_lng: number;
  max_lat: number;
  max_lng: number;
};

type TileRow = Bbox & {
  source: string;
  tile_key: string;
  zoom: number;
  x: number;
  y: number;
  country_code: string;
  priority: number;
  status: string;
  next_run_at: string;
  last_success_at?: string | null;
  last_error_at?: string | null;
  failure_count: number;
  metadata: Record<string, unknown> | null;
};

type OverpassElement = {
  id: number | string;
  type: string;
  lat?: number;
  lon?: number;
  center?: {
    lat?: number;
    lon?: number;
    lng?: number;
  };
  tags?: Record<string, string>;
};

type ExternalRadarUpsert = {
  source: string;
  source_id: string;
  type: 'speed_camera' | 'red_light';
  location: string;
  confidence: number;
  verified: boolean;
  last_seen_at: string;
  updated_at: string;
  metadata: Record<string, unknown>;
};

type TileProcessResult = {
  tileKey: string;
  fetchedCount: number;
  upsertedCount: number;
  droppedCount: number;
  durationMs: number;
  usedMirror?: string;
  error?: string;
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const INGEST_FUNCTION_SECRET = Deno.env.get('INGEST_FUNCTION_SECRET') || '';
const INGEST_COUNTRY_CODE = (Deno.env.get('INGEST_COUNTRY_CODE') || 'US').trim().toUpperCase();
const INGEST_TILE_BATCH_SIZE = Math.max(
  1,
  Math.min(4, Number(Deno.env.get('INGEST_TILE_BATCH_SIZE') || '4') || 4)
);
const DEFAULT_OVERPASS_BASE_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const OVERPASS_BASE_URLS = (Deno.env.get('OVERPASS_BASE_URLS') || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const OVERPASS_ENDPOINTS =
  OVERPASS_BASE_URLS.length > 0 ? OVERPASS_BASE_URLS : DEFAULT_OVERPASS_BASE_URLS;
const FETCH_TIMEOUT_MS = 25000;
const SUCCESS_RETRY_DAYS = 14;
const ERROR_BACKOFF_HOURS = [1, 6, 24];

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const withTimeout = async (input: string, init?: RequestInit) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(input, { ...(init || {}), signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
};

const isAuthorized = (request: Request) => {
  if (!INGEST_FUNCTION_SECRET) return true;
  const authHeader = request.headers.get('authorization') || '';
  const directSecret = request.headers.get('x-ingest-secret') || '';
  const expectedBearer = INGEST_FUNCTION_SECRET.startsWith('Bearer ')
    ? INGEST_FUNCTION_SECRET
    : `Bearer ${INGEST_FUNCTION_SECRET}`;
  return (
    authHeader === INGEST_FUNCTION_SECRET ||
    authHeader === expectedBearer ||
    directSecret === INGEST_FUNCTION_SECRET
  );
};

const parseBbox = (input: unknown): Bbox | null => {
  if (!input || typeof input !== 'object') return null;
  const value = input as Record<string, unknown>;
  const minLat = Number(value.min_lat ?? value.minLat);
  const minLng = Number(value.min_lng ?? value.minLng);
  const maxLat = Number(value.max_lat ?? value.maxLat);
  const maxLng = Number(value.max_lng ?? value.maxLng);
  if (
    !Number.isFinite(minLat) ||
    !Number.isFinite(minLng) ||
    !Number.isFinite(maxLat) ||
    !Number.isFinite(maxLng) ||
    minLat >= maxLat ||
    minLng >= maxLng
  ) {
    return null;
  }
  return {
    min_lat: minLat,
    min_lng: minLng,
    max_lat: maxLat,
    max_lng: maxLng,
  };
};

const normalizePoint = (element: OverpassElement) => {
  const latitude = Number(element.lat ?? element.center?.lat);
  const longitude = Number(element.lon ?? element.center?.lon ?? element.center?.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  return { latitude, longitude };
};

const parseSpeedLimit = (tags: Record<string, string>) => {
  const raw = String(tags.maxspeed || '').trim().toLowerCase();
  if (!raw) return null;
  const match = raw.match(/(\d{2,3})/);
  if (!match?.[1]) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
};

const normalizeOsmType = (tags: Record<string, string>): 'speed_camera' | 'red_light' | null => {
  const highway = String(tags.highway || '').toLowerCase();
  const enforcement = String(tags.enforcement || '').toLowerCase();
  const cameraType = String(tags['camera:type'] || '').toLowerCase();

  if (
    enforcement === 'traffic_signals' ||
    cameraType.includes('red') ||
    cameraType.includes('traffic_signals')
  ) {
    return 'red_light';
  }

  if (
    highway === 'speed_camera' ||
    enforcement === 'maxspeed' ||
    enforcement === 'speed' ||
    cameraType.includes('speed')
  ) {
    return 'speed_camera';
  }

  return null;
};

const buildOverpassQuery = (bbox: Bbox) => `
[out:json][timeout:60];
(
  node["highway"="speed_camera"](${bbox.min_lat},${bbox.min_lng},${bbox.max_lat},${bbox.max_lng});
  node["enforcement"="maxspeed"](${bbox.min_lat},${bbox.min_lng},${bbox.max_lat},${bbox.max_lng});
  node["enforcement"="speed"](${bbox.min_lat},${bbox.min_lng},${bbox.max_lat},${bbox.max_lng});
  node["enforcement"="traffic_signals"](${bbox.min_lat},${bbox.min_lng},${bbox.max_lat},${bbox.max_lng});
  node["highway"="traffic_signals"]["camera:type"](${bbox.min_lat},${bbox.min_lng},${bbox.max_lat},${bbox.max_lng});
  way["highway"="speed_camera"](${bbox.min_lat},${bbox.min_lng},${bbox.max_lat},${bbox.max_lng});
  way["enforcement"="maxspeed"](${bbox.min_lat},${bbox.min_lng},${bbox.max_lat},${bbox.max_lng});
  way["enforcement"="speed"](${bbox.min_lat},${bbox.min_lng},${bbox.max_lat},${bbox.max_lng});
  way["enforcement"="traffic_signals"](${bbox.min_lat},${bbox.min_lng},${bbox.max_lat},${bbox.max_lng});
  relation["enforcement"="maxspeed"](${bbox.min_lat},${bbox.min_lng},${bbox.max_lat},${bbox.max_lng});
  relation["enforcement"="speed"](${bbox.min_lat},${bbox.min_lng},${bbox.max_lat},${bbox.max_lng});
);
out center;
`;

const fetchOverpassElements = async (bbox: Bbox) => {
  const query = buildOverpassQuery(bbox);
  let lastError = 'unknown_overpass_error';

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await withTimeout(endpoint, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'User-Agent': 'RadarTinder-Ingest/1.0',
        },
        body: `data=${encodeURIComponent(query)}`,
      });

      if (!response.ok) {
        lastError = `http_${response.status}`;
        continue;
      }

      const data = await response.json();
      const elements = Array.isArray(data?.elements) ? (data.elements as OverpassElement[]) : [];
      return { elements, endpoint };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  throw new Error(lastError);
};

const normalizeElements = (
  elements: OverpassElement[],
  tile: Pick<TileRow, 'tile_key' | 'country_code'>,
  seenAtIso: string
) => {
  const normalized = new Map<string, ExternalRadarUpsert>();
  let droppedCount = 0;

  for (const element of elements) {
    const point = normalizePoint(element);
    const tags = element.tags || {};
    const normalizedType = normalizeOsmType(tags);
    if (!point || !normalizedType) {
      droppedCount += 1;
      continue;
    }

    const sourceId = `${String(element.type || 'node').toLowerCase()}:${String(element.id)}`;
    normalized.set(sourceId, {
      source: 'osm',
      source_id: sourceId,
      type: normalizedType,
      location: `POINT(${point.longitude} ${point.latitude})`,
      confidence: 0.85,
      verified: true,
      last_seen_at: seenAtIso,
      updated_at: seenAtIso,
      metadata: {
        country_code: tile.country_code,
        tile_key: tile.tile_key,
        road_name: tags.name || tags.ref || null,
        speed_limit: parseSpeedLimit(tags),
        raw_tags: tags,
        osm_element_type: String(element.type || 'node').toLowerCase(),
        osm_element_id: String(element.id),
      },
    });
  }

  return {
    radars: Array.from(normalized.values()),
    droppedCount: droppedCount + Math.max(0, elements.length - normalized.size),
  };
};

const scheduleAfterHours = (failureCount: number) => {
  const nextIndex = Math.max(0, Math.min(ERROR_BACKOFF_HOURS.length - 1, failureCount - 1));
  return new Date(Date.now() + ERROR_BACKOFF_HOURS[nextIndex] * 60 * 60 * 1000).toISOString();
};

const scheduleAfterSuccess = () =>
  new Date(Date.now() + SUCCESS_RETRY_DAYS * 24 * 60 * 60 * 1000).toISOString();

const processTile = async (
  supabase: any,
  tile: TileRow,
  mode: string
): Promise<TileProcessResult> => {
  const startedAt = Date.now();
  const nowIso = new Date().toISOString();
  try {
    const { elements, endpoint } = await fetchOverpassElements(tile);
    const normalized = normalizeElements(elements, tile, nowIso);

    if (normalized.radars.length > 0) {
      const { error } = await supabase.from('external_radars').upsert(normalized.radars, {
        onConflict: 'source,source_id',
        ignoreDuplicates: false,
      });
      if (error) throw error;
    }

    if (!tile.tile_key.startsWith('manual:')) {
      const metadata = {
        ...(tile.metadata || {}),
        last_run_mode: mode,
        last_run_at: nowIso,
        last_run_fetched_count: elements.length,
        last_run_upserted_count: normalized.radars.length,
        last_run_dropped_count: normalized.droppedCount,
        last_run_endpoint: endpoint,
      };
      const { error } = await supabase
        .from('external_ingest_tiles')
        .update({
          status: 'success',
          next_run_at: scheduleAfterSuccess(),
          last_success_at: nowIso,
          failure_count: 0,
          updated_at: nowIso,
          metadata,
        })
        .eq('source', tile.source)
        .eq('tile_key', tile.tile_key);
      if (error) throw error;
    }

    return {
      tileKey: tile.tile_key,
      fetchedCount: elements.length,
      upsertedCount: normalized.radars.length,
      droppedCount: normalized.droppedCount,
      durationMs: Date.now() - startedAt,
      usedMirror: endpoint,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!tile.tile_key.startsWith('manual:')) {
      const failureCount = (Number(tile.failure_count) || 0) + 1;
      const metadata = {
        ...(tile.metadata || {}),
        last_error_message: message,
        last_error_at: nowIso,
        last_run_mode: mode,
      };
      await supabase
        .from('external_ingest_tiles')
        .update({
          status: 'error',
          next_run_at: scheduleAfterHours(failureCount),
          last_error_at: nowIso,
          failure_count: failureCount,
          updated_at: nowIso,
          metadata,
        })
        .eq('source', tile.source)
        .eq('tile_key', tile.tile_key);
    }

    return {
      tileKey: tile.tile_key,
      fetchedCount: 0,
      upsertedCount: 0,
      droppedCount: 0,
      durationMs: Date.now() - startedAt,
      error: message,
    };
  }
};

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'method_not_allowed' });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse(500, { error: 'missing_supabase_env' });
  }

  if (!isAuthorized(request)) {
    return jsonResponse(401, { error: 'unauthorized' });
  }

  const startedAt = Date.now();
  const supabase: any = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const mode = String(body.mode || 'manual').trim().toLowerCase();
  const action = String(body.action || '').trim().toLowerCase();
  const source = String(body.source || 'osm').trim().toLowerCase();
  const countryCode = String(body.country_code || INGEST_COUNTRY_CODE).trim().toUpperCase();
  const tileKey = typeof body.tile_key === 'string' ? body.tile_key.trim() : '';
  const manualBbox = parseBbox(body.bbox);
  const cronExpression = typeof body.cron === 'string' ? body.cron.trim() : '*/10 * * * *';
  const jobName =
    typeof body.job_name === 'string' && body.job_name.trim().length > 0
      ? body.job_name.trim()
      : `radar-ingest-osm-${countryCode.toLowerCase()}`;

  if (source !== 'osm') {
    return jsonResponse(400, { error: 'unsupported_source', source });
  }

  if (action === 'setup_schedule') {
    if (!INGEST_FUNCTION_SECRET) {
      return jsonResponse(400, { error: 'missing_ingest_function_secret' });
    }

    const { data, error } = await supabase.rpc('setup_radar_ingest_osm_schedule', {
      p_function_url: request.url,
      p_ingest_secret: INGEST_FUNCTION_SECRET,
      p_cron: cronExpression,
      p_country_code: countryCode,
      p_job_name: jobName,
    });

    if (error) {
      return jsonResponse(500, {
        error: 'schedule_setup_failed',
        detail: error.message,
      });
    }

    return jsonResponse(200, {
      ok: true,
      action,
      schedule: data ?? null,
    });
  }

  const runScope = tileKey
    ? `manual_tile:${tileKey}`
    : manualBbox
      ? 'manual_bbox'
      : `${mode}:${countryCode}`;
  const { data: runRow, error: runInsertError } = await supabase
    .from('external_ingest_runs')
    .insert([
      {
        source,
        run_scope: runScope,
        status: 'running',
        metadata: {
          mode,
          country_code: countryCode,
          tile_key: tileKey || null,
          requested_bbox: manualBbox,
        },
      },
    ])
    .select('id')
    .single();

  if (runInsertError || !runRow?.id) {
    return jsonResponse(500, {
      error: 'run_insert_failed',
      detail: runInsertError?.message || 'missing_run_id',
    });
  }

  const runId = runRow.id as string;
  let finalStatus = 'success';
  let fetchedCount = 0;
  let upsertedCount = 0;
  let droppedCount = 0;
  const tileResults: TileProcessResult[] = [];

  try {
    let tiles: TileRow[] = [];
    if (tileKey) {
      const { data, error } = await supabase
        .from('external_ingest_tiles')
        .select(
          'source,tile_key,zoom,x,y,min_lat,min_lng,max_lat,max_lng,country_code,priority,status,next_run_at,last_success_at,last_error_at,failure_count,metadata'
        )
        .eq('source', source)
        .eq('tile_key', tileKey)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        throw new Error(`tile_not_found:${tileKey}`);
      }
      tiles = [data as TileRow];
    } else if (manualBbox) {
      tiles = [
        {
          source,
          tile_key: `manual:${Date.now()}`,
          zoom: -1,
          x: -1,
          y: -1,
          min_lat: manualBbox.min_lat,
          min_lng: manualBbox.min_lng,
          max_lat: manualBbox.max_lat,
          max_lng: manualBbox.max_lng,
          country_code: countryCode,
          priority: 0,
          status: 'manual',
          next_run_at: new Date().toISOString(),
          last_success_at: null,
          last_error_at: null,
          failure_count: 0,
          metadata: {
            requested_bbox: manualBbox,
          },
        },
      ];
    } else if (mode === 'schedule') {
      const { data, error } = await supabase.rpc('claim_external_ingest_tiles', {
        p_source: source,
        p_country_code: countryCode,
        p_limit: INGEST_TILE_BATCH_SIZE,
      });
      if (error) throw error;
      tiles = Array.isArray(data) ? (data as TileRow[]) : [];
    } else {
      const { data, error } = await supabase.rpc('claim_external_ingest_tiles', {
        p_source: source,
        p_country_code: countryCode,
        p_limit: 1,
      });
      if (error) throw error;
      tiles = Array.isArray(data) ? (data as TileRow[]) : [];
    }

    for (const tile of tiles) {
      const result = await processTile(supabase, tile, mode);
      tileResults.push(result);
      fetchedCount += result.fetchedCount;
      upsertedCount += result.upsertedCount;
      droppedCount += result.droppedCount;
      if (result.error) {
        finalStatus = finalStatus === 'success' ? 'partial_success' : finalStatus;
      }
    }

    if (tileResults.length === 0) {
      finalStatus = 'success';
    } else if (tileResults.every((tile) => tile.error)) {
      finalStatus = 'error';
    } else if (tileResults.some((tile) => tile.error)) {
      finalStatus = 'partial_success';
    }

    const finishedAt = new Date().toISOString();
    const durationMs = Date.now() - startedAt;
    const errorLog = tileResults
      .filter((tile) => tile.error)
      .map((tile) => `${tile.tileKey}:${tile.error}`)
      .join('\n');

    await supabase
      .from('external_ingest_runs')
      .update({
        status: finalStatus,
        finished_at: finishedAt,
        fetched_count: fetchedCount,
        upserted_count: upsertedCount,
        dropped_count: droppedCount,
        error_log: errorLog || null,
        metadata: {
          mode,
          country_code: countryCode,
          duration_ms: durationMs,
          tile_keys: tileResults.map((tile) => tile.tileKey),
          source_stats: tileResults,
        },
      })
      .eq('id', runId);

    return jsonResponse(200, {
      ok: true,
      run_id: runId,
      status: finalStatus,
      fetched_count: fetchedCount,
      upserted_count: upsertedCount,
      dropped_count: droppedCount,
      tile_results: tileResults,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabase
      .from('external_ingest_runs')
      .update({
        status: 'error',
        finished_at: new Date().toISOString(),
        fetched_count: fetchedCount,
        upserted_count: upsertedCount,
        dropped_count: droppedCount,
        error_log: message,
        metadata: {
          mode,
          country_code: countryCode,
          duration_ms: Date.now() - startedAt,
          tile_keys: tileResults.map((tile) => tile.tileKey),
          source_stats: tileResults,
        },
      })
      .eq('id', runId);

    return jsonResponse(500, {
      error: 'ingest_failed',
      detail: message,
      run_id: runId,
    });
  }
});
