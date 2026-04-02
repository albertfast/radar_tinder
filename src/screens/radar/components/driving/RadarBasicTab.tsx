import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigationStore } from '../../../../mapflow-navigation-kit';
import { LocationService } from '../../../../services/LocationService';
import { formatDistance, formatDuration, convertSpeed, getUnitLabel } from '../../../../mapflow-navigation-kit/src/utils/units';
import {
  describeRadarApproach,
  describeRadarLocation,
  formatRadarDistanceAdaptive,
  formatRadarLabel,
} from '../../utils/radarFormatters';

type RadarBasicTabProps = {
  nearbyRadars: any[];
  topContentInset: number;
  bottomContentInset: number;
  unitSystem: 'metric' | 'imperial';
};

const getTurnIcon = (type?: string, modifier?: string) => {
  switch (type) {
    case 'turn':
      switch (modifier) {
        case 'left':
        case 'slight left':
        case 'sharp left':
          return 'arrow-top-left';
        case 'right':
        case 'slight right':
        case 'sharp right':
          return 'arrow-top-right';
        case 'uturn':
          return 'backup-restore';
        default:
          return 'arrow-up';
      }
    case 'merge':
    case 'fork':
    case 'on ramp':
    case 'off ramp':
      return 'call-merge';
    case 'roundabout':
    case 'rotary':
      return 'rotate-right';
    case 'arrive':
      return 'flag-checkered';
    case 'continue':
    case 'depart':
    default:
      return 'arrow-up';
  }
};

export function RadarBasicTab({
  nearbyRadars,
  topContentInset,
  bottomContentInset,
  unitSystem,
}: RadarBasicTabProps) {
  const {
    userSpeed,
    speedLimit,
    route,
    isNavigating,
    currentStepIndex,
    remainingStepDistance,
    remainingDistance,
    remainingDuration,
    eta,
    destinationName,
    hasArrived,
    startNavigation,
    stopNavigation,
  } = useNavigationStore();
  const [resolvedLabels, setResolvedLabels] = useState<Record<string, string>>({});

  // Lazy reverse-geocoding for radars without labels
  useEffect(() => {
    if (!nearbyRadars || nearbyRadars.length === 0) return;

    const resolveVisible = async () => {
      // Prioritize closest 5 radars that don't have a label yet
      const targets = nearbyRadars
        .filter((r) => !r.locationLabel && !resolvedLabels[r.id])
        .slice(0, 5);

      if (targets.length === 0) return;

      for (const radar of targets) {
        try {
          const addresses = await LocationService.reverseGeocode(
            radar.latitude,
            radar.longitude
          );
          if (addresses && addresses[0]) {
            const addr = addresses[0];
            const streetNumber = addr.streetNumber || (addr.name && addr.name !== addr.street ? addr.name : '');
            const streetLine = streetNumber && addr.street
              ? `${streetNumber} ${addr.street}`
              : (addr.name || addr.street || '');
            const label = [streetLine, addr.city || addr.subregion]
              .filter(Boolean)
              .join(', ');
            if (label) {
              setResolvedLabels((prev) => ({ ...prev, [radar.id]: label }));
            }
          }
        } catch (err) {
          console.warn('[RadarBasicTab] Reverse geocode failed for radar:', radar.id);
        }
      }
    };

    resolveVisible();
  }, [nearbyRadars, resolvedLabels]);

  const sortedRadars = useMemo(
    () =>
      [...(Array.isArray(nearbyRadars) ? nearbyRadars : [])].sort(
        (left, right) => Number(left?.distance || 9999) - Number(right?.distance || 9999),
      ),
    [nearbyRadars],
  );
  const closestRadar = sortedRadars[0] || null;
  const displayRadars = sortedRadars.slice(0, 14);
  const currentSpeedValue = convertSpeed(userSpeed, unitSystem);
  const currentSpeedUnit = getUnitLabel(unitSystem).toUpperCase();
  const limitDisplay =
    typeof speedLimit === 'number' && speedLimit > 0
      ? unitSystem === 'imperial'
        ? Math.round(speedLimit * 0.621371)
        : Math.round(speedLimit)
      : null;
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
  const speedArcRotation = useMemo(() => {
    if (!limitDisplay || limitDisplay <= 0) {
      return Math.min(320, Math.max(25, currentSpeedValue * 2.2));
    }
    const ratio = Math.max(0.06, Math.min(1, currentSpeedValue / limitDisplay));
    return 35 + ratio * 290;
  }, [currentSpeedValue, limitDisplay]);
  const currentStep = route?.steps?.[currentStepIndex] || route?.steps?.[0] || null;
  const nextStep = route?.steps?.[currentStepIndex + 1] || null;
  const routeDistanceLabel = route ? formatDistance(route.distance, unitSystem) : '';
  const routeDurationLabel = route ? formatDuration(route.duration) : '';
  const turnDistanceLabel =
    hasArrived
      ? 'Destination reached'
      : formatDistance(remainingStepDistance || currentStep?.distance || 0, unitSystem);
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
  const closestLocationDescriptor = useMemo(
    () => describeRadarLocation(closestRadar?.locationLabel || resolvedLabels[closestRadar?.id] || closestRadar?.locationHint || ''),
    [closestRadar?.locationLabel, closestRadar?.id, closestRadar?.locationHint, resolvedLabels],
  );

  const getCardAccent = (distanceKm: number) => {
    if (!Number.isFinite(distanceKm)) return '#334155';
    if (distanceKm <= 0.08) return '#FF5252';
    if (distanceKm <= 0.35) return '#F97316';
    if (distanceKm <= 0.9) return '#22D3EE';
    return '#4ECDC4';
  };

  const getRadarSubtitle = (radar: any) => {
    const approach = describeRadarApproach(Number(radar?.distance), unitSystem);
    const label = radar?.locationLabel || resolvedLabels[radar?.id] || radar?.locationHint || '';
    const locationDescriptor = describeRadarLocation(label);
    return locationDescriptor ? `${approach} | ${locationDescriptor}` : approach;
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: topContentInset + 12,
          paddingBottom: bottomContentInset + 28,
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {route ? (
        <LinearGradient
          colors={['rgba(15,22,42,0.96)', 'rgba(8,13,28,0.96)']}
          style={styles.navCard}
        >
          <View style={styles.navCardRow}>
            <View style={styles.navIconWrap}>
              <MaterialCommunityIcons
                name={getTurnIcon(currentStep?.maneuver?.type, currentStep?.maneuver?.modifier) as any}
                size={20}
                color="#F8FAFC"
              />
            </View>
            <View style={styles.navCopy}>
              <Text style={styles.navDistance}>{isNavigating ? turnDistanceLabel : routeDistanceLabel}</Text>
              <Text style={styles.navInstruction} numberOfLines={1}>
                {hasArrived
                  ? 'You have arrived'
                  : isNavigating
                    ? currentStep?.instruction || destinationName || 'Continue on route'
                    : destinationName || 'Route ready'}
              </Text>
              {!hasArrived ? (
                <Text style={styles.navSubtext} numberOfLines={1}>
                  {isNavigating
                    ? nextStep?.instruction
                      ? `Then ${nextStep.instruction}`
                      : `${formatDistance(remainingDistance, unitSystem)} | ${formatDuration(remainingDuration)}`
                    : `${routeDurationLabel}${eta ? ` | ETA ${eta.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}`}
                </Text>
              ) : null}
            </View>
            {isNavigating || hasArrived ? (
              <TouchableOpacity onPress={stopNavigation} style={styles.navActionDanger} activeOpacity={0.85}>
                <MaterialCommunityIcons name={hasArrived ? 'flag-checkered' : 'close'} size={18} color="#FB7185" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={startNavigation} style={styles.navActionPrimary} activeOpacity={0.88}>
                <Text style={styles.navActionPrimaryText}>GO</Text>
              </TouchableOpacity>
            )}
          </View>
        </LinearGradient>
      ) : null}

      <LinearGradient
        colors={['rgba(6,12,25,0.96)', 'rgba(4,9,19,0.93)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.dashboardCard}
      >
        <Text style={styles.eyebrow}>BASIC DASHBOARD</Text>

        <View style={styles.speedDialWrap}>
          <View style={styles.speedDialOuter}>
            <View style={styles.speedDialOrbit} />
            <View
              style={[
                styles.speedDialSweep,
                {
                  transform: [{ rotate: `${speedArcRotation}deg` }],
                },
              ]}
            />
            <View style={styles.speedDialInner}>
              <Text style={styles.speedValue}>{currentSpeedValue}</Text>
              <Text style={styles.speedUnit}>{currentSpeedUnit}</Text>
            </View>
          </View>
        </View>

        <View style={styles.pillRow}>
          <View style={styles.metaPill}>
            <MaterialCommunityIcons name="radar" size={16} color="#4ECDC4" />
            <Text style={styles.metaPillText}>
              {sortedRadars.length === 1 ? '1 radar' : `${sortedRadars.length} radars`}
            </Text>
          </View>
          <View style={styles.metaPill}>
            <View style={[styles.liveDot, { backgroundColor: riskColor }]} />
            <Text style={styles.metaPillText}>{riskLabel}</Text>
          </View>
          <View style={styles.metaPill}>
            <MaterialCommunityIcons name="map-marker-distance" size={16} color="#38BDF8" />
            <Text style={styles.metaPillText}>
              {closestRadar
                ? `${formatRadarDistanceAdaptive(Number(closestRadar.distance || 0), unitSystem)} to nearest`
                : 'No immediate cameras'}
            </Text>
          </View>
        </View>

        <View style={styles.kpiRow}>
          <LinearGradient
            colors={['rgba(26,32,52,0.95)', 'rgba(11,16,30,0.95)']}
            style={styles.kpiCard}
          >
            <Text style={styles.kpiLabel}>Closest camera</Text>
            <Text style={styles.kpiValue}>
              {closestRadar
                ? formatRadarDistanceAdaptive(Number(closestRadar.distance || 0), unitSystem)
                : '--'}
            </Text>
            <Text style={styles.kpiHint} numberOfLines={2}>
              {closestLocationDescriptor || 'Waiting for location intelligence'}
            </Text>
          </LinearGradient>

          <LinearGradient
            colors={['rgba(36,22,32,0.95)', 'rgba(18,12,22,0.95)']}
            style={styles.kpiCard}
          >
            <Text style={styles.kpiLabel}>Threat level</Text>
            <Text style={[styles.kpiValue, { color: riskColor }]}>{riskLabel}</Text>
            <Text style={styles.kpiHint}>
              {closestRadar
                ? describeRadarApproach(Number(closestRadar.distance || 0), unitSystem)
                : 'No active threats in your lane'}
            </Text>
          </LinearGradient>
        </View>

        <LinearGradient
          colors={['rgba(9,22,32,0.95)', 'rgba(6,14,22,0.95)']}
          style={styles.limitPanel}
        >
          <View style={styles.limitHeaderRow}>
            <Text style={styles.limitTitle}>SPEED LIMIT BOARD</Text>
            <View style={styles.limitSourceChip}>
              <Text style={styles.limitSourceText}>{limitDisplay ? 'Live' : 'Waiting'}</Text>
            </View>
          </View>
          <View style={styles.limitBody}>
            <View style={styles.limitSign}>
              <Text style={styles.limitSignTop}>LIMIT</Text>
              <Text style={[styles.limitSignValue, { color: speedTone }]}>{limitDisplay ?? '--'}</Text>
              <Text style={styles.limitSignUnit}>{currentSpeedUnit}</Text>
            </View>
            <View style={styles.limitCopy}>
              <Text style={[styles.limitStatus, { color: speedTone }]}>
                {isOverspeed ? 'Reduce speed now' : 'Stable driving pace'}
              </Text>
              <Text style={styles.limitSub}>{speedLimitSubtitle}</Text>
            </View>
          </View>
        </LinearGradient>
      </LinearGradient>

      <View style={styles.listSection}>
        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>NEARBY CAMERAS</Text>
          <View style={styles.listCount}>
            <Text style={styles.listCountText}>{displayRadars.length}</Text>
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
                style={[styles.radarCard, { borderColor: `${accent}44` }]}
              >
                <View style={styles.radarIconWrap}>
                  <MaterialCommunityIcons
                    name={radar?.type === 'police' ? 'alarm-light' : radar?.type === 'red_light' ? 'traffic-light' : 'camera-outline'}
                    size={20}
                    color={accent}
                  />
                </View>
                <View style={styles.radarCopy}>
                  <Text style={styles.radarTitle}>{formatRadarLabel(radar?.type)}</Text>
                  <Text style={styles.radarSubtitle} numberOfLines={2}>
                    {getRadarSubtitle(radar)}
                  </Text>
                </View>
                <View style={[styles.radarDistanceBadge, { backgroundColor: `${accent}24` }]}>
                  <Text style={[styles.radarDistanceText, { color: accent }]}>
                    {formatRadarDistanceAdaptive(distanceKm, unitSystem)}
                  </Text>
                </View>
              </LinearGradient>
            );
          })
        ) : (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="radar" size={24} color="#4ECDC4" />
            <Text style={styles.emptyStateText}>Scanning nearby roads for cameras...</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#020617',
  },
  content: {
    paddingHorizontal: 14,
    gap: 12,
  },
  navCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.22)',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  navCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  navIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(51,65,85,0.6)',
  },
  navCopy: {
    flex: 1,
  },
  navDistance: {
    color: '#38BDF8',
    fontSize: 14,
    fontWeight: '800',
  },
  navInstruction: {
    color: '#F8FAFC',
    fontSize: 22,
    fontWeight: '900',
    marginTop: 2,
  },
  navSubtext: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 4,
  },
  navActionPrimary: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#2563EB',
  },
  navActionPrimaryText: {
    color: '#F8FAFC',
    fontWeight: '900',
    fontSize: 13,
  },
  navActionDanger: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(127,29,29,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(251,113,133,0.22)',
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
    color: '#FFFFFF',
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
});
