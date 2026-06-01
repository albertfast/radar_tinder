import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigationStore } from '../../../../mapflow-navigation-kit';
import { LocationService } from '../../../../services/LocationService';
import { SpeedometerAnimation } from '../../../../components/SpeedometerAnimation';
import { formatDistance, formatDuration, convertSpeed, getUnitLabel, getUnitSystem } from '../../../../mapflow-navigation-kit/src/utils/units';
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
    countryCode,
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
  const displayUnitSystem = useMemo(
    () => (countryCode ? getUnitSystem(countryCode.toUpperCase()) : unitSystem),
    [countryCode, unitSystem],
  );
  const currentSpeedValue = convertSpeed(userSpeed, displayUnitSystem);
  const currentSpeedUnit = getUnitLabel(displayUnitSystem).toUpperCase();
  const limitDisplay =
    typeof speedLimit === 'number' && speedLimit > 0
      ? displayUnitSystem === 'imperial'
        ? Math.round(speedLimit * 0.621371)
        : Math.round(speedLimit)
      : null;
  const speedDelta = limitDisplay ? currentSpeedValue - limitDisplay : null;
  const isOverspeed = typeof speedDelta === 'number' && speedDelta > 0;
  const speedRatio = limitDisplay ? currentSpeedValue / limitDisplay : 0;
  const isCriticalOverspeed = Boolean(limitDisplay && speedRatio > 1.2);
  const speedTone = isCriticalOverspeed ? '#FF4D5F' : isOverspeed ? '#FACC15' : '#4ECDC4';
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
  const currentStep = route?.steps?.[currentStepIndex] || route?.steps?.[0] || null;
  const nextStep = route?.steps?.[currentStepIndex + 1] || null;
  const routeDistanceLabel = route ? formatDistance(route.distance, displayUnitSystem) : '';
  const routeDurationLabel = route ? formatDuration(route.duration) : '';
  const turnDistanceLabel =
    hasArrived
      ? 'Destination reached'
      : formatDistance(remainingStepDistance || currentStep?.distance || 0, displayUnitSystem);
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
    const approach = describeRadarApproach(Number(radar?.distance), displayUnitSystem);
    const label = radar?.locationLabel || resolvedLabels[radar?.id] || radar?.locationHint || '';
    const locationDescriptor = describeRadarLocation(label);
    return locationDescriptor ? `${locationDescriptor} • ${approach}` : approach;
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
                      : `${formatDistance(remainingDistance, displayUnitSystem)} | ${formatDuration(remainingDuration)}`
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
        colors={['rgba(8,13,28,0.98)', 'rgba(2,6,23,0.98)']}
        style={styles.speedModule}
      >
        <View style={styles.speedometerContainer}>
          <View style={[styles.speedAura, { borderColor: `${speedTone}22` }]} />
          <SpeedometerAnimation
            speed={currentSpeedValue}
            unitSystem={displayUnitSystem}
            speedLimit={limitDisplay}
            size={286}
            showDigitalReadout={false}
            style={styles.speedometer3d}
          />

          <View style={styles.speedReadout}>
            <Text style={[styles.speedValue, { color: speedTone }]}>
              {currentSpeedValue}
            </Text>
            <Text style={styles.speedUnit}>{currentSpeedUnit}</Text>
          </View>
        </View>

        <View style={styles.limitStatusRow}>
          <View style={styles.limitPill}>
            <Text style={styles.limitLabel}>LIMIT</Text>
            <Text style={[styles.limitValue, { color: speedTone }]}>
              {limitDisplay ?? '--'}
            </Text>
          </View>
          <Text style={styles.limitSubtitle} numberOfLines={1}>
            {speedLimitSubtitle}
          </Text>
        </View>
      </LinearGradient>

      {/* Modern Dashboard Pill Row */}
      <View style={styles.pillRow}>
        <View style={styles.metaPill}>
          <MaterialCommunityIcons name="radar" size={16} color="#38BDF8" />
          <Text style={styles.metaPillText}>
            {sortedRadars.length === 1 ? '1 on route' : `${sortedRadars.length} on route`}
          </Text>
        </View>
        <View style={styles.metaPill}>
          <View style={[styles.liveDot, { backgroundColor: riskColor }]} />
          <Text style={styles.metaPillText}>{riskLabel}</Text>
        </View>
      </View>

      {/* Upcoming Radars Section matching mockup exactly */}
      <View style={styles.listSection}>
        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>UPCOMING ROUTE RADARS</Text>
          <View style={styles.listCount}>
            <Text style={styles.listCountText}>{displayRadars.length}</Text>
          </View>
        </View>

        {displayRadars.length > 0 ? (
          displayRadars.map((radar, index) => {
            const distanceKm = Number(radar?.distance || 0);
            const accent = getCardAccent(distanceKm);

            return (
              <View
                key={radar?.id || `radar-${index}`}
                style={styles.radarCard}
              >
                {/* Custom Left Accent Border Stripe */}
                <View style={[styles.radarCardAccentBar, { backgroundColor: accent }]} />
                
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
                <View style={[styles.radarDistanceBadge, { backgroundColor: `${accent}16` }]}>
                  <Text style={[styles.radarDistanceText, { color: accent }]}>
                    {formatRadarDistanceAdaptive(distanceKm, displayUnitSystem)}
                  </Text>
                </View>
              </View>
            );
          })
        ) : (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="radar" size={24} color="#38BDF8" />
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
    gap: 14,
  },
  navCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.22)',
    paddingHorizontal: 14,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
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
  speedModule: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
    paddingBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 4,
  },
  speedometerContainer: {
    width: 292,
    height: 292,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  speedAura: {
    position: 'absolute',
    width: 268,
    height: 268,
    borderRadius: 22,
    borderWidth: 1,
    backgroundColor: 'rgba(8, 13, 28, 0.36)',
    shadowColor: '#22D3EE',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 3,
  },
  speedometer3d: {
    borderRadius: 22,
    backgroundColor: 'transparent',
  },
  speedReadout: {
    position: 'absolute',
    bottom: 30,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 104,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 7,
    backgroundColor: 'rgba(2, 6, 23, 0.82)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.16)',
  },
  speedValue: {
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 27,
    fontFamily: 'System',
  },
  speedUnit: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    marginTop: 1,
  },
  limitStatusRow: {
    width: '100%',
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  limitPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(148,163,184,0.16)',
    backgroundColor: 'rgba(15, 23, 42, 0.94)',
    paddingHorizontal: 18,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  limitLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  limitValue: {
    fontSize: 15,
    fontWeight: '900',
    fontFamily: 'System',
  },
  limitSubtitle: {
    flexShrink: 1,
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
  },
  pillRow: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: -2,
    marginBottom: 8,
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.18)',
    backgroundColor: 'rgba(15, 23, 42, 0.44)',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  metaPillText: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '800',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  listSection: {
    gap: 12,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginTop: 6,
  },
  listTitle: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '900',
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
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.06)',
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  radarCardAccentBar: {
    position: 'absolute',
    left: 0,
    top: 14,
    bottom: 14,
    width: 3.5,
    borderRadius: 2,
  },
  radarIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    marginLeft: 4,
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
    fontSize: 12,
    marginTop: 3,
    lineHeight: 16,
  },
  radarDistanceBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 70,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarDistanceText: {
    fontSize: 13,
    fontWeight: '900',
  },
  emptyState: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.2)',
    backgroundColor: 'rgba(7,14,28,0.88)',
    paddingVertical: 24,
    alignItems: 'center',
    gap: 8,
  },
  emptyStateText: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '600',
  },
});
