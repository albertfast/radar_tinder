import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
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
import { RadarMapMarker, SearchResult } from './types/map';
import { COLORS } from './utils/colors';

type MapFlowNavigationScreenProps = {
  radarMarkers?: RadarMapMarker[];
  highlightedRadarId?: string | null;
  onMapUnavailable?: (reason: string) => void;
};

export default function MapFlowNavigationScreen({
  radarMarkers = [],
  highlightedRadarId = null,
  onMapUnavailable,
}: MapFlowNavigationScreenProps) {
  const searchBarTop = 0;
  const searchResultsTop = searchBarTop + 54;
  const [mapReady, setMapReady] = useState(false);
  const hasCenteredInitialLocation = useRef(false);
  const lastDestinationKey = useRef<string | null>(null);
  const rerouteAtRef = useRef(0);
  const hasExplicitNavigationStartRef = useRef(false);
  const suppressNextSearchRef = useRef(false);
  const selectedSearchValueRef = useRef<string | null>(null);
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
    setIsNavigating,
  } = useNavigationStore();

  useLocation();
  useSpeedLimits();
  useNavigationTracking();

  const { debouncedSearch, cancelPendingSearch } = useGeocoding();
  const { calculateRoute } = useRouting();

  useEffect(() => {
    if (suppressNextSearchRef.current) {
      suppressNextSearchRef.current = false;
      return;
    }

    const query = searchQuery.trim();
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    if (
      selectedSearchValueRef.current &&
      query === selectedSearchValueRef.current &&
      searchResults.length === 0
    ) {
      return;
    }

    if (destinationName.trim() && query === destinationName.trim() && searchResults.length === 0) {
      return;
    }

    debouncedSearch(query);
  }, [destinationName, searchQuery, debouncedSearch, searchResults.length, setSearchResults]);

  useEffect(() => {
    if (!isNavigating) {
      hasExplicitNavigationStartRef.current = false;
      return;
    }

    if (!hasExplicitNavigationStartRef.current) {
      setIsNavigating(false);
    }
  }, [isNavigating, setIsNavigating]);

  const handleMapReady = useCallback(() => {
    setMapReady(true);
  }, []);

  const handleMapClick = useCallback(
    async (lat: number, lng: number) => {
      Keyboard.dismiss();
    },
    [],
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
          pitch: 58,
          navigation: true,
        },
      });
    }
  }, [isNavigating, mapReady, routeHeading, sendToMap, userHeading, userLocation, userSpeed]);

  useEffect(() => {
    if (!mapReady || isNavigating) {
      return;
    }

    if (route?.geometry?.length) {
      sendToMap({
        type: 'updateRoute',
        payload: { geometry: route.geometry },
      });
      return;
    }

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
        zoom: 14.8,
        navigation: false,
      },
    });
  }, [isNavigating, mapReady, route?.geometry, sendToMap, userLocation]);

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
        zoom: 14.95,
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

    if (radarMarkers.length > 0) {
      sendToMap({
        type: 'setRadarMarkers',
        payload: radarMarkers,
      });
      return;
    }

    sendToMap({ type: 'clearRadarMarkers' });
  }, [mapReady, radarMarkers, sendToMap]);

  useEffect(() => {
    if (!mapReady) {
      return;
    }

    sendToMap({
      type: 'highlightRadar',
      payload: highlightedRadarId ? { id: highlightedRadarId } : null,
    });
  }, [highlightedRadarId, mapReady, sendToMap]);

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
      const selectedLabel = (result.name || result.address || '').trim();
      suppressNextSearchRef.current = true;
      selectedSearchValueRef.current = selectedLabel || null;
      cancelPendingSearch();
      setIsNavigating(false);
      setSearchQuery(selectedLabel);
      setSearchResults([]);
      Keyboard.dismiss();
      navigateTo(result.lat, result.lng, result.name);
    },
    [cancelPendingSearch, navigateTo, setIsNavigating, setSearchQuery, setSearchResults],
  );

  const handleSearchQueryChange = useCallback(
    (query: string) => {
      if (selectedSearchValueRef.current && query.trim() !== selectedSearchValueRef.current) {
        selectedSearchValueRef.current = null;
      }

      setSearchQuery(query);
    },
    [setSearchQuery],
  );

  const handleStartNavigation = useCallback(() => {
    hasExplicitNavigationStartRef.current = true;
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
        pitch: 58,
        navigation: true,
      },
    });
  }, [routeHeading, sendToMap, start, userHeading, userLocation, userSpeed]);

  const handleStopNavigation = useCallback(() => {
    hasExplicitNavigationStartRef.current = false;
    stop();

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
        pitch: isNavigating ? 58 : 0,
        zoom: isNavigating ? undefined : 14.95,
        navigation: isNavigating,
      },
    });
  }, [isNavigating, routeHeading, sendToMap, userHeading, userLocation, userSpeed]);

  const handleClearSearch = useCallback(() => {
    selectedSearchValueRef.current = null;
    setSearchQuery('');
    setSearchResults([]);
    Keyboard.dismiss();
  }, [setSearchQuery, setSearchResults]);

  const showResults = searchResults.length > 0 && !isNavigating;

  return (
    <View style={styles.root}>
      <MapView
        webViewRef={webViewRef}
        onMapReady={handleMapReady}
        onMapClick={handleMapClick}
        onUnavailable={onMapUnavailable}
      />

      <View style={styles.overlay}>
        {!isNavigating && (
          <SearchBar
            value={searchQuery}
            onChangeQuery={handleSearchQueryChange}
            onClear={handleClearSearch}
            onMyLocation={handleMyLocation}
            isSearching={isSearching}
            topOffset={searchBarTop}
          />
        )}

        {showResults && (
          <View style={[styles.searchResultsWrap, { top: searchResultsTop }]}>
            <SearchResults
              results={searchResults}
              onSelect={handleSelectPlace}
              unitSystem={unitSystem}
            />
          </View>
        )}

        {!isNavigating && (
          <View style={[styles.fabColumn, { top: searchResultsTop + 70 }]}>
            <IconButton icon="explore" onPress={handleMyLocation} />
          </View>
        )}

        {isNavigating && (
          <View style={[styles.fabColumn, { top: 96 }]}>
            <IconButton icon="3d-rotation" onPress={handleMyLocation} color={COLORS.primary} />
          </View>
        )}

        <SpeedIndicator />

        <NavigationPanel
          onStartNavigation={handleStartNavigation}
          onStopNavigation={handleStopNavigation}
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
