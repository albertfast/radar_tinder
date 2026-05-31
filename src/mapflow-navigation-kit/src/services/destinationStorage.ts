import AsyncStorage from '@react-native-async-storage/async-storage';
import { SearchResult, StoredDestination } from '../types/map';
import { buildStoredDestinationId, isSameSearchResult, toStoredDestination } from '../utils/searchResults';
import { supabase } from '../../../../utils/supabase';

const mapPlaceKindToLabel: Record<string, string> = {
  home: 'Home',
  work: 'Work',
  school: 'School',
};

const mapLabelToPlaceKind: Record<string, string> = {
  Home: 'home',
  Work: 'work',
  School: 'school',
};

const RECENT_DESTINATIONS_KEY = 'recent_destinations_v1';
const SAVED_DESTINATIONS_KEY = 'saved_destinations_v1';
const RECENT_LIMIT = 8;
const SAVED_LIMIT = 20;

type DestinationCollections = {
  recentDestinations: StoredDestination[];
  savedDestinations: StoredDestination[];
};

function sanitizeCollection(rawValue: string | null): StoredDestination[] {
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const sanitized = parsed
      .map((item): StoredDestination | null => {
        const name = String(item?.name || '').trim();
        const address = String(item?.address || '').trim() || name;
        const lat = Number(item?.lat);
        const lng = Number(item?.lng);
        if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) {
          return null;
        }

        const destination: StoredDestination = {
          id: String(item?.id || buildStoredDestinationId({ name, lat, lng })),
          name,
          address,
          lat,
          lng,
          savedAt: typeof item?.savedAt === 'string' ? item.savedAt : undefined,
          usedAt: typeof item?.usedAt === 'string' ? item.usedAt : undefined,
          label: typeof item?.label === 'string' ? item.label : undefined,
        };

        return destination;
      })
      .filter((item): item is StoredDestination => item !== null);

    return sanitized;
  } catch {
    return [];
  }
}

function dedupeCollection(collection: StoredDestination[]): StoredDestination[] {
  const deduped: StoredDestination[] = [];

  collection.forEach((item) => {
    const existingIndex = deduped.findIndex((candidate) => isSameSearchResult(candidate, item));
    if (existingIndex === -1) {
      deduped.push(item);
      return;
    }

    const existing = deduped[existingIndex];
    deduped[existingIndex] = {
      ...existing,
      ...item,
      savedAt: item.savedAt || existing.savedAt,
      usedAt: item.usedAt || existing.usedAt,
    };
  });

  return deduped;
}

async function loadCollection(key: string): Promise<StoredDestination[]> {
  const raw = await AsyncStorage.getItem(key);
  return sanitizeCollection(raw);
}

async function saveCollection(key: string, items: StoredDestination[]) {
  await AsyncStorage.setItem(key, JSON.stringify(items));
}

export async function loadDestinationCollections(): Promise<DestinationCollections> {
  const [recentDestinations, savedDestinations] = await Promise.all([
    loadCollection(RECENT_DESTINATIONS_KEY),
    loadCollection(SAVED_DESTINATIONS_KEY),
  ]);

  try {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (user && !user.id.startsWith('guest-')) {
      const { data, error } = await supabase
        .from('user_saved_places')
        .select('place_kind, name, address, latitude, longitude, created_at, updated_at')
        .eq('user_id', user.id);

      if (data && !error) {
        const supabasePresets: StoredDestination[] = data.map((item: any) => ({
          id: `supabase-${item.place_kind}`,
          name: item.name,
          address: item.address,
          lat: item.latitude,
          lng: item.longitude,
          label: mapPlaceKindToLabel[item.place_kind] || item.place_kind,
          savedAt: item.created_at,
          usedAt: item.updated_at,
        }));

        const nonPresetSaved = savedDestinations.filter(
          (item) => !item.label || !['Home', 'Work', 'School'].includes(item.label)
        );

        const mergedSaved = [...supabasePresets, ...nonPresetSaved];
        await saveCollection(SAVED_DESTINATIONS_KEY, mergedSaved);

        return {
          recentDestinations,
          savedDestinations: mergedSaved,
        };
      }
    }
  } catch (err) {
    console.warn('[destinationStorage] Failed to sync saved places with Supabase:', err);
  }

  return {
    recentDestinations,
    savedDestinations,
  };
}

export async function recordRecentDestination(
  result: Pick<SearchResult, 'name' | 'address' | 'lat' | 'lng'>,
): Promise<StoredDestination[]> {
  const current = await loadCollection(RECENT_DESTINATIONS_KEY);
  const entry = toStoredDestination(result, { usedAt: new Date().toISOString() });
  const next = dedupeCollection([entry, ...current])
    .sort((left, right) => String(right.usedAt || '').localeCompare(String(left.usedAt || '')))
    .slice(0, RECENT_LIMIT);

  await saveCollection(RECENT_DESTINATIONS_KEY, next);
  return next;
}

export async function toggleSavedDestination(
  result: Pick<SearchResult, 'name' | 'address' | 'lat' | 'lng'>,
): Promise<{ savedDestinations: StoredDestination[]; isSaved: boolean }> {
  const current = await loadCollection(SAVED_DESTINATIONS_KEY);
  const existing = current.find((item) => isSameSearchResult(item, result));

  if (existing) {
    if (existing.label && ['Home', 'Work', 'School'].includes(existing.label)) {
      const next = await deletePresetAddress(existing.label);
      return {
        savedDestinations: next,
        isSaved: false,
      };
    }

    const next = current.filter((item) => !isSameSearchResult(item, result));
    await saveCollection(SAVED_DESTINATIONS_KEY, next);
    return {
      savedDestinations: next,
      isSaved: false,
    };
  }

  const now = new Date().toISOString();
  const entry = toStoredDestination(result, { savedAt: now, usedAt: now });
  const next = dedupeCollection([entry, ...current])
    .sort((left, right) => String(right.savedAt || '').localeCompare(String(left.savedAt || '')))
    .slice(0, SAVED_LIMIT);

  await saveCollection(SAVED_DESTINATIONS_KEY, next);
  return {
    savedDestinations: next,
    isSaved: true,
  };
}

export async function clearRecentDestinations(): Promise<StoredDestination[]> {
  await AsyncStorage.removeItem(RECENT_DESTINATIONS_KEY);
  return [];
}

export async function clearSavedDestinations(): Promise<StoredDestination[]> {
  await AsyncStorage.removeItem(SAVED_DESTINATIONS_KEY);
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (user && !user.id.startsWith('guest-')) {
      const { error } = await supabase
        .from('user_saved_places')
        .delete()
        .eq('user_id', user.id);
      if (error) {
        console.error('[destinationStorage] Supabase clearSavedDestinations error:', error);
      }
    }
  } catch (err) {
    console.warn('[destinationStorage] Failed to clear saved places from Supabase:', err);
  }
  return [];
}


export async function savePresetAddress(
  label: string,
  result: Pick<SearchResult, 'name' | 'address' | 'lat' | 'lng'>,
): Promise<StoredDestination[]> {
  const current = await loadCollection(SAVED_DESTINATIONS_KEY);
  const now = new Date().toISOString();
  
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    const placeKind = mapLabelToPlaceKind[label];
    if (user && placeKind && !user.id.startsWith('guest-')) {
      // Bulletproof: delete any existing preset of this kind first to prevent unique check RLS upsert bugs
      await supabase
        .from('user_saved_places')
        .delete()
        .eq('user_id', user.id)
        .eq('place_kind', placeKind);

      // Insert fresh clean row
      const { error } = await supabase
        .from('user_saved_places')
        .insert({
          user_id: user.id,
          place_kind: placeKind,
          name: result.name,
          address: result.address,
          latitude: result.lat,
          longitude: result.lng,
          updated_at: now,
        });

      if (error) {
        console.error('[destinationStorage] Supabase savePreset insert error:', error);
      }
    }
  } catch (err) {
    console.warn('[destinationStorage] Failed to save preset to Supabase:', err);
  }

  let next = current.filter((item) => item.label !== label && !isSameSearchResult(item, result));
  
  const entry: StoredDestination = {
    id: `supabase-${mapLabelToPlaceKind[label] || label}`,
    name: result.name,
    address: result.address,
    lat: result.lat,
    lng: result.lng,
    savedAt: now,
    usedAt: now,
    label: label,
  };
  
  next = [entry, ...next];
  await saveCollection(SAVED_DESTINATIONS_KEY, next);
  return next;
}

export async function deletePresetAddress(label: string): Promise<StoredDestination[]> {
  const current = await loadCollection(SAVED_DESTINATIONS_KEY);
  
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    const placeKind = mapLabelToPlaceKind[label];
    if (user && placeKind && !user.id.startsWith('guest-')) {
      const { error } = await supabase
        .from('user_saved_places')
        .delete()
        .eq('user_id', user.id)
        .eq('place_kind', placeKind);
      if (error) {
        console.error('[destinationStorage] Supabase delete error:', error);
      }
    }
  } catch (err) {
    console.warn('[destinationStorage] Failed to delete preset from Supabase:', err);
  }

  const next = current.filter((item) => item.label !== label);
  await saveCollection(SAVED_DESTINATIONS_KEY, next);
  return next;
}
