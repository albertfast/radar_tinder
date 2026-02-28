import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AdBanner from '../../../../components/AdBanner';
import { LinearGradient } from 'expo-linear-gradient';
import { formatSpeed } from '../../../../utils/format';
import { GoogleMapsService } from '../../../../services/GoogleMapsService';
import { LocationService } from '../../../../services/LocationService';
import {
  describeRadarApproach,
  describeRadarLocation,
  formatRadarDistanceAdaptive,
  formatRadarLabel,
} from '../../utils/radarFormatters';

type RadarBasicTabProps = {
  currentSpeed: number;
  unitSystem: 'metric' | 'imperial';
  nearbyRadars: any[];
  tabBarInset: number;
  currentLocation?: {
    latitude: number;
    longitude: number;
  } | null;
};

export function RadarBasicTab({
  currentSpeed,
  unitSystem,
  nearbyRadars,
  tabBarInset,
  currentLocation,
}: RadarBasicTabProps) {
  const [speedLimit, setSpeedLimit] = useState<{ value: number; units: 'KPH' | 'MPH' } | null>(null);
  const [speedLimitSource, setSpeedLimitSource] = useState<'roads_api' | 'osm' | 'unknown' | null>(null);
  const lastSpeedLimitFetchAtRef = useRef(0);
  const lastSpeedLimitLocationRef = useRef<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    if (!currentLocation) return;
    const now = Date.now();
    const previous = lastSpeedLimitLocationRef.current;
    const movedMeters = previous
      ? LocationService.calculateDistanceSync(
          currentLocation.latitude,
          currentLocation.longitude,
          previous.latitude,
          previous.longitude
        ) * 1000
      : Number.POSITIVE_INFINITY;

    if (now - lastSpeedLimitFetchAtRef.current < 18000 && movedMeters < 90) {
      return;
    }

    let cancelled = false;
    lastSpeedLimitFetchAtRef.current = now;
    lastSpeedLimitLocationRef.current = {
      latitude: currentLocation.latitude,
      longitude: currentLocation.longitude,
    };

    (async () => {
      const result = await GoogleMapsService.getSpeedLimitForCoordinate(
        currentLocation.latitude,
        currentLocation.longitude
      );
      if (cancelled) return;
      if (!result || result.speedLimit <= 0) {
        setSpeedLimit(null);
        setSpeedLimitSource(result?.source || 'unknown');
        return;
      }
      setSpeedLimit({ value: result.speedLimit, units: result.units });
      setSpeedLimitSource(result.source);
    })();

    return () => {
      cancelled = true;
    };
  }, [currentLocation]);

  const sortedRadars = useMemo(
    () =>
      [...(Array.isArray(nearbyRadars) ? nearbyRadars : [])].sort(
        (a, b) => Number(a?.distance || 9999) - Number(b?.distance || 9999)
      ),
    [nearbyRadars]
  );
  const closestRadar = sortedRadars[0] || null;
  const radarCount = sortedRadars.length;
  const radarCountLabel = radarCount === 1 ? '1 radar' : `${radarCount} radars`;
  const displayRadars = sortedRadars.slice(0, 14);

  const speedParts = formatSpeed(currentSpeed, unitSystem).split(' ');
  const currentSpeedValue = Number(speedParts[0]) || 0;
  const currentSpeedUnit = speedParts[1] || (unitSystem === 'imperial' ? 'MPH' : 'KM/H');

  const limitDisplay = useMemo(() => {
    if (!speedLimit) return null;
    if (unitSystem === 'imperial') {
      return Math.round(speedLimit.units === 'MPH' ? speedLimit.value : speedLimit.value * 0.621371);
    }
    return Math.round(speedLimit.units === 'KPH' ? speedLimit.value : speedLimit.value * 1.60934);
  }, [speedLimit, unitSystem]);

  const speedDelta = limitDisplay ? currentSpeedValue - limitDisplay : null;
  const isOverspeed = typeof speedDelta === 'number' && speedDelta > 0;
  const speedTone = isOverspeed ? '#FF6B6B' : '#4ECDC4';

  const riskLabel = useMemo(() => {
    const distanceKm = Number(closestRadar?.distance);
    if (!Number.isFinite(distanceKm)) return 'Scanning';
    if (distanceKm <= 0.08) return 'Critical';
    if (distanceKm <= 0.35) return 'High';
    if (distanceKm <= 0.9) return 'Guarded';
    return 'Calm';
  }, [closestRadar?.distance]);

  const riskColor = useMemo(() => {
    switch (riskLabel) {
      case 'Critical':
        return '#FF5252';
      case 'High':
        return '#F97316';
      case 'Guarded':
        return '#FACC15';
      case 'Calm':
        return '#4ECDC4';
      default:
        return '#94A3B8';
    }
  }, [riskLabel]);

  const getCardAccent = (distanceKm: number) => {
    if (!Number.isFinite(distanceKm)) return '#334155';
    if (distanceKm <= 0.08) return '#FF5252';
    if (distanceKm <= 0.35) return '#F97316';
    if (distanceKm <= 0.9) return '#22D3EE';
    return '#4ECDC4';
  };

  const speedArcRotation = useMemo(() => {
    if (!limitDisplay || limitDisplay <= 0) {
      return Math.min(320, Math.max(25, currentSpeedValue * 2.2));
    }
    const ratio = Math.max(0.06, Math.min(1, currentSpeedValue / limitDisplay));
    return 35 + ratio * 290;
  }, [currentSpeedValue, limitDisplay]);

  const closestLocationDescriptor = useMemo(() => {
    const source = closestRadar?.locationHint || closestRadar?.locationLabel || '';
    return describeRadarLocation(source);
  }, [closestRadar?.locationHint, closestRadar?.locationLabel]);

  const speedLimitSubtitle = useMemo(() => {
    if (!limitDisplay) return 'No speed-limit feed yet';
    if (isOverspeed) {
      return `${Math.abs(speedDelta || 0)} ${currentSpeedUnit} over`;
    }
    if (typeof speedDelta === 'number') {
      return `${Math.abs(speedDelta)} ${currentSpeedUnit} buffer`;
    }
    return 'Within legal speed';
  }, [currentSpeedUnit, isOverspeed, limitDisplay, speedDelta]);

  const sourceLabel = useMemo(() => {
    switch (speedLimitSource) {
      case 'roads_api':
        return 'Roads API';
      case 'osm':
        return 'OSM';
      case 'unknown':
        return 'Unknown';
      default:
        return 'Live';
    }
  }, [speedLimitSource]);

  const statusLabel = closestRadar
    ? `${formatRadarDistanceAdaptive(Number(closestRadar.distance || 0), unitSystem)} to nearest`
    : 'No immediate cameras';

  const getRadarSubtitle = (radar: any) => {
    const approach = describeRadarApproach(Number(radar?.distance), unitSystem);
    const locationDescriptor = describeRadarLocation(radar?.locationHint || radar?.locationLabel || '');
    return locationDescriptor ? `${approach} • ${locationDescriptor}` : approach;
  };

  return (
    <ScrollView
      style={localStyles.screen}
      contentContainerStyle={[localStyles.content, { paddingBottom: tabBarInset + 28 }]}
      showsVerticalScrollIndicator={false}
      scrollEnabled
    >
      <View style={localStyles.topAd}>
        <AdBanner size="LARGE_BANNER" />
      </View>

      <LinearGradient
        colors={['rgba(6,12,25,0.96)', 'rgba(4,9,19,0.93)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={localStyles.dashboardCard}
      >
        <Text style={localStyles.eyebrow}>BASIC DASHBOARD</Text>

        <View style={localStyles.speedDialWrap}>
          <View style={localStyles.speedDialOuter}>
            <View style={localStyles.speedDialOrbit} />
            <View
              style={[
                localStyles.speedDialSweep,
                {
                  transform: [{ rotate: `${speedArcRotation}deg` }],
                },
              ]}
            />
            <View style={localStyles.speedDialInner}>
              <Text style={localStyles.speedValue}>{currentSpeedValue}</Text>
              <Text style={localStyles.speedUnit}>{currentSpeedUnit}</Text>
            </View>
          </View>
        </View>

        <View style={localStyles.pillRow}>
          <View style={localStyles.metaPill}>
            <MaterialCommunityIcons name="radar" size={16} color="#4ECDC4" />
            <Text style={localStyles.metaPillText}>{radarCountLabel}</Text>
          </View>
          <View style={localStyles.metaPill}>
            <View style={[localStyles.liveDot, { backgroundColor: riskColor }]} />
            <Text style={localStyles.metaPillText}>{riskLabel}</Text>
          </View>
          <View style={localStyles.metaPill}>
            <MaterialCommunityIcons name="map-marker-distance" size={16} color="#38BDF8" />
            <Text style={localStyles.metaPillText}>{statusLabel}</Text>
          </View>
        </View>

        <View style={localStyles.kpiRow}>
          <LinearGradient
            colors={['rgba(26,32,52,0.95)', 'rgba(11,16,30,0.95)']}
            style={localStyles.kpiCard}
          >
            <Text style={localStyles.kpiLabel}>Closest camera</Text>
            <Text style={localStyles.kpiValue}>
              {closestRadar
                ? formatRadarDistanceAdaptive(Number(closestRadar.distance || 0), unitSystem)
                : '—'}
            </Text>
            <Text style={localStyles.kpiHint} numberOfLines={2}>
              {closestLocationDescriptor || 'Waiting for location intelligence'}
            </Text>
          </LinearGradient>

          <LinearGradient
            colors={['rgba(36,22,32,0.95)', 'rgba(18,12,22,0.95)']}
            style={localStyles.kpiCard}
          >
            <Text style={localStyles.kpiLabel}>Threat level</Text>
            <Text style={[localStyles.kpiValue, { color: riskColor }]}>{riskLabel}</Text>
            <Text style={localStyles.kpiHint}>
              {closestRadar
                ? describeRadarApproach(Number(closestRadar.distance || 0), unitSystem)
                : 'No active threats in your lane'}
            </Text>
          </LinearGradient>
        </View>

        <LinearGradient
          colors={['rgba(9,22,32,0.95)', 'rgba(6,14,22,0.95)']}
          style={localStyles.limitPanel}
        >
          <View style={localStyles.limitHeaderRow}>
            <Text style={localStyles.limitTitle}>SPEED LIMIT BOARD</Text>
            <View style={localStyles.limitSourceChip}>
              <Text style={localStyles.limitSourceText}>{sourceLabel}</Text>
            </View>
          </View>
          <View style={localStyles.limitBody}>
            <View style={localStyles.limitSign}>
              <Text style={localStyles.limitSignTop}>LIMIT</Text>
              <Text style={[localStyles.limitSignValue, { color: speedTone }]}>
                {limitDisplay ?? '--'}
              </Text>
              <Text style={localStyles.limitSignUnit}>{currentSpeedUnit}</Text>
            </View>
            <View style={localStyles.limitCopy}>
              <Text style={[localStyles.limitStatus, { color: speedTone }]}>
                {isOverspeed ? 'Reduce speed now' : 'Stable driving pace'}
              </Text>
              <Text style={localStyles.limitSub}>{speedLimitSubtitle}</Text>
            </View>
          </View>
        </LinearGradient>
      </LinearGradient>

      <View style={localStyles.listSection}>
        <View style={localStyles.listHeader}>
          <Text style={localStyles.listTitle}>NEARBY CAMERAS</Text>
          <View style={localStyles.listCount}>
            <Text style={localStyles.listCountText}>{displayRadars.length}</Text>
          </View>
        </View>

        {displayRadars.length > 0 ? (
          displayRadars.map((radar, index) => {
            const distanceKm = Number(radar?.distance || 0);
            const accent = getCardAccent(distanceKm);
            return (
              <LinearGradient
                key={radar?.id || `radar-${index}`}
                colors={['rgba(12,18,30,0.94)', 'rgba(9,14,26,0.94)']}
                style={[localStyles.radarCard, { borderColor: `${accent}44` }]}
              >
                <View style={localStyles.radarIconWrap}>
                  <MaterialCommunityIcons
                    name={radar?.type === 'police' ? 'alarm-light' : 'camera-outline'}
                    size={20}
                    color={accent}
                  />
                </View>
                <View style={localStyles.radarCopy}>
                  <Text style={localStyles.radarTitle}>{formatRadarLabel(radar?.type)}</Text>
                  <Text style={localStyles.radarSubtitle} numberOfLines={2}>
                    {getRadarSubtitle(radar)}
                  </Text>
                </View>
                <View style={[localStyles.radarDistanceBadge, { backgroundColor: `${accent}24` }]}>
                  <Text style={[localStyles.radarDistanceText, { color: accent }]}>
                    {formatRadarDistanceAdaptive(distanceKm, unitSystem)}
                  </Text>
                </View>
              </LinearGradient>
            );
          })
        ) : (
          <View style={localStyles.emptyState}>
            <MaterialCommunityIcons name="radar" size={24} color="#4ECDC4" />
            <Text style={localStyles.emptyStateText}>Scanning nearby roads for cameras...</Text>
          </View>
        )}
      </View>

      <View style={localStyles.bottomAd}>
        <AdBanner size="MEDIUM_RECTANGLE" />
      </View>
    </ScrollView>
  );
}

export type { RadarBasicTabProps };

const localStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#020617',
  },
  content: {
    paddingHorizontal: 14,
    paddingTop: 12,
    gap: 12,
  },
  topAd: {
    alignItems: 'center',
    marginBottom: 4,
  },
  dashboardCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(78,205,196,0.18)',
    paddingHorizontal: 14,
    paddingVertical: 14,
    overflow: 'hidden',
    gap: 12,
  },
  eyebrow: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  speedDialWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  speedDialOuter: {
    width: 258,
    height: 258,
    borderRadius: 129,
    borderWidth: 1,
    borderColor: 'rgba(78,205,196,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(3,10,24,0.84)',
  },
  speedDialOrbit: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.2)',
  },
  speedDialSweep: {
    position: 'absolute',
    width: 122,
    height: 4,
    backgroundColor: '#4ECDC4',
    borderRadius: 3,
    top: 127,
    left: 129,
    opacity: 0.75,
  },
  speedDialInner: {
    width: 176,
    height: 176,
    borderRadius: 88,
    borderWidth: 4,
    borderColor: 'rgba(78,205,196,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(6,13,28,0.95)',
  },
  speedValue: {
    color: 'white',
    fontSize: 58,
    fontWeight: '900',
    lineHeight: 62,
  },
  speedUnit: {
    color: '#94A3B8',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 4,
    letterSpacing: 1,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.26)',
    backgroundColor: 'rgba(10,18,35,0.75)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  metaPillText: {
    color: '#E2E8F0',
    fontSize: 11,
    fontWeight: '700',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 10,
  },
  kpiCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.22)',
    paddingHorizontal: 11,
    paddingVertical: 10,
    minHeight: 98,
  },
  kpiLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  kpiValue: {
    color: '#F8FAFC',
    fontSize: 24,
    fontWeight: '900',
    marginTop: 4,
  },
  kpiHint: {
    color: '#CBD5E1',
    fontSize: 11,
    marginTop: 4,
  },
  limitPanel: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.24)',
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 9,
  },
  limitHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  limitTitle: {
    color: '#67E8F9',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  limitSourceChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.25)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    backgroundColor: 'rgba(15,23,42,0.8)',
  },
  limitSourceText: {
    color: '#CBD5E1',
    fontSize: 10,
    fontWeight: '700',
  },
  limitBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  limitSign: {
    width: 102,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    backgroundColor: 'rgba(255,255,255,0.94)',
    paddingVertical: 8,
    alignItems: 'center',
  },
  limitSignTop: {
    color: '#0F172A',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  limitSignValue: {
    color: '#0F172A',
    fontSize: 32,
    fontWeight: '900',
    lineHeight: 36,
    marginTop: 2,
  },
  limitSignUnit: {
    color: '#334155',
    fontSize: 11,
    fontWeight: '800',
    marginTop: -1,
  },
  limitCopy: {
    flex: 1,
  },
  limitStatus: {
    fontSize: 17,
    fontWeight: '800',
  },
  limitSub: {
    color: '#CBD5E1',
    fontSize: 12,
    marginTop: 3,
    fontWeight: '600',
  },
  listSection: {
    gap: 9,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    marginTop: 2,
  },
  listTitle: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  listCount: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(30,41,59,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.24)',
    paddingHorizontal: 8,
  },
  listCountText: {
    color: '#E2E8F0',
    fontWeight: '800',
    fontSize: 12,
  },
  radarCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  radarIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  radarCopy: {
    flex: 1,
  },
  radarTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '800',
  },
  radarSubtitle: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
    lineHeight: 16,
  },
  radarDistanceBadge: {
    borderRadius: 11,
    paddingHorizontal: 10,
    paddingVertical: 7,
    minWidth: 74,
    alignItems: 'center',
  },
  radarDistanceText: {
    fontSize: 16,
    fontWeight: '900',
  },
  emptyState: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(78,205,196,0.24)',
    backgroundColor: 'rgba(7,14,28,0.88)',
    paddingVertical: 16,
    alignItems: 'center',
    gap: 8,
  },
  emptyStateText: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '600',
  },
  bottomAd: {
    alignItems: 'center',
    marginTop: 6,
  },
});
