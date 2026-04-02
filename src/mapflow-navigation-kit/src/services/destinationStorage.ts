import AsyncStorage from '@react-native-async-storage/async-storage';
import { SearchResult, StoredDestination } from '../types/map';
import { buildStoredDestinationId, isSameSearchResult, toStoredDestination } from '../utils/searchResults';

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
