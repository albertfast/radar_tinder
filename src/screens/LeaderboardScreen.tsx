import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, FlatList, Platform, RefreshControl, UIManager } from 'react-native';
import { Text, Surface, Avatar, ActivityIndicator, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, FadeInDown, BounceInDown, SlideInLeft } from 'react-native-reanimated';
import { GamificationService, Rank, RANKS } from '../services/GamificationService';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import { formatDistance } from '../utils/format';
import { ANIMATION_TIMING, STAGGER_DELAYS } from '../utils/animationConstants';
import { HapticPatterns } from '../utils/hapticFeedback';
import { supabase } from '../../utils/supabase';
import Radar3DView from '../components/Radar3DView';

interface LeaderboardUser {
  id: string;
  name: string;
  points: number;
  rank: Rank;
  avatar?: string;
}

type NavProps = { navigation: any };
type Tone = { bg: string; text: string; border: string };

const LeaderboardScreen = ({ navigation }: NavProps) => {
  const { user } = useAuthStore();
  const { unitSystem } = useSettingsStore();
  const [leaders, setLeaders] = useState<LeaderboardUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [progressWidth, setProgressWidth] = useState(0);

  const pulse = useSharedValue(0.6);
  const heroPulse = useSharedValue(0.4);
  const spin = useSharedValue(0);
  const orbFloat = useSharedValue(0);
  const progressValue = useSharedValue(0);
  const canUseRadar3D = useMemo(
    () => Platform.OS === 'android' && !!UIManager.getViewManagerConfig?.('RTRadar3DView'),
    []
  );

  useEffect(() => {
    loadLeaderboard(false);
  }, []);

  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1200 }), -1, true);
  }, []);

  useEffect(() => {
    heroPulse.value = withRepeat(withTiming(1, { duration: 1600 }), -1, true);
    spin.value = withRepeat(withTiming(360, { duration: 5200 }), -1, false);
    orbFloat.value = withRepeat(withTiming(1, { duration: 4800 }), -1, true);
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('leaderboard-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => {
          loadLeaderboard(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadLeaderboard = async (silent = false) => {
    try {
      if (!silent && leaders.length === 0) {
        setLoading(true);
      }
      const data = await GamificationService.getLeaderboard();
      setLeaders(data);
    } catch (error) {
      console.error('Failed to load leaderboard', error);
    } finally {
      if (!silent) setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadLeaderboard(true);
  };

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
    transform: [{ scale: 0.7 + pulse.value * 0.3 }],
  }));

  const statPulseStyle = useAnimatedStyle(() => ({
    opacity: 0.15 + pulse.value * 0.35,
    transform: [{ scale: 0.8 + pulse.value * 0.3 }],
  }));

  const heroPulseStyle = useAnimatedStyle(() => ({
    opacity: 0.2 + heroPulse.value * 0.4,
    transform: [{ scale: 0.8 + heroPulse.value * 0.3 }],
  }));

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value}deg` }],
  }));

  const orbFloatStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -8 + orbFloat.value * 16 }],
    opacity: 0.25 + orbFloat.value * 0.2,
  }));

  const topThree = useMemo(() => leaders.slice(0, 3), [leaders]);
  const restLeaders = useMemo(() => leaders.slice(3), [leaders]);

  const currentPoints = user?.points ?? 0;
  const currentRank = (user?.rank as Rank) || GamificationService.getRank(currentPoints);
  const stats = user?.stats || { reports: 0, confirmations: 0, distanceDriven: 0 };
  const currentRankIndex = Math.max(
    0,
    RANKS.findIndex((item) => item.name === currentRank)
  );
  const nextRank = RANKS[Math.min(currentRankIndex + 1, RANKS.length - 1)];
  const currentMin = RANKS[currentRankIndex]?.minPoints ?? 0;
  const nextMin = nextRank?.minPoints ?? currentMin;
  const progressRaw = nextMin > currentMin ? (currentPoints - currentMin) / (nextMin - currentMin) : 1;
  const progressClamped = Math.max(0, Math.min(progressRaw, 1));

  useEffect(() => {
    progressValue.value = withTiming(progressClamped, { duration: 900 });
  }, [progressClamped]);

  const progressStyle = useAnimatedStyle(() => ({
    width: progressWidth * progressValue.value,
  }));

  const rankStyles = (rank: Rank): Tone => {
    switch (rank) {
      case 'Legend':
        return { bg: 'rgba(255, 215, 0, 0.2)', text: '#FFD700', border: 'rgba(255, 215, 0, 0.35)' };
      case 'Commander':
        return { bg: 'rgba(0, 200, 255, 0.2)', text: '#4DD0E1', border: 'rgba(77, 208, 225, 0.35)' };
      case 'Ranger':
        return { bg: 'rgba(76, 175, 80, 0.2)', text: '#66BB6A', border: 'rgba(102, 187, 106, 0.35)' };
      case 'Scout':
        return { bg: 'rgba(255, 152, 0, 0.2)', text: '#FFB74D', border: 'rgba(255, 183, 77, 0.35)' };
      default:
        return { bg: 'rgba(148, 163, 184, 0.2)', text: '#94A3B8', border: 'rgba(148, 163, 184, 0.35)' };
    }
  };

  const communityHighlights = useMemo(() => {
    const highlights: string[] = [];
    if (leaders[0]) {
      highlights.push(`${leaders[0].name} just crossed ${leaders[0].points.toLocaleString()} pts.`);
    }
    if (leaders[1]) {
      highlights.push(`${leaders[1].name} is gaining fast this week.`);
    }
    if (stats.reports > 0) {
      highlights.push(`You helped verify ${stats.reports} reports. Great work.`);
    }
    if (highlights.length === 0) {
      highlights.push('New activity will appear here as drivers report radars.');
    }
    return highlights;
  }, [leaders, stats.reports]);

  const StatCard = ({
    icon,
    label,
    value,
    tone,
    subtitle,
    highlight
  }: {
    icon: string;
    label: string;
    value: string;
    tone: Tone;
    subtitle?: string;
    highlight?: boolean;
  }) => (
    <Surface style={[styles.statCard, { borderColor: tone.border }]} elevation={1}>
      {highlight ? (
        <Animated.View style={[styles.statPulse, statPulseStyle, { borderColor: tone.text }]} />
      ) : null}
      <View style={[styles.statIcon, { backgroundColor: tone.bg }]}>
        <MaterialCommunityIcons name={icon as any} size={18} color={tone.text} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {subtitle ? <Text style={styles.statSub}>{subtitle}</Text> : null}
    </Surface>
  );

  const renderPodium = () => {
    if (topThree.length === 0) return null;
    return (
      <View style={styles.podiumRow}>
        {topThree.map((item, index) => {
          const isFirst = index === 0;
          const badgeColor = isFirst ? '#FFD700' : index === 1 ? '#C0C0C0' : '#CD7F32';
          const rankStyle = rankStyles(item.rank);
          return (
            <Animated.View
              key={item.id}
              entering={FadeInDown.delay(index * STAGGER_DELAYS.ITEM_SLOW).duration(ANIMATION_TIMING.SLOW)}
            >
              <Surface
                style={[styles.podiumCard, isFirst && styles.podiumCardTop]}
                elevation={2}
              >
                <View style={styles.podiumHeader}>
                  <MaterialCommunityIcons name="crown" size={22} color={badgeColor} />
                  <Text style={styles.podiumRankText}>{index + 1}</Text>
                </View>
              {item.avatar ? (
                <Avatar.Image size={isFirst ? 54 : 46} source={{ uri: item.avatar }} />
              ) : (
                <Avatar.Text
                  size={isFirst ? 54 : 46}
                  label={item.name.substring(0, 2).toUpperCase()}
                />
              )}
              <Text style={styles.podiumName} numberOfLines={1}>{item.name}</Text>
              <View style={[styles.rankBadge, { backgroundColor: rankStyle.bg }]}>
                <Text style={[styles.rankText, { color: rankStyle.text }]}>{item.rank}</Text>
              </View>
              <Text style={styles.podiumPoints}>{item.points.toLocaleString()}</Text>
              <Text style={styles.podiumPtsLabel}>PTS</Text>
              </Surface>
            </Animated.View>
          );
        })}
      </View>
    );
  };

  const rankOffset = topThree.length;
  const renderItem = ({ item, index }: { item: LeaderboardUser; index: number }) => {
    const isCurrentUser = item.id === user?.id;
    const rankStyle = rankStyles(item.rank);
    
    return (
      <Surface style={[styles.itemContainer, isCurrentUser && styles.currentUserItem]} elevation={1}>
        <View style={styles.rankColumn}>
          <Text style={styles.rankNumber}>{index + rankOffset + 1}</Text>
        </View>
        
        <View style={styles.avatarContainer}>
          {item.avatar ? (
            <Avatar.Image size={40} source={{ uri: item.avatar }} />
          ) : (
            <Avatar.Text size={40} label={item.name.substring(0, 2).toUpperCase()} />
          )}
        </View>

        <View style={styles.infoColumn}>
          <Text style={[styles.userName, isCurrentUser && styles.currentUserName]}>{item.name}</Text>
          <View style={[styles.rankBadge, { backgroundColor: rankStyle.bg }]}>
            <Text style={[styles.rankText, { color: rankStyle.text }]}>{item.rank}</Text>
          </View>
        </View>

        <View style={styles.pointsColumn}>
          <Text style={styles.pointsText}>{item.points.toLocaleString()}</Text>
          <Text style={styles.pointsLabel}>PTS</Text>
        </View>
      </Surface>
    );
  };

  return (
    <Animated.View 
      style={styles.container}
      entering={BounceInDown.duration(ANIMATION_TIMING.SLOW)}
    >
      <LinearGradient
        colors={['#020617', '#0B1220', '#05070D']}
        style={styles.background}
      />
      <View style={styles.orbLayer} pointerEvents="none">
        <Animated.View style={[styles.orb, styles.orbTeal, orbFloatStyle]} />
        <View style={[styles.orb, styles.orbBlue]} />
        <View style={[styles.orb, styles.orbAmber]} />
      </View>
      
      <View style={styles.header}>
        <IconButton 
          icon="chevron-left" 
          iconColor="white" 
          size={30} 
          onPress={() => {
            HapticPatterns.light();
            navigation.goBack();
          }} 
        />
        <View>
          <Text style={styles.headerTitle}>Leaderboard</Text>
          <Text style={styles.headerSubtitle}>Top Drivers this Week</Text>
        </View>
        <View style={styles.liveBadge}>
          <Animated.View style={[styles.liveDot, pulseStyle]} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2196F3" />
        </View>
      ) : (
        <FlatList
          data={restLeaders}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#4ECDC4"
            />
          }
          ListEmptyComponent={
            leaders.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No rankings yet</Text>
                <Text style={styles.emptySubtitle}>Be the first to report and earn points.</Text>
              </View>
            ) : null
          }
          ListHeaderComponent={
            <View>
              <View style={styles.hero}>
                <LinearGradient
                  colors={['rgba(78, 205, 196, 0.25)', 'rgba(15, 23, 42, 0.0)']}
                  style={styles.heroGlow}
                />
                <View style={styles.heroContent}>
                  <View style={styles.trophyShell}>
                    {canUseRadar3D ? (
                      <Radar3DView style={styles.trophy3d} />
                    ) : (
                      <View style={styles.trophyFallback}>
                        <Animated.View style={[styles.trophyOrb, spinStyle]}>
                          <LinearGradient
                            colors={['#0F172A', '#1E293B', '#0B1220']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={StyleSheet.absoluteFillObject}
                          />
                        </Animated.View>
                        <Animated.View style={[styles.trophyPulse, heroPulseStyle]} />
                        <Text style={styles.trophyText}>RT</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.heroText}>
                    <Text style={styles.heroTitle}>Weekly Champions</Text>
                    <Text style={styles.heroSubtitle}>
                      Live rankings update as drivers collect points.
                    </Text>
                  </View>
                </View>
              </View>

              {renderPodium()}

              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionLabel}>YOUR IMPACT</Text>
                <Text style={styles.sectionHint}>Updates live</Text>
              </View>
              <View style={styles.statsRow}>
                <StatCard
                  icon="flag-checkered"
                  label="Reports"
                  value={stats.reports.toLocaleString()}
                  tone={{ bg: 'rgba(255,82,82,0.18)', text: '#FF8A80', border: 'rgba(255,82,82,0.35)' }}
                  highlight={stats.reports > 0}
                />
                <StatCard
                  icon="shield-check"
                  label="Confirmations"
                  value={stats.confirmations.toLocaleString()}
                  tone={{ bg: 'rgba(78,205,196,0.18)', text: '#4ECDC4', border: 'rgba(78,205,196,0.35)' }}
                  highlight={stats.confirmations > 0}
                />
                <StatCard
                  icon="road-variant"
                  label="Distance"
                  value={formatDistance(stats.distanceDriven || 0, unitSystem)}
                  tone={{ bg: 'rgba(59,130,246,0.2)', text: '#60A5FA', border: 'rgba(59,130,246,0.35)' }}
                  subtitle={unitSystem === 'imperial' ? 'mi' : 'km'}
                  highlight={stats.distanceDriven > 0}
                />
              </View>

              <View style={styles.progressCard}>
                <View style={styles.progressHeader}>
                  <Text style={styles.progressTitle}>Rank Progress</Text>
                  <View style={[styles.rankBadge, { backgroundColor: rankStyles(currentRank).bg }]}>
                    <Text style={[styles.rankText, { color: rankStyles(currentRank).text }]}>{currentRank}</Text>
                  </View>
                </View>
                <Text style={styles.progressSubtitle}>
                  {currentRank === nextRank?.name
                    ? 'Top rank unlocked.'
                    : `Next: ${nextRank?.name || 'Legend'} at ${nextMin} pts`}
                </Text>
                <View
                  style={styles.progressTrack}
                  onLayout={(event) => setProgressWidth(event.nativeEvent.layout.width)}
                >
                  <Animated.View style={[styles.progressFill, progressStyle]} />
                </View>
                <Text style={styles.progressValue}>
                  {currentPoints.toLocaleString()} / {nextMin.toLocaleString()} pts
                </Text>
              </View>

              <View style={styles.highlightsCard}>
                <Text style={styles.sectionLabel}>COMMUNITY PULSE</Text>
                {communityHighlights.map((note, idx) => (
                  <View key={`${note}-${idx}`} style={styles.highlightRow}>
                    <MaterialCommunityIcons name="flash" size={16} color="#FBBF24" />
                    <Text style={styles.highlightText}>{note}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.legalCard}>
                <View style={styles.legalHeader}>
                  <MaterialCommunityIcons name="alert-circle-outline" size={18} color="#F59E0B" />
                  <Text style={styles.legalTitle}>Legal Notice</Text>
                </View>
                <Text style={styles.legalText}>
                  This app provides informational alerts only. Using a phone while driving is dangerous.
                  Always follow local traffic laws and keep your attention on the road.
                </Text>
              </View>

              {leaders.length > 3 && (
                <Text style={[styles.sectionLabel, styles.sectionSpacer]}>ALL DRIVERS</Text>
              )}
            </View>
          }
        />
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000', paddingTop: 50 },
  background: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  orbLayer: { ...StyleSheet.absoluteFillObject },
  orb: { position: 'absolute', borderRadius: 120, opacity: 0.25 },
  orbTeal: { width: 220, height: 220, top: 120, right: -80, backgroundColor: '#1E3A48' },
  orbBlue: { width: 160, height: 160, top: 360, left: -60, backgroundColor: '#0F2A4A' },
  orbAmber: { width: 140, height: 140, bottom: 200, right: -40, backgroundColor: '#402A12' },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, marginBottom: 10 },
  headerTitle: { fontSize: 28, fontWeight: 'bold', color: 'white' },
  headerSubtitle: { fontSize: 14, color: '#8E8E93', marginTop: 5 },
  liveBadge: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)' },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF5252' },
  liveText: { color: '#F87171', fontWeight: 'bold', fontSize: 11, letterSpacing: 1 },

  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { paddingHorizontal: 20, paddingBottom: 30 },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  emptySubtitle: { color: '#94A3B8', marginTop: 6 },

  itemContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1C1C1E', borderRadius: 16, padding: 15, marginBottom: 10, borderWidth: 1, borderColor: '#333' },
  currentUserItem: { borderColor: '#2196F3', backgroundColor: 'rgba(33, 150, 243, 0.1)' },

  rankColumn: { width: 34, alignItems: 'center', justifyContent: 'center' },
  rankNumber: { color: '#8E8E93', fontSize: 14, fontWeight: 'bold' },

  avatarContainer: { marginRight: 15 },

  infoColumn: { flex: 1 },
  userName: { color: 'white', fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  currentUserName: { color: '#2196F3' },
  rankBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  rankText: { fontSize: 10, fontWeight: 'bold' },

  pointsColumn: { alignItems: 'flex-end' },
  pointsText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  pointsLabel: { color: '#8E8E93', fontSize: 10 },

  hero: { borderRadius: 24, padding: 20, marginBottom: 20, backgroundColor: '#0B1220', overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(78,205,196,0.15)' },
  heroGlow: { position: 'absolute', left: -30, top: -40, width: 200, height: 200, borderRadius: 100 },
  heroContent: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  trophyShell: { width: 96, height: 96, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center' },
  trophy3d: { width: 96, height: 96, backgroundColor: 'transparent' },
  trophyFallback: { width: 96, height: 96, alignItems: 'center', justifyContent: 'center' },
  trophyOrb: { width: 86, height: 86, borderRadius: 43, overflow: 'hidden' },
  trophyPulse: { position: 'absolute', width: 92, height: 92, borderRadius: 46, borderWidth: 1, borderColor: 'rgba(78,205,196,0.4)' },
  trophyText: { position: 'absolute', color: '#E2E8F0', fontSize: 22, fontWeight: 'bold', letterSpacing: 1 },
  heroText: { flex: 1 },
  heroTitle: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  heroSubtitle: { color: '#94A3B8', fontSize: 12, marginTop: 6, lineHeight: 16 },

  podiumRow: { flexDirection: 'row', gap: 10, justifyContent: 'space-between', marginBottom: 20 },
  podiumCard: { flex: 1, padding: 12, borderRadius: 18, alignItems: 'center', backgroundColor: '#151515', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  podiumCardTop: { marginTop: -10, backgroundColor: '#1B1B1E', borderColor: 'rgba(255,215,0,0.3)' },
  podiumHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  podiumRankText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  podiumName: { color: 'white', fontWeight: 'bold', fontSize: 12, marginTop: 8 },
  podiumPoints: { color: 'white', fontWeight: 'bold', marginTop: 6, fontSize: 14 },
  podiumPtsLabel: { color: '#8E8E93', fontSize: 9 },

  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionLabel: { color: '#64748B', fontSize: 11, fontWeight: 'bold', letterSpacing: 1 },
  sectionHint: { color: '#4ECDC4', fontSize: 11, fontWeight: '600' },
  sectionSpacer: { marginTop: 10 },

  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  statCard: { flex: 1, padding: 12, borderRadius: 16, backgroundColor: '#121212', borderWidth: 1 },
  statPulse: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
  },
  statIcon: { width: 32, height: 32, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  statValue: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  statLabel: { color: '#94A3B8', fontSize: 11, marginTop: 2 },
  statSub: { color: '#64748B', fontSize: 10, marginTop: 2 },

  progressCard: { backgroundColor: '#0F172A', padding: 16, borderRadius: 16, marginBottom: 18, borderWidth: 1, borderColor: 'rgba(59,130,246,0.25)' },
  progressHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  progressTitle: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  progressSubtitle: { color: '#94A3B8', fontSize: 11, marginBottom: 10 },
  progressTrack: { height: 8, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 6, backgroundColor: '#4ECDC4' },
  progressValue: { color: '#94A3B8', fontSize: 11, marginTop: 8 },

  highlightsCard: { backgroundColor: '#111827', padding: 16, borderRadius: 16, marginBottom: 18, borderWidth: 1, borderColor: 'rgba(148,163,184,0.2)' },
  highlightRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  highlightText: { color: '#E2E8F0', fontSize: 12, flex: 1 },

  legalCard: { backgroundColor: '#0B0B0B', padding: 14, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)', marginBottom: 20 },
  legalHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  legalTitle: { color: '#FBBF24', fontWeight: 'bold', fontSize: 12 },
  legalText: { color: '#9CA3AF', fontSize: 11, lineHeight: 16 },
});

export default LeaderboardScreen;
