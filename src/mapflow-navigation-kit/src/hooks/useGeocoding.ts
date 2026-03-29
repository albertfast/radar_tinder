import { useCallback, useEffect, useRef } from 'react';
import { primeSearchContext, searchPlaces } from '../services/api';
import { useNavigationStore } from '../stores/navigationStore';

export function useGeocoding() {
  const { searchQuery, setSearchResults, setIsSearching, userLocation } = useNavigationStore();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(
    async (query?: string) => {
      const q = query ?? searchQuery;
      if (!q || q.length < 2) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);
      try {
        const data = await searchPlaces(
          q,
          userLocation?.lat,
          userLocation?.lng,
        );
        setSearchResults(data.results || []);
      } catch (e) {
        console.error('Geocoding error:', e);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    [searchQuery, userLocation, setSearchResults, setIsSearching],
  );

  const debouncedSearch = useCallback(
    (query: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => search(query), 300);
    },
    [search],
  );

  useEffect(
    () => {
      if (userLocation) {
        primeSearchContext(userLocation.lat, userLocation.lng);
      }
    },
    [userLocation],
  );

  useEffect(
    () => () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    },
    [],
  );

  return { search, debouncedSearch };
}
