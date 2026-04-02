import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { Text, Surface } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { SupabaseService } from '../services/SupabaseService';
import { useAuthStore } from '../store/authStore';
import { useAutoHideTabBar } from '../hooks/use-auto-hide-tab-bar';
import { TAB_BAR_HEIGHT } from '../constants/layout';
import { hasProAccess, isPremiumAccessPending } from '../utils/access';
import ProGate from '../components/ProGate';
import { useSettingsStore } from '../store/settingsStore';
import { formatDistance } from '../utils/format';
import { AccessBootstrapView } from '../components/AccessBootstrapView';

const HistoryScreen = ({ navigation }: any) => {
  const { user, accessBootstrapState } = useAuthStore();
  const unitSystem = useSettingsStore((state) => state.unitSystem);
  const canUse = hasProAccess(user);
  const accessPending = isPremiumAccessPending(user, accessBootstrapState);
  const { onScroll, onScrollBeginDrag, onScrollEndDrag } = useAutoHideTabBar();
  const [trips, setTrips] = useState<any[]>([]);
  const [pendingTripCount, setPendingTripCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const summary = useMemo(() => {
    const totalTrips = trips.length;
    const totalDistanceKm = trips.reduce(
      (acc, trip) => acc + (Number.isFinite(Number(trip?.distance)) ? Number(trip.distance) / 1000 : 0),
      0
    );
    const avgDurationMinutes = totalTrips
      ? Math.round(
          trips.reduce((acc, trip) => acc + (Number.isFinite(Number(trip?.duration)) ? Number(trip.duration) : 0), 0) /
            totalTrips /
            60
        )
      : 0;
    const avgScore = totalTrips
      ? Math.round(
          trips.reduce((acc, trip) => acc + (Number.isFinite(Number(trip?.score)) ? Number(trip.score) : 0), 0) /
            totalTrips
        )
      : 0;

    return {
      totalTrips,
      totalDistanceKm,
      avgDurationMinutes,
      avgScore,
    };
  }, [trips]);

  const loadTrips = useCallback(async () => {
    try {
      setLoading(true);
      const [data, queuedCount] = await Promise.all([
        SupabaseService.getUserTrips(user?.id),
        SupabaseService.getPendingTripQueueCount(),
      ]);
      setTrips(data || []);
      setPendingTripCount(queuedCount);
    } catch (error) {
      console.error('Failed to load trips:', error);
      setTrips([]);
      setPendingTripCount(0);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (canUse) {
      loadTrips();
    }
  }, [canUse, loadTrips]);

  useFocusEffect(
    useCallback(() => {
      if (canUse) {
        loadTrips();
      }
      return () => {};
    }, [canUse, loadTrips])
  );

  if (accessPending) {
    return (
      <AccessBootstrapView
        title="Checking Pro access"
        subtitle="Restoring trip history access for your active subscription."
      />
    );
  }

  if (!canUse) {
    return (
      <ProGate
        title="Trip History"
        subtitle="Upgrade to Pro to view trip history and weekly stats."
        onUpgrade={() => navigation.navigate('Home', { screen: 'Subscription' })}
      />
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0F172A', '#020617']} style={StyleSheet.absoluteFill} />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <MaterialCommunityIcons name="chevron-left" size={30} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Trip History</Text>
        <TouchableOpacity>
             <MaterialCommunityIcons name="filter-variant" size={24} color="#94A3B8" />
        </TouchableOpacity>
      </View>

      {pendingTripCount > 0 ? (
        <View style={styles.syncBanner}>
          <MaterialCommunityIcons name="cloud-sync-outline" size={16} color="#67E8F9" />
          <Text style={styles.syncBannerText}>
            {pendingTripCount} trip{pendingTripCount > 1 ? 's are' : ' is'} queued and will sync automatically.
          </Text>
        </View>
      ) : null}

      <FlatList
        data={trips}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: 20, paddingBottom: TAB_BAR_HEIGHT + 24 }}
        ListHeaderComponent={
          <View style={styles.summaryGrid}>
            <Surface style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Trips</Text>
              <Text style={styles.summaryValue}>{summary.totalTrips}</Text>
            </Surface>
            <Surface style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Distance</Text>
              <Text style={styles.summaryValue}>
                {formatDistance(summary.totalDistanceKm, unitSystem)}
              </Text>
            </Surface>
            <Surface style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Avg Duration</Text>
              <Text style={styles.summaryValue}>{summary.avgDurationMinutes}m</Text>
            </Surface>
            <Surface style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Avg Score</Text>
              <Text style={styles.summaryValue}>{summary.avgScore}</Text>
            </Surface>
          </View>
        }
        ListFooterComponent={null}
        onScroll={onScroll}
        onScrollBeginDrag={onScrollBeginDrag}
        onScrollEndDrag={onScrollEndDrag}
        scrollEventThrottle={16}
        ListEmptyComponent={
          loading ? (
            <View style={{ alignItems: 'center', paddingTop: 40 }}>
              <ActivityIndicator size="large" color="#4ECDC4" />
            </View>
          ) : (
            <Text style={{ color: '#94A3B8', textAlign: 'center', paddingTop: 40 }}>No trips yet</Text>
          )
        }
        renderItem={({ item }) => {
          const createdAt = item.createdAt ? new Date(item.createdAt) : null;
          const dateLabel = createdAt && !Number.isNaN(createdAt.getTime())
            ? createdAt.toLocaleDateString()
            : '—';
          return (
            <Surface style={styles.tripCard}>
                <View style={styles.tripHeader}>
                    <Text style={styles.dateText}>{dateLabel}</Text>
                    <View style={[styles.scoreBadge, { backgroundColor: (item.score || 0) > 90 ? '#10B981' : '#F59E0B' }]}>
                        <Text style={styles.scoreText}>{item.score || 0}</Text>
                    </View>
                </View>

                <View style={styles.routeContainer}>
                    <View style={styles.routeCol}>
                        <View style={styles.dot} />
                        <View style={styles.line} />
                        <View style={[styles.dot, { backgroundColor: '#4ECDC4' }]} />
                    </View>
                    <View style={styles.locCol}>
                        <Text style={styles.locText}>{item.startLocation || 'Start'}</Text>
                        <Text style={[styles.locText, { marginTop: 22 }]}>{item.endLocation || 'End'}</Text>
                    </View>
                </View>

                <View style={styles.statsRow}>
                    <View style={styles.stat}>
                        <MaterialCommunityIcons name="map-marker-distance" size={16} color="#94A3B8" />
                        <Text style={styles.statText}>
                          {formatDistance((item.distance || 0) / 1000, unitSystem)}
                        </Text>
                    </View>
                    <View style={styles.stat}>
                        <MaterialCommunityIcons name="clock-outline" size={16} color="#94A3B8" />
                        <Text style={styles.statText}>{Math.round((item.duration || 0) / 60)}m</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.detailsBtn}
                      onPress={() => navigation.navigate('TripDetail', { trip: item })}
                    >
                        <Text style={styles.detailsText}>Details</Text>
                        <MaterialCommunityIcons name="chevron-right" size={16} color="#4ECDC4" />
                    </TouchableOpacity>
                </View>
            </Surface>
          );
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 50 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 10 },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: 'white' },
  backBtn: { padding: 5 },
  syncBanner: {
    marginHorizontal: 20,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(103,232,249,0.35)',
    backgroundColor: 'rgba(2,26,43,0.8)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  syncBannerText: {
    color: '#BAE6FD',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 18,
  },
  summaryCard: {
    width: '48%',
    backgroundColor: '#1E293B',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  summaryLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  summaryValue: {
    marginTop: 8,
    color: '#F8FAFC',
    fontSize: 22,
    fontWeight: '800',
  },
  
  tripCard: { backgroundColor: '#1E293B', borderRadius: 20, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  tripHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  dateText: { color: '#94A3B8', fontWeight: '600' },
  scoreBadge: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  scoreText: { color: 'white', fontWeight: 'bold', fontSize: 12 },
  
  routeContainer: { flexDirection: 'row', marginBottom: 20 },
  routeCol: { alignItems: 'center', marginRight: 15, paddingTop: 5 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#94A3B8' },
  line: { width: 2, height: 25, backgroundColor: '#334155', marginVertical: 4 },
  locCol: { flex: 1 },
  locText: { color: 'white', fontSize: 16, fontWeight: '600' },
  
  statsRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', paddingTop: 15 },
  stat: { flexDirection: 'row', alignItems: 'center', marginRight: 20 },
  statText: { color: '#94A3B8', marginLeft: 6, fontWeight: '500' },
  detailsBtn: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center' },
  detailsText: { color: '#4ECDC4', fontSize: 12, fontWeight: 'bold' }
});

export default HistoryScreen;
