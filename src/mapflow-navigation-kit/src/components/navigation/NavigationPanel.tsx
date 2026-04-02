import React, { memo } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS } from '../../utils/colors';
import { useNavigationStore } from '../../stores/navigationStore';
import { RouteStep } from '../../types/map';
import { formatDistance, formatDuration } from '../../utils/units';

function getTurnIcon(type: string, modifier?: string) {
  switch (type) {
    case 'turn':
      switch (modifier) {
        case 'left': return 'turn-left';
        case 'right': return 'turn-right';
        case 'slight left': return 'turn-left';
        case 'slight right': return 'turn-right';
        case 'sharp left': return 'turn-left';
        case 'sharp right': return 'turn-right';
        case 'uturn': return 'u-turn-left';
        default: return 'north';
      }
    case 'new name':
    case 'continue':
    case 'merge':
    case 'depart':
      return 'north';
    case 'on ramp':
    case 'off ramp':
    case 'fork':
      return 'merge-type';
    case 'roundabout':
    case 'rotary':
      return 'roundabout-right';
    case 'arrive':
      return 'location-on';
    default:
      return 'north';
  }
}

function isGenericStep(step?: RouteStep): boolean {
  if (!step) {
    return true;
  }

  const roadName = `${step.name || ''} ${step.ref || ''}`.trim();
  return step.maneuver.type === 'depart' && !roadName && /^(Head|Start)/i.test(step.instruction);
}

function getMeaningfulStepIndex(steps: RouteStep[], startIndex: number): number {
  for (let index = startIndex; index < steps.length; index += 1) {
    if (!isGenericStep(steps[index])) {
      return index;
    }
  }

  return startIndex;
}

interface NavigationPanelProps {
  onStartNavigation: () => void;
  onStopNavigation: () => void;
}

export default memo(function NavigationPanel({ onStartNavigation, onStopNavigation }: NavigationPanelProps) {
  const insets = useSafeAreaInsets();
  const {
    route,
    isNavigating,
    currentStepIndex,
    remainingStepDistance,
    remainingDistance,
    remainingDuration,
    eta,
    destinationName,
    unitSystem,
    hasArrived,
  } = useNavigationStore();

  if (route && !isNavigating) {
    const displayDist = formatDistance(route.distance, unitSystem);
    const displayTime = formatDuration(route.duration);
    const previewSteps = route.steps.filter((step, index) => !(index === 0 && isGenericStep(step))).slice(0, 2);

    return (
      <View style={[styles.previewContainer, { marginBottom: insets.bottom + 14 }]}>
        <View style={styles.previewHeader}>
          <View style={styles.previewHeaderText}>
            <Text style={styles.previewTitle} numberOfLines={1}>{destinationName}</Text>
            <View style={styles.previewStats}>
              <MaterialIcons name="straighten" size={16} color={COLORS.primary} />
              <Text style={styles.previewStatText}>{displayDist}</Text>
              <Text style={styles.previewStatSep}>·</Text>
              <Text style={styles.previewStatText}>{displayTime}</Text>
              {eta && (
                <>
                  <Text style={styles.previewStatSep}>·</Text>
                  <Text style={styles.previewStatText}>
                    ETA {eta.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </Text>
                </>
              )}
            </View>
          </View>
          <TouchableOpacity onPress={onStopNavigation} style={styles.closeBtn} activeOpacity={0.85}>
            <MaterialIcons name="close" size={22} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.stepsContainer}>
          <FlatList
            data={previewSteps}
            keyExtractor={(_, index) => `preview-step-${index}`}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }: { item: RouteStep }) => (
              <View style={styles.stepItem}>
                <View style={styles.stepIcon}>
                  <MaterialIcons name={getTurnIcon(item.maneuver.type, item.maneuver.modifier) as any} size={19} color={COLORS.primary} />
                </View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepInstruction} numberOfLines={1}>{item.instruction}</Text>
                  <Text style={styles.stepDistance}>{formatDistance(item.distance, unitSystem)}</Text>
                </View>
                <MaterialIcons name="chevron-right" size={16} color={COLORS.textMuted} />
              </View>
            )}
          />
          {route.steps.length > previewSteps.length && (
            <Text style={styles.moreSteps}>+{route.steps.length - previewSteps.length} more steps</Text>
          )}
        </View>

        <View style={styles.startBtnContainer}>
          <TouchableOpacity onPress={onStartNavigation} style={styles.startBtn} activeOpacity={0.9}>
            <MaterialIcons name="navigation" size={20} color={COLORS.bg} />
            <Text style={styles.startBtnText}>Start Navigation</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (isNavigating && route) {
    const displayStepIndex = getMeaningfulStepIndex(route.steps, currentStepIndex);
    const currentStep = route.steps[displayStepIndex] || route.steps[currentStepIndex] || route.steps[0];
    const nextStep = route.steps[displayStepIndex + 1];
    const turnDistanceMeters =
      displayStepIndex === currentStepIndex
        ? remainingStepDistance || currentStep?.distance || 0
        : currentStep?.distance || 0;

    return (
      <>
        <View style={[styles.turnBanner, { top: 14 }]}>
          <View style={styles.turnIconWrap}>
            <MaterialIcons
              name={(hasArrived ? 'location-on' : getTurnIcon(currentStep?.maneuver.type || 'continue', currentStep?.maneuver.modifier)) as any}
              size={24}
              color={COLORS.text}
            />
          </View>
          <View style={styles.turnTextWrap}>
            <Text style={styles.turnDistance}>
              {hasArrived ? 'Destination reached' : formatDistance(turnDistanceMeters, unitSystem)}
            </Text>
            <Text style={styles.turnInstruction} numberOfLines={1}>
              {hasArrived ? 'You have arrived' : currentStep?.instruction || 'Proceed on route'}
            </Text>
            {!hasArrived && nextStep && (
              <Text style={styles.turnNext} numberOfLines={1}>
                Then {nextStep.instruction}
              </Text>
            )}
          </View>
        </View>

        <View style={[styles.navContainer, { marginBottom: insets.bottom + 14 }]}>
          <View style={styles.summaryHeader}>
            <View style={styles.summaryCopy}>
              <Text style={styles.summaryTitle} numberOfLines={1}>
                {hasArrived
                  ? 'Arrived at destination'
                  : `${formatDistance(remainingDistance, unitSystem)} · ${formatDuration(remainingDuration)}`}
              </Text>
              <Text style={styles.summarySub} numberOfLines={1}>
                {destinationName || 'Navigation in progress'}
              </Text>
            </View>
            <View style={styles.summaryActions}>
              <View style={styles.arrivalWrap}>
                <Text style={styles.arrivalTime}>
                  {eta ? eta.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '--:--'}
                </Text>
                <Text style={styles.arrivalLabel}>{hasArrived ? 'Arrived' : 'Arrival'}</Text>
              </View>
              {hasArrived ? (
                <TouchableOpacity onPress={onStopNavigation} style={styles.endTripBtn} activeOpacity={0.85}>
                  <Text style={styles.endTripText}>End Trip</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={onStopNavigation} style={styles.exitBtn} activeOpacity={0.85}>
                  <MaterialIcons name="close" size={18} color={COLORS.danger} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </>
    );
  }

  return null;
});

const styles = StyleSheet.create({
  previewContainer: {
    position: 'absolute',
    bottom: 0,
    left: 14,
    right: 78,
    zIndex: 30,
    borderRadius: 24,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.48,
    shadowRadius: 22,
    elevation: 16,
    overflow: 'hidden',
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
  },
  previewHeaderText: {
    flex: 1,
    marginRight: 12,
  },
  previewTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.text,
    fontFamily: 'System',
  },
  previewStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  previewStatText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '600',
    fontFamily: 'System',
  },
  previewStatSep: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontFamily: 'System',
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: COLORS.white06,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepsContainer: {
    borderTopWidth: 0.5,
    borderTopColor: COLORS.border,
    maxHeight: 176,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
  },
  stepIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: COLORS.primaryDim,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  stepContent: {
    flex: 1,
    marginRight: 8,
  },
  stepInstruction: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    fontFamily: 'System',
  },
  stepDistance: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontFamily: 'System',
    marginTop: 2,
  },
  moreSteps: {
    textAlign: 'center',
    fontSize: 11,
    color: COLORS.textMuted,
    fontFamily: 'System',
    paddingVertical: 8,
  },
  startBtnContainer: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 18,
  },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 58,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    gap: 10,
  },
  startBtnText: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.bg,
    fontFamily: 'System',
  },
  turnBanner: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 35,
    minHeight: 88,
    borderRadius: 22,
    backgroundColor: 'rgba(7, 18, 33, 0.96)',
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.42,
    shadowRadius: 20,
    elevation: 16,
  },
  turnIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: COLORS.primaryDim,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  turnTextWrap: {
    flex: 1,
  },
  turnDistance: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.primary,
    fontFamily: 'System',
  },
  turnInstruction: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
    fontFamily: 'System',
    marginTop: 2,
  },
  turnNext: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontFamily: 'System',
    marginTop: 3,
  },
  navContainer: {
    position: 'absolute',
    bottom: 0,
    left: 14,
    right: 82,
    zIndex: 30,
    borderRadius: 24,
    backgroundColor: 'rgba(7, 18, 33, 0.97)',
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 22,
    elevation: 16,
    overflow: 'hidden',
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 14,
  },
  summaryCopy: {
    flex: 1,
    marginRight: 10,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
    fontFamily: 'System',
    lineHeight: 20,
  },
  summarySub: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontFamily: 'System',
    marginTop: 3,
  },
  summaryActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  arrivalWrap: {
    alignItems: 'flex-end',
  },
  arrivalTime: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.primary,
    fontFamily: 'System',
  },
  arrivalLabel: {
    fontSize: 10,
    color: COLORS.textSecondary,
    fontFamily: 'System',
    marginTop: 1,
  },
  exitBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: 'rgba(127, 29, 29, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  endTripBtn: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(127, 29, 29, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  endTripText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.danger,
    fontFamily: 'System',
  },
});
