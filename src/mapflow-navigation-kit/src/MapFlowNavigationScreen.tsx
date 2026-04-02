import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import MapView, { useMapBridge } from './components/map/MapView.native';
import SearchBar from './components/navigation/SearchBar';
import SearchResults from './components/navigation/SearchResults';
import NavigationPanel from './components/navigation/NavigationPanel';
import SpeedIndicator from './components/navigation/SpeedIndicator';
import IconButton from './components/ui/IconButton';

import { useLocation } from './hooks/useLocation';
import { useGeocoding } from './hooks/useGeocoding';
import { useRouting } from './hooks/useRouting';
import { useSpeedLimits } from './hooks/useSpeedLimits';
import { useNavigationTracking } from './hooks/useNavigationTracking';
import { useNavigation } from './hooks/useNavigation';

import { useNavigationStore } from './stores/navigationStore';
import { MapOverlayMarker, SearchResult, StoredDestination } from './types/map';
import { COLORS } from './utils/colors';
import { reverseGeocode } from './services/api';
import {
  loadDestinationCollections,
  recordRecentDestination,
  toggleSavedDestination,
} from './services/destinationStorage';
import {
  buildBrowseSections,
  buildQuerySections,
  isSameSearchResult,
  toSearchResult,
} from './utils/searchResults';

type MapFlowNavigationScreenProps = {
  overlayMarkers?: MapOverlayMarker[];
  topOverlayOffset?: number;
};

export default function MapFlowNavigationScreen({
  overlayMarkers = [],
  topOverlayOffset,
}: MapFlowNavigationScreenProps) {
  const insets = useSafeAreaInsets();
  const topChromeOffset = topOverlayOffset ?? (insets.top + 8);
  const searchBarTop = topChromeOffset + 10;
  const searchResultsTop = searchBarTop + 66;
  const [mapReady, setMapReady] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [savedDestinations, setSavedDestinations] = useState<StoredDestination[]>([]);
  const [recentDestinations, setRecentDestinations] = useState<StoredDestination[]>([]);
  const [selectedDestinationResult, setSelectedDestinationResult] = useState<SearchResult | null>(null);
  const hasCenteredInitialLocation = useRef(false);
  const lastDestinationKey = useRef<string | null>(null);
  const rerouteAtRef = useRef(0);
  const committedSearchQueryRef = useRef<string | null>(null);
  const suppressSearchUntilEditRef = useRef(false);
  const overlayPressHandlersRef = useRef<Record<string, ((marker: MapOverlayMarker) => void) | undefined>>({});
  const { webViewRef, sendToMap } = useMapBridge();

  const { isNavigating, isRouting, route, navigateTo, start, stop } = useNavigation();

  const {
    userLocation,
    userHeading,
    userSpeed,
    routeHeading,
    searchQuery,
    searchResults,
    destination,
    destinationName,
    unitSystem,
    isSearching,
    isOffRoute,
    setSearchQuery,
    setSearchResults,
    setIsOffRoute,
  } = useNavigationStore();

  useLocation();
  useSpeedLimits();
  useNavigationTracking();

  const { calculateRoute } = useRouting();
  const savedSearchResults = useMemo(
    () => savedDestinations.map((item) => toSearchResult(item, 'saved', true)),
    [savedDestinations],
  );
  const recentSearchResults = useMemo(
    () =>
      recentDestinations
        .filter((recentItem) => !savedDestinations.some((savedItem) => isSameSearchResult(savedItem, recentItem)))
        .map((item) => toSearchResult(item, 'recent', false)),
    [recentDestinations, savedDestinations],
  );
  const localSearchResults = useMemo(
    () => [...savedSearchResults, ...recentSearchResults],
    [recentSearchResults, savedSearchResults],
  );
  const { debouncedSearch, cancelSearch } = useGeocoding(localSearchResults);
  const sanitizedOverlayMarkers = useMemo(
    () =>
      overlayMarkers.filter((marker) => {
        const latitude = Number(marker?.latitude);
        const longitude = Number(marker?.longitude);
        return (
          Boolean(marker?.id) &&
          Number.isFinite(latitude) &&
          Number.isFinite(longitude) &&
          latitude >= -90 &&
          latitude <= 90 &&
          longitude >= -180 &&
          longitude <= 180
        );
      }),
    [overlayMarkers],
  );

  useEffect(() => {
    overlayPressHandlersRef.current = sanitizedOverlayMarkers.reduce<Record<string, ((marker: MapOverlayMarker) => void) | undefined>>(
      (accumulator, marker) => {
        accumulator[String(marker.id)] = marker.onPress;
        return accumulator;
      },
      {},
    );
  }, [sanitizedOverlayMarkers]);

  useEffect(() => {
    let active = true;
    loadDestinationCollections()
      .then((collections) => {
        if (!active) {
          return;
        }

        setRecentDestinations(collections.recentDestinations);
        setSavedDestinations(collections.savedDestinations);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!isSearchFocused || isNavigating) {
      cancelSearch();
      setSearchResults([]);
      return;
    }

    if (suppressSearchUntilEditRef.current && committedSearchQueryRef.current === query) {
      cancelSearch();
      setSearchResults([]);
      return;
    }

    if (query.length < 2) {
      cancelSearch();
      setSearchResults([]);
      return;
    }

    debouncedSearch(query);
  }, [cancelSearch, debouncedSearch, isNavigating, isSearchFocused, localSearchResults, searchQuery, setSearchResults]);

  const commitDestinationSelection = useCallback(
    (result: SearchResult) => {
      suppressSearchUntilEditRef.current = true;
      committedSearchQueryRef.current = result.name.trim();
      setSelectedDestinationResult(result);
      setSearchQuery(result.name);
      setSearchResults([]);
      setIsSearchFocused(false);
      Keyboard.dismiss();
      navigateTo(result.lat, result.lng, result.name);
      recordRecentDestination(result)
        .then((nextRecents) => {
          setRecentDestinations(nextRecents);
        })
        .catch(() => {});
    },
    [navigateTo, setSearchQuery, setSearchResults],
  );

  const handleMapReady = useCallback(() => {
    setMapReady(true);
  }, []);

  const handleMapClick = useCallback(
    async (lat: number, lng: number) => {
      if (!isNavigating) {
        Keyboard.dismiss();
        try {
          const location = await reverseGeocode(lat, lng);
          const resolvedName =
            location.road ||
            location.displayName?.split(',').slice(0, 2).join(', ').trim() ||
            location.city ||
            'Dropped Pin';
          commitDestinationSelection({
            name: resolvedName,
            address: location.displayName || resolvedName,
            lat,
            lng,
            sourceKind: 'network',
          });
        } catch {
          commitDestinationSelection({
            name: 'Dropped Pin',
            address: 'Dropped Pin',
            lat,
            lng,
            sourceKind: 'network',
          });
        }
      }
    },
    [commitDestinationSelection, isNavigating],
  );

  useEffect(() => {
    if (!mapReady || !userLocation) {
      return;
    }

    sendToMap({
      type: 'updateLocation',
      payload: {
        lat: userLocation.lat,
        lng: userLocation.lng,
        heading: userHeading,
        routeHeading,
      },
    });

    if (isNavigating) {
      sendToMap({
        type: 'followUser',
        payload: {
          lat: userLocation.lat,
          lng: userLocation.lng,
          heading: userHeading,
          routeHeading,
          speed: userSpeed,
          pitch: 0,
          navigation: true,
        },
      });
    }
  }, [isNavigating, mapReady, routeHeading, sendToMap, userHeading, userLocation, userSpeed]);

  useEffect(() => {
    if (!mapReady || !userLocation || hasCenteredInitialLocation.current) {
      return;
    }

    hasCenteredInitialLocation.current = true;
    sendToMap({
      type: 'flyTo',
      payload: {
        lat: userLocation.lat,
        lng: userLocation.lng,
        heading: 0,
        pitch: 0,
        zoom: 16.4,
        navigation: false,
      },
    });
  }, [mapReady, sendToMap, userLocation]);

  useEffect(() => {
    if (mapReady && destination) {
      sendToMap({
        type: 'updateDestination',
        payload: destination,
      });
    }
  }, [destination, mapReady, sendToMap]);

  useEffect(() => {
    if (!mapReady) {
      return;
    }

    if (route?.geometry) {
      sendToMap({
        type: 'updateRoute',
        payload: { geometry: route.geometry },
      });
    } else {
      sendToMap({ type: 'clearRoute' });
    }
  }, [mapReady, route, sendToMap]);

  useEffect(() => {
    if (!mapReady) {
      return;
    }

    if (sanitizedOverlayMarkers.length > 0) {
      sendToMap({
        type: 'updateOverlays',
        payload: { markers: sanitizedOverlayMarkers },
      });
    } else {
      sendToMap({ type: 'clearOverlays' });
    }
  }, [mapReady, sanitizedOverlayMarkers, sendToMap]);

  useEffect(() => {
    if (!destination || !userLocation) {
      lastDestinationKey.current = null;
      return;
    }

    const destinationKey = `${destination.lat.toFixed(6)}:${destination.lng.toFixed(6)}`;
    if (lastDestinationKey.current === destinationKey) {
      return;
    }

    lastDestinationKey.current = destinationKey;
    calculateRoute();
  }, [calculateRoute, destination, userLocation]);

  useEffect(() => {
    if (destination) {
      return;
    }

    setSelectedDestinationResult(null);
    committedSearchQueryRef.current = null;
    suppressSearchUntilEditRef.current = false;
  }, [destination]);

  useEffect(() => {
    if (!isNavigating || !isOffRoute || isRouting) {
      return;
    }

    const now = Date.now();
    if (now - rerouteAtRef.current < 8000) {
      return;
    }

    rerouteAtRef.current = now;
    setIsOffRoute(false);
    calculateRoute();
  }, [calculateRoute, isNavigating, isOffRoute, isRouting, setIsOffRoute]);

  const handleSelectPlace = useCallback(
    (result: SearchResult) => {
      commitDestinationSelection(result);
    },
    [commitDestinationSelection],
  );

  const handleStartNavigation = useCallback(() => {
    start();

    if (!userLocation) {
      return;
    }

    sendToMap({
      type: 'flyTo',
      payload: {
        lat: userLocation.lat,
        lng: userLocation.lng,
        heading: userHeading,
        routeHeading,
        speed: userSpeed,
        pitch: 0,
        navigation: true,
      },
    });
  }, [routeHeading, sendToMap, start, userHeading, userLocation, userSpeed]);

  const handleStopNavigation = useCallback(() => {
    stop();
    setIsSearchFocused(false);

    if (!userLocation) {
      return;
    }

    sendToMap({
      type: 'flyTo',
      payload: {
        lat: userLocation.lat,
        lng: userLocation.lng,
        heading: 0,
        pitch: 0,
        zoom: 15.8,
        navigation: false,
      },
    });
  }, [sendToMap, stop, userLocation]);

  const handleMyLocation = useCallback(() => {
    if (!userLocation) {
      return;
    }

    sendToMap({
      type: 'flyTo',
      payload: {
        lat: userLocation.lat,
        lng: userLocation.lng,
        heading: isNavigating ? userHeading : 0,
        routeHeading,
        speed: userSpeed,
        pitch: 0,
        zoom: isNavigating ? undefined : 16.4,
        navigation: isNavigating,
      },
    });
  }, [isNavigating, routeHeading, sendToMap, userHeading, userLocation, userSpeed]);

  const handleSearchFocus = useCallback(() => {
    setIsSearchFocused(true);
  }, []);

  const handleSearchBlur = useCallback(() => {
    setIsSearchFocused(false);
  }, []);

  const handleChangeQuery = useCallback(
    (query: string) => {
      if (suppressSearchUntilEditRef.current && committedSearchQueryRef.current !== query.trim()) {
        suppressSearchUntilEditRef.current = false;
        committedSearchQueryRef.current = null;
      }

      if (
        selectedDestinationResult &&
        query.trim() !== selectedDestinationResult.name.trim()
      ) {
        setSelectedDestinationResult(null);
      }

      setSearchQuery(query);
    },
    [selectedDestinationResult, setSearchQuery],
  );

  const handleClearSearch = useCallback(() => {
    suppressSearchUntilEditRef.current = false;
    committedSearchQueryRef.current = null;
    setSelectedDestinationResult(null);
    setSearchQuery('');
    setSearchResults([]);
    setIsSearchFocused(true);
  }, [setSearchQuery, setSearchResults]);

  const activeDestinationResult = useMemo(() => {
    if (selectedDestinationResult) {
      return selectedDestinationResult;
    }

    if (!destination) {
      return null;
    }

    return {
      name: destinationName || searchQuery || 'Destination',
      address: destinationName || searchQuery || 'Destination',
      lat: destination.lat,
      lng: destination.lng,
      sourceKind: 'network' as const,
    };
  }, [destination, destinationName, searchQuery, selectedDestinationResult]);

  const isActiveDestinationSaved = useMemo(
    () =>
      activeDestinationResult
        ? savedDestinations.some((item) => isSameSearchResult(item, activeDestinationResult))
        : false,
    [activeDestinationResult, savedDestinations],
  );

  const handleToggleSaved = useCallback(
    async (result: SearchResult) => {
      const next = await toggleSavedDestination(result);
      setSavedDestinations(next.savedDestinations);
      setSelectedDestinationResult((current) => {
        if (!current || !isSameSearchResult(current, result)) {
          return current;
        }

        return {
          ...current,
          isSaved: next.isSaved,
        };
      });
    },
    [],
  );

  const searchSections = useMemo(() => {
    if (isNavigating || !isSearchFocused) {
      return [];
    }

    const query = searchQuery.trim();
    if (!query) {
      return buildBrowseSections(savedSearchResults, recentSearchResults);
    }

    if (query.length < 2) {
      return [];
    }

    return buildQuerySections(searchResults);
  }, [
    isNavigating,
    isSearchFocused,
    recentSearchResults,
    savedSearchResults,
    searchQuery,
    searchResults,
  ]);

  const handleOverlayMarkerPress = useCallback(
    (markerId: string) => {
      const marker = sanitizedOverlayMarkers.find((item) => String(item.id) === markerId);
      if (!marker) {
        return;
      }

      overlayPressHandlersRef.current[markerId]?.(marker);
    },
    [sanitizedOverlayMarkers],
  );

  const showResults = searchSections.length > 0 && !isNavigating;
  const showProviderFooter = searchQuery.trim().length >= 2 && searchSections.some((section) => section.key === 'network');

  return (
    <View style={styles.root}>
      <MapView
        webViewRef={webViewRef}
        onMapReady={handleMapReady}
        onMapClick={handleMapClick}
        onOverlayMarkerPress={handleOverlayMarkerPress}
      />

      <View style={styles.overlay}>
        {!isNavigating && (
          <SearchBar
            value={searchQuery}
            onChangeQuery={handleChangeQuery}
            onClear={handleClearSearch}
            onMyLocation={handleMyLocation}
            onFocus={handleSearchFocus}
            onBlur={handleSearchBlur}
            isSearching={isSearching}
            topOffset={searchBarTop}
          />
        )}

        {showResults && (
          <View style={[styles.searchResultsWrap, { top: searchResultsTop }]}>
            <SearchResults
              sections={searchSections}
              onSelect={handleSelectPlace}
              onToggleSaved={handleToggleSaved}
              unitSystem={unitSystem}
              footerText={showProviderFooter ? 'Live search via free provider fallbacks' : undefined}
            />
          </View>
        )}

        {!isNavigating && (
          <View style={[styles.fabColumn, { top: searchResultsTop + 70 }]}>
            <IconButton icon="explore" onPress={handleMyLocation} />
          </View>
        )}

        {isNavigating && (
          <View style={[styles.fabColumn, { top: topChromeOffset + 96 }]}>
            <IconButton icon="crosshairs-gps" onPress={handleMyLocation} color={COLORS.primary} />
          </View>
        )}

        <SpeedIndicator />

        <NavigationPanel
          onStartNavigation={handleStartNavigation}
          onStopNavigation={handleStopNavigation}
          onToggleSavedDestination={activeDestinationResult ? () => void handleToggleSaved(activeDestinationResult) : undefined}
          isSavedDestination={isActiveDestinationSaved}
          topOffset={Math.max(0, topChromeOffset - (insets.top + 8))}
        />

        {isRouting && (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        )}

        {!mapReady && (
          <View style={styles.welcome}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: 'box-none',
  },
  fabColumn: {
    position: 'absolute',
    right: 16,
    gap: 10,
  },
  searchResultsWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 21,
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(5, 12, 24, 0.34)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
  welcome: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(5, 12, 24, 0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
});
