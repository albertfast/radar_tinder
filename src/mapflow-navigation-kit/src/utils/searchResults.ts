import {
  SearchResult,
  SearchResultsSection,
  SearchResultSourceKind,
  StoredDestination,
} from '../types/map';

const SEARCH_LIMIT = 8;
const SOURCE_BONUS: Record<SearchResultSourceKind, number> = {
  saved: 28,
  recent: 14,
  network: 0,
};

function normalizeText(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function buildCoordinateKey(lat: number, lng: number): string {
  return `${Number(lat).toFixed(5)}:${Number(lng).toFixed(5)}`;
}

export function buildStoredDestinationId(result: Pick<SearchResult, 'name' | 'lat' | 'lng'>): string {
  return `${buildCoordinateKey(result.lat, result.lng)}:${normalizeText(result.name)}`;
}

export function isSameSearchResult(
  left:
    | Pick<SearchResult, 'name' | 'lat' | 'lng'>
    | Pick<StoredDestination, 'name' | 'lat' | 'lng'>,
  right:
    | Pick<SearchResult, 'name' | 'lat' | 'lng'>
    | Pick<StoredDestination, 'name' | 'lat' | 'lng'>,
): boolean {
  return buildStoredDestinationId(left) === buildStoredDestinationId(right);
}

export function toStoredDestination(
  result: Pick<SearchResult, 'name' | 'address' | 'lat' | 'lng'>,
  timestamps?: { savedAt?: string; usedAt?: string },
): StoredDestination {
  return {
    id: buildStoredDestinationId(result),
    name: result.name,
    address: result.address,
    lat: result.lat,
    lng: result.lng,
    savedAt: timestamps?.savedAt,
    usedAt: timestamps?.usedAt,
  };
}

export function toSearchResult(
  destination: StoredDestination,
  sourceKind: SearchResultSourceKind,
  isSaved: boolean,
): SearchResult {
  return {
    name: destination.name,
    address: destination.address,
    lat: destination.lat,
    lng: destination.lng,
    sourceKind,
    isSaved,
    provider: sourceKind,
    type: destination.label || null,
  };
}

function scoreLocalResult(result: SearchResult, query: string): number {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) {
    return 0;
  }

  const name = normalizeText(result.name);
  const address = normalizeText(result.address);
  const tokens = normalizedQuery.split(' ').filter(Boolean);
  let score = SOURCE_BONUS[result.sourceKind || 'network'];

  if (name.startsWith(normalizedQuery)) score += 140;
  else if (name.includes(normalizedQuery)) score += 92;

  if (address.startsWith(normalizedQuery)) score += 78;
  else if (address.includes(normalizedQuery)) score += 44;

  score += tokens.filter((token) => name.includes(token) || address.includes(token)).length * 24;
  return score;
}

export function mergeSearchResults(
  localResults: SearchResult[],
  networkResults: SearchResult[],
  query: string,
): SearchResult[] {
  const scoredLocal = localResults
    .map((result) => ({ result, score: scoreLocalResult(result, query) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.result);

  const savedResults = localResults.filter((item) => item.sourceKind === 'saved');
  const deduped: SearchResult[] = [];
  const seen = new Set<string>();

  [...scoredLocal, ...networkResults].forEach((result) => {
    const key = buildStoredDestinationId(result);
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    deduped.push({
      ...result,
      sourceKind: result.sourceKind || 'network',
      isSaved:
        result.isSaved ||
        savedResults.some((savedResult) => isSameSearchResult(savedResult, result)),
    });
  });

  return deduped.slice(0, SEARCH_LIMIT);
}

function buildSection(
  key: SearchResultSourceKind,
  title: string,
  items: SearchResult[],
): SearchResultsSection | null {
  if (items.length === 0) {
    return null;
  }

  return {
    key,
    title,
    data: items,
  };
}

export function buildQuerySections(results: SearchResult[]): SearchResultsSection[] {
  const saved = results.filter((item) => item.sourceKind === 'saved');
  const network = results.filter((item) => item.sourceKind !== 'saved' && item.sourceKind !== 'recent');

  return [
    buildSection('saved', 'Saved', saved),
    buildSection('network', 'Results', network),
  ].filter((section): section is SearchResultsSection => section !== null);
}
