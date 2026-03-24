import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type RevenueCatEventEnvelope = {
  event?: Record<string, any>;
  [key: string]: any;
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const PRO_ENTITLEMENT = (Deno.env.get('RC_ENTITLEMENT_PRO') || 'pro').trim();
const REMOVE_ADS_ENTITLEMENT = (Deno.env.get('RC_ENTITLEMENT_REMOVE_ADS') || 'remove_ads').trim();
const WEBHOOK_AUTH = Deno.env.get('REVENUECAT_WEBHOOK_AUTH') || '';

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const getEventPayload = (envelope: RevenueCatEventEnvelope) => {
  if (envelope?.event && typeof envelope.event === 'object') return envelope.event;
  return envelope;
};

const parseExpirationIso = (event: Record<string, any>): string | null => {
  if (typeof event?.expiration_at_ms === 'number' && Number.isFinite(event.expiration_at_ms)) {
    return new Date(event.expiration_at_ms).toISOString();
  }
  if (typeof event?.expires_at_ms === 'number' && Number.isFinite(event.expires_at_ms)) {
    return new Date(event.expires_at_ms).toISOString();
  }
  if (typeof event?.expiration_at === 'string' && event.expiration_at.trim()) {
    const parsed = new Date(event.expiration_at);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  if (typeof event?.expires_date === 'string' && event.expires_date.trim()) {
    const parsed = new Date(event.expires_date);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return null;
};

const parseEventTimestampIso = (event: Record<string, any>): string | null => {
  if (typeof event?.event_timestamp_ms === 'number' && Number.isFinite(event.event_timestamp_ms)) {
    return new Date(event.event_timestamp_ms).toISOString();
  }
  if (typeof event?.purchased_at_ms === 'number' && Number.isFinite(event.purchased_at_ms)) {
    return new Date(event.purchased_at_ms).toISOString();
  }
  if (typeof event?.event_timestamp === 'string' && event.event_timestamp.trim()) {
    const parsed = new Date(event.event_timestamp);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  if (typeof event?.purchased_at === 'string' && event.purchased_at.trim()) {
    const parsed = new Date(event.purchased_at);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return null;
};

const extractMissingProfileColumn = (error: any): string | null => {
  if (!error) return null;
  const code = String(error.code || '');
  const message = `${String(error.message || '')} ${String(error.details || '')}`;
  if (code === 'PGRST204') {
    const postgrestMatch = message.match(/Could not find the '([^']+)' column/i);
    if (postgrestMatch?.[1]) return postgrestMatch[1];
  }
  if (code === '42703') {
    const prefixedMatch = message.match(/profiles\.([a-zA-Z0-9_]+)/i);
    if (prefixedMatch?.[1]) return prefixedMatch[1];
    const genericMatch = message.match(
      /column\s+["']?(?:public\.)?(?:profiles\.)?([a-zA-Z0-9_]+)["']?\s+does not exist/i
    );
    if (genericMatch?.[1]) return genericMatch[1];
  }
  return null;
};

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'method_not_allowed' });
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return jsonResponse(500, { error: 'missing_supabase_env' });
  }

  if (WEBHOOK_AUTH) {
    const authHeader = request.headers.get('authorization') || '';
    const bearer = WEBHOOK_AUTH.startsWith('Bearer ') ? WEBHOOK_AUTH : `Bearer ${WEBHOOK_AUTH}`;
    if (authHeader !== WEBHOOK_AUTH && authHeader !== bearer) {
      return jsonResponse(401, { error: 'unauthorized' });
    }
  }

  let envelope: RevenueCatEventEnvelope;
  try {
    envelope = await request.json();
  } catch {
    return jsonResponse(400, { error: 'invalid_json' });
  }

  const event = getEventPayload(envelope);
  const eventId = String(event?.id || envelope?.id || '').trim();
  if (!eventId) {
    return jsonResponse(400, { error: 'missing_event_id' });
  }

  const appUserId = String(
    event?.app_user_id || event?.original_app_user_id || event?.subscriber?.original_app_user_id || ''
  ).trim();
  const eventType = String(event?.type || event?.event_type || event?.event || 'unknown').trim();
  const normalizedEventType = eventType.toUpperCase();
  const productId = String(event?.product_id || event?.store_product_id || '').trim() || null;
  const expirationIso = parseExpirationIso(event);
  const eventTimestampIso = parseEventTimestampIso(event);
  const entitlementsFromArray = Array.isArray(event?.entitlement_ids)
    ? event.entitlement_ids
    : Array.isArray(event?.entitlements)
      ? event.entitlements
      : [];
  const entitlementsFromObject =
    event?.subscriber?.entitlements && typeof event.subscriber.entitlements === 'object'
      ? Object.keys(event.subscriber.entitlements)
      : [];
  const entitlementIds = [...entitlementsFromArray, ...entitlementsFromObject, event?.entitlement_id]
    .map((item) => String(item || '').trim())
    .filter(Boolean);

  const isRevokedEvent =
    /EXPIR|CANCEL|REFUND|BILLING_ISSUE|PAUSED/.test(normalizedEventType) &&
    !/UNCANCEL|CANCELLATION_REVERSED/.test(normalizedEventType);
  const hasPro = entitlementIds.includes(PRO_ENTITLEMENT);
  const hasRemoveAdsEntitlement = entitlementIds.includes(REMOVE_ADS_ENTITLEMENT);
  const hasRemoveAds = !isRevokedEvent && (hasPro || hasRemoveAdsEntitlement);
  const subscriptionType = !isRevokedEvent && hasPro ? 'pro' : 'free';

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { error: eventInsertError } = await supabase
    .from('subscription_events')
    .upsert(
      {
        event_id: eventId,
        app_user_id: appUserId || null,
        product_id: productId,
        entitlement_ids: entitlementIds,
        event_type: eventType || 'unknown',
        event_timestamp: eventTimestampIso,
        payload: envelope,
      },
      {
        onConflict: 'event_id',
        ignoreDuplicates: true,
      }
    );

  if (eventInsertError) {
    return jsonResponse(500, { error: 'subscription_event_insert_failed', detail: eventInsertError.message });
  }

  if (isUuid(appUserId)) {
    let profilePayload: Record<string, unknown> = {
      subscription_type: subscriptionType,
      ads_removed: hasRemoveAds,
      subscription_expires_at: expirationIso,
      rc_customer_id: appUserId,
      account_link_required_until: null,
      updated_at: new Date().toISOString(),
    };
    let profileUpdateError: any = null;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const result = await supabase.from('profiles').update(profilePayload).eq('id', appUserId);
      profileUpdateError = result.error;
      if (!profileUpdateError) break;

      const missingColumn = extractMissingProfileColumn(profileUpdateError);
      if (!missingColumn || !(missingColumn in profilePayload)) {
        break;
      }
      delete profilePayload[missingColumn];
    }

    if (profileUpdateError) {
      return jsonResponse(500, {
        error: 'profile_update_failed',
        detail: profileUpdateError.message,
      });
    }
  }

  return jsonResponse(200, {
    ok: true,
    eventId,
    appUserId: appUserId || null,
    subscriptionType,
    adsRemoved: hasRemoveAds,
  });
});
