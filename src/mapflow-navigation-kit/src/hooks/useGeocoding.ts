import { useCallback, useEffect, useRef } from 'react';
import { primeSearchContext, searchPlaces } from '../services/api';
import { useNavigationStore } from '../stores/navigationStore';

export function useGeocoding() {
  const { searchQuery, setSearchResults, setIsSearching, userLocation } = useNavigationStore();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRequestIdRef = useRef(0);

  const search = useCallback(
    async (query?: string) => {
      const q = (query ?? searchQuery).trim();
      if (!q || q.length < 2) {
        activeRequestIdRef.current += 1;
        setSearchResults([]);
        setIsSearching(false);
        return;
      }

      const requestId = activeRequestIdRef.current + 1;
      activeRequestIdRef.current = requestId;
      setIsSearching(true);
      try {
        const data = await searchPlaces(
          q,
          userLocation?.lat,
          userLocation?.lng,
        );
        const currentQuery = useNavigationStore.getState().searchQuery.trim();
        if (requestId !== activeRequestIdRef.current || currentQuery !== q) {
          return;
        }
        setSearchResults(data.results || []);
      } catch (e) {
        console.error('Geocoding error:', e);
        if (requestId === activeRequestIdRef.current) {
          setSearchResults([]);
        }
      } finally {
        if (requestId === activeRequestIdRef.current) {
          setIsSearching(false);
        }
      }
    },
    [searchQuery, userLocation, setSearchResults, setIsSearching],
  );

  const debouncedSearch = useCallback(
    (query: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => search(query), 180);
    },
    [search],
  );

  const cancelPendingSearch = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    activeRequestIdRef.current += 1;
    setIsSearching(false);
  }, [setIsSearching]);

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

  return { search, debouncedSearch, cancelPendingSearch };
}
