import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
  TouchableOpacity,
  Modal,
  Text,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import MapView, { useMapBridge } from './components/map/MapView.native';
import SearchBar from './components/navigation/SearchBar';
import SearchResults from './components/navigation/SearchResults';
import NavigationPanel from './components/navigation/NavigationPanel';
import SpeedIndicator from './components/navigation/SpeedIndicator';
import IconButton from './components/ui/IconButton';

import { useGeocoding } from './hooks/useGeocoding';
import { useRouting } from './hooks/useRouting';
import { useNavigation } from './hooks/useNavigation';

import { useNavigationStore } from './stores/navigationStore';
import { MapOverlayMarker, MapPoiMarker, RouteChoice, SearchResult, StoredDestination } from './types/map';
import type { MapViewport } from './types/viewport';
import { useSettingsStore } from '../../store/settingsStore';
import { COLORS } from './utils/colors';
import { getMapPoiMarkers, reverseGeocode } from './services/api';
import {
  loadDestinationCollections,
  toggleSavedDestination,
  savePresetAddress,
} from './services/destinationStorage';
import {
  buildQuerySections,
  isSameSearchResult,
  toSearchResult,
} from './utils/searchResults';
import { formatDistance, formatDuration } from './utils/units';

type MapFlowNavigationScreenProps = {
  overlayMarkers?: MapOverlayMarker[];
  topOverlayOffset?: number;
  onViewportChange?: (viewport: MapViewport) => void;
};

export default function MapFlowNavigationScreen({
  overlayMarkers = [],
  topOverlayOffset,
  onViewportChange,
}: MapFlowNavigationScreenProps) {
  const vehicleMarkerId = useSettingsStore((state) => state.vehicleMarkerId);
  const insets = useSafeAreaInsets();
  const topChromeOffset = topOverlayOffset ?? (insets.top + 8);
  const searchBarTop = topChromeOffset + 10;
  const searchResultsTop = searchBarTop + 66;
  const [mapReady, setMapReady] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [showSavedList, setShowSavedList] = useState(false);
  const [savedDestinations, setSavedDestinations] = useState<StoredDestination[]>([]);
  const [selectedDestinationResult, setSelectedDestinationResult] = useState<SearchResult | null>(null);
  const [mapViewport, setMapViewport] = useState<MapViewport | null>(null);
  const [mapLoadError, setMapLoadError] = useState<string | null>(null);
  const [mapReloadToken, setMapReloadToken] = useState(0);

  const hasCenteredInitialLocation = useRef(false);
  const lastDestinationKey = useRef<string | null>(null);
  const lastPoiFetchKeyRef = useRef<string | null>(null);
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
    routeAlternatives,
    destination,
    destinationName,
    unitSystem,
    isSearching,
    isOffRoute,
    setSearchQuery,
    setSearchResults,
    setIsOffRoute,
    selectRouteAlternative,
  } = useNavigationStore();

  const handleToggleSavedList = useCallback(() => {
    setShowSavedList((current) => {
      setIsSearchFocused(false);
      Keyboard.dismiss();
      return !current;
    });
  }, []);

  // Save/Label Modal Dialog States
  const [saveDialogVisible, setSaveDialogVisible] = useState(false);
  const [saveDialogTarget, setSaveDialogTarget] = useState<SearchResult | null>(null);
  const [labelDialogVisible, setLabelDialogVisible] = useState(false);

  const handleOpenSaveDialog = useCallback((result: SearchResult) => {
    setSaveDialogTarget(result);
    setSaveDialogVisible(true);
  }, []);

  const handleRemoveSaved = useCallback(async () => {
    if (!saveDialogTarget) return;
    const next = await toggleSavedDestination(saveDialogTarget);
    setSavedDestinations(next.savedDestinations);
    setSaveDialogVisible(false);
    setSaveDialogTarget(null);
  }, [saveDialogTarget]);

  const handleSaveBookmarkDirect = useCallback(async () => {
    if (!saveDialogTarget) return;
    const next = await toggleSavedDestination(saveDialogTarget);
    setSavedDestinations(next.savedDestinations);
    setSaveDialogVisible(false);
    setSaveDialogTarget(null);
  }, [saveDialogTarget]);

  const handleOpenLabelDialog = useCallback(() => {
    setSaveDialogVisible(false);
    setLabelDialogVisible(true);
  }, []);

  const handleSavePresetDirect = useCallback(async (label: string) => {
    if (!saveDialogTarget) return;
    const next = await savePresetAddress(label, saveDialogTarget);
    setSavedDestinations(next);
    setLabelDialogVisible(false);
    setSaveDialogTarget(null);
  }, [saveDialogTarget]);

  const { calculateRoute } = useRouting();
  const savedSearchResults = useMemo(
    () => savedDestinations.map((item) => toSearchResult(item, 'saved', true)),
    [savedDestinations],
  );
  const localSearchResults = useMemo(
    () => savedSearchResults,
    [savedSearchResults],
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
      setShowSavedList(false);
      Keyboard.dismiss();
      navigateTo(result.lat, result.lng, result.name);
    },
    [navigateTo, setSearchQuery, setSearchResults],
  );

  const handleMapReady = useCallback(() => {
    setMapReady(true);
    setMapLoadError(null);
  }, []);

  const handleMapError = useCallback((message: string) => {
    setMapLoadError(message);
  }, []);

  const handleRetryMapLoad = useCallback(() => {
    setMapLoadError(null);
    setMapReady(false);
    hasCenteredInitialLocation.current = false;
    setMapReloadToken((current) => current + 1);
  }, []);

  const handleViewportChange = useCallback(
    (viewport: MapViewport) => {
      setMapViewport(viewport);
      onViewportChange?.(viewport);
    },
    [onViewportChange],
  );

  const handleMapClick = useCallback(
    async (lat: number, lng: number) => {
      if (showSavedList) {
        setShowSavedList(false);
        return;
      }
      setIsSearchFocused(false);
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
    [commitDestinationSelection, isNavigating, showSavedList],
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
        navigation: isNavigating,
        vehicleMarkerId,
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
  }, [isNavigating, mapReady, routeHeading, sendToMap, userHeading, userLocation, userSpeed, vehicleMarkerId]);

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
        type: 'updateRoutes',
        payload: {
          selectedRouteId: route.id,
          routes: routeAlternatives.length > 0 ? routeAlternatives : [route],
          navigation: isNavigating,
        },
      });
    } else {
      sendToMap({ type: 'clearRoute' });
    }
  }, [isNavigating, mapReady, route, routeAlternatives, sendToMap]);

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
    if (!mapReady || !mapViewport) {
      return undefined;
    }

    if (mapViewport.zoom < 14.2) {
      lastPoiFetchKeyRef.current = null;
      sendToMap({ type: 'updatePoiMarkers', payload: { markers: [] } });
      return undefined;
    }

    const fetchKey = [
      Math.floor(mapViewport.zoom * 2) / 2,
      mapViewport.bounds.north.toFixed(3),
      mapViewport.bounds.south.toFixed(3),
      mapViewport.bounds.east.toFixed(3),
      mapViewport.bounds.west.toFixed(3),
    ].join(':');

    if (lastPoiFetchKeyRef.current === fetchKey) {
      return undefined;
    }

    let active = true;
    const timer = setTimeout(() => {
      getMapPoiMarkers(mapViewport)
        .then((markers: MapPoiMarker[]) => {
          if (!active) {
            return;
          }
          lastPoiFetchKeyRef.current = fetchKey;
          sendToMap({ type: 'updatePoiMarkers', payload: { markers } });
        })
        .catch(() => {
          if (!active) {
            return;
          }
          sendToMap({ type: 'updatePoiMarkers', payload: { markers: [] } });
        });
    }, 450);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [mapReady, mapViewport, sendToMap]);

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
    if (mapReady || mapLoadError || !userLocation) {
      return undefined;
    }

    const timer = setTimeout(() => {
      setMapLoadError('Map is taking too long to load.');
    }, 20000);

    return () => clearTimeout(timer);
  }, [mapLoadError, mapReady, userLocation]);

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
    if (now - rerouteAtRef.current < 3000) {
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
    setShowSavedList(false);
  }, []);

  const handleSearchBlur = useCallback(() => {
    setIsSearchFocused(false);
  }, []);

  const handleChangeQuery = useCallback(
    (query: string) => {
      if (showSavedList) {
        setShowSavedList(false);
      }
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
    [selectedDestinationResult, setSearchQuery, showSavedList],
  );

  const handleClearSearch = useCallback(() => {
    suppressSearchUntilEditRef.current = false;
    committedSearchQueryRef.current = null;
    setSelectedDestinationResult(null);
    setSearchQuery('');
    setSearchResults([]);
    setIsSearchFocused(true);
    setShowSavedList(false);
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
    (result: SearchResult) => {
      handleOpenSaveDialog(result);
    },
    [handleOpenSaveDialog],
  );

  const searchSections = useMemo(() => {
    if (isNavigating) {
      return [];
    }

    if (showSavedList) {
      return [
        {
          key: 'saved' as const,
          title: 'Saved Locations',
          data: savedSearchResults,
        },
      ];
    }

    if (!isSearchFocused) {
      return [];
    }

    const query = searchQuery.trim();
    if (!query) {
      return [];
    }

    if (query.length < 2) {
      return [];
    }

    return buildQuerySections(searchResults);
  }, [
    isNavigating,
    isSearchFocused,
    showSavedList,
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

  const handleSelectRoute = useCallback(
    (routeId: string) => {
      selectRouteAlternative(routeId);
    },
    [selectRouteAlternative],
  );

  if (!userLocation) {
    return (
      <View style={styles.welcome}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const showResults = searchSections.length > 0 && !isNavigating;
  const showProviderFooter = searchQuery.trim().length >= 2 && searchSections.some((section) => section.key === 'network');

  return (
    <View style={styles.root}>
      <MapView
        webViewRef={webViewRef}
        onMapReady={handleMapReady}
        onMapError={handleMapError}
        onMapClick={handleMapClick}
        onOverlayMarkerPress={handleOverlayMarkerPress}
        onRouteSelect={handleSelectRoute}
        onViewportChange={handleViewportChange}
        initialLocation={userLocation}
        reloadToken={mapReloadToken}
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
            onToggleSavedList={handleToggleSavedList}
            isSavedListActive={showSavedList}
          />
        )}

        {showResults && (
          <View style={[styles.searchResultsWrap, { top: searchResultsTop }]}>
            <SearchResults
              sections={searchSections}
              onSelect={handleSelectPlace}
              onToggleSaved={handleToggleSaved}
              hideHeaders={false}
              unitSystem={unitSystem}
              footerText={showProviderFooter ? 'Live search via free provider fallbacks' : undefined}
            />
          </View>
        )}

        {/* Floating Custom Map Controls (Zoom +, Zoom -, Re-Center) */}
        <View style={[styles.customMapControls, { bottom: isNavigating ? 130 : 96 }]}>
          <TouchableOpacity
            style={styles.controlButton}
            onPress={() => sendToMap({ type: 'zoomBy', payload: { delta: 1 } })}
          >
            <MaterialCommunityIcons name="plus" size={24} color="#F8FAFC" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.controlButton}
            onPress={() => sendToMap({ type: 'zoomBy', payload: { delta: -1 } })}
          >
            <MaterialCommunityIcons name="minus" size={24} color="#F8FAFC" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.controlButton, { marginTop: 4 }]}
            onPress={handleMyLocation}
          >
            <MaterialCommunityIcons name="crosshairs-gps" size={22} color="#06B6D4" />
          </TouchableOpacity>
        </View>

        <SpeedIndicator />

        {route && !isNavigating && routeAlternatives.length > 1 && (
          <View style={[styles.routeChoicesWrap, { bottom: insets.bottom + 176 }]}>
            {routeAlternatives.map((candidate: RouteChoice) => {
              const active = candidate.id === route.id;
              return (
                <TouchableOpacity
                  key={candidate.id}
                  activeOpacity={0.86}
                  onPress={() => handleSelectRoute(candidate.id)}
                  style={[styles.routeChoicePill, active && styles.routeChoicePillActive]}
                >
                  <Text style={[styles.routeChoiceLabel, active && styles.routeChoiceLabelActive]} numberOfLines={1}>
                    {candidate.label}
                  </Text>
                  <Text style={styles.routeChoiceMeta} numberOfLines={1}>
                    {formatDistance(candidate.distance, unitSystem)} · {formatDuration(candidate.duration)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <NavigationPanel
          onStartNavigation={handleStartNavigation}
          onStopNavigation={handleStopNavigation}
          onToggleSavedDestination={activeDestinationResult ? () => handleToggleSaved(activeDestinationResult) : undefined}
          isSavedDestination={isActiveDestinationSaved}
          topOffset={Math.max(0, topChromeOffset - (insets.top + 8))}
        />

        {isRouting && (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        )}

        {!mapReady && !mapLoadError && (
          <View pointerEvents="none" style={styles.loadingOverlay}>
            <View style={styles.loadingChip}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={styles.loadingText}>Loading map…</Text>
            </View>
          </View>
        )}

        {mapLoadError && (
          <View pointerEvents="box-none" style={styles.errorOverlay}>
            <View style={styles.errorCard}>
              <Text style={styles.errorTitle}>Map could not load</Text>
              <Text style={styles.errorText} numberOfLines={3}>
                {mapLoadError}
              </Text>
              <TouchableOpacity onPress={handleRetryMapLoad} style={styles.retryButton}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* PREMIUM SAVE DESTINATION DIALOG MODAL */}
        <Modal
          visible={saveDialogVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setSaveDialogVisible(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.dialogCard}>
              <Text style={styles.dialogTitle}>Save destination</Text>
              <Text style={styles.dialogSubtitle} numberOfLines={1}>
                {saveDialogTarget?.name}
              </Text>
              
              <View style={styles.dialogActionsHorizontal}>
                {saveDialogTarget && savedDestinations.some(item => isSameSearchResult(item, saveDialogTarget)) ? (
                  <TouchableOpacity onPress={handleRemoveSaved} style={styles.dialogBtn}>
                    <Text style={[styles.dialogBtnText, styles.dialogBtnDangerText]}>REMOVE SAVED</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity onPress={handleSaveBookmarkDirect} style={styles.dialogBtn}>
                    <Text style={styles.dialogBtnText}>SAVE BOOKMARK</Text>
                  </TouchableOpacity>
                )}
                
                <TouchableOpacity onPress={handleOpenLabelDialog} style={styles.dialogBtn}>
                  <Text style={styles.dialogBtnText}>SET LABEL</Text>
                </TouchableOpacity>
                
                <TouchableOpacity onPress={() => setSaveDialogVisible(false)} style={styles.dialogBtn}>
                  <Text style={[styles.dialogBtnText, styles.dialogBtnCancelText]}>CANCEL</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* PREMIUM LABEL DESTINATION DIALOG MODAL */}
        <Modal
          visible={labelDialogVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setLabelDialogVisible(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.dialogCard}>
              <Text style={styles.dialogTitle}>Label destination</Text>
              <Text style={styles.dialogSubtitle} numberOfLines={1}>
                {saveDialogTarget?.name}
              </Text>
              
              <View style={styles.dialogActionsHorizontal}>
                <TouchableOpacity onPress={() => handleSavePresetDirect('Home')} style={styles.labelOptionBtn}>
                  <Text style={styles.labelOptionText}>HOME</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleSavePresetDirect('Work')} style={styles.labelOptionBtn}>
                  <Text style={styles.labelOptionText}>WORK</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleSavePresetDirect('School')} style={styles.labelOptionBtn}>
                  <Text style={styles.labelOptionText}>SCHOOL</Text>
                </TouchableOpacity>
              </View>
              
              <TouchableOpacity onPress={() => setLabelDialogVisible(false)} style={styles.labelCancelBtn}>
                <Text style={styles.labelCancelText}>CANCEL</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: '100%',
    height: '100%',
    alignSelf: 'stretch',
    backgroundColor: COLORS.bg,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: 'box-none',
  },
  customMapControls: {
    position: 'absolute',
    right: 16,
    zIndex: 30,
    gap: 8,
    alignItems: 'center',
  },
  controlButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderWidth: 1,
    borderColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  routeChoicesWrap: {
    position: 'absolute',
    left: 14,
    right: 78,
    zIndex: 32,
    flexDirection: 'row',
    gap: 8,
  },
  routeChoicePill: {
    flex: 1,
    minHeight: 52,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.86)',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.22)',
    justifyContent: 'center',
  },
  routeChoicePillActive: {
    backgroundColor: 'rgba(8, 61, 58, 0.94)',
    borderColor: 'rgba(84, 231, 221, 0.58)',
  },
  routeChoiceLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#CBD5E1',
  },
  routeChoiceLabelActive: {
    color: '#54E7DD',
  },
  routeChoiceMeta: {
    marginTop: 3,
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
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
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 118,
    zIndex: 49,
  },
  loadingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(15, 23, 42, 0.82)',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.2)',
  },
  loadingText: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '700',
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 120,
    zIndex: 50,
  },
  errorCard: {
    width: '86%',
    maxWidth: 360,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: 'rgba(15, 23, 42, 0.94)',
    borderWidth: 1,
    borderColor: 'rgba(251, 146, 60, 0.35)',
    shadowColor: '#000',
    shadowOpacity: 0.26,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  errorTitle: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 6,
  },
  errorText: {
    color: '#CBD5E1',
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 12,
  },
  retryButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: '#F97316',
  },
  retryButtonText: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '800',
  },
  welcome: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(5, 12, 24, 0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.76)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dialogCard: {
    width: '88%',
    borderRadius: 24,
    padding: 24,
    backgroundColor: 'rgba(15, 23, 42, 0.96)',
    borderWidth: 1,
    borderColor: 'rgba(88, 214, 216, 0.22)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  dialogTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 6,
    fontFamily: 'System',
  },
  dialogSubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    marginBottom: 24,
    fontFamily: 'System',
  },
  dialogActionsHorizontal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  dialogBtn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(84, 231, 221, 0.12)',
    borderWidth: 0.5,
    borderColor: 'rgba(84, 231, 221, 0.24)',
  },
  dialogBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#2DD4BF',
    fontFamily: 'System',
  },
  dialogBtnDangerText: {
    color: '#F87171',
  },
  dialogBtnCancelText: {
    color: '#94A3B8',
  },
  labelOptionBtn: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  labelOptionText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#E2E8F0',
    fontFamily: 'System',
  },
  labelCancelBtn: {
    marginTop: 14,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  labelCancelText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
    fontFamily: 'System',
  },
});
