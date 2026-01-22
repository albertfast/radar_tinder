import React, { useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { Text, Surface } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SupabaseService } from '../services/SupabaseService';
import { useAuthStore } from '../store/authStore';
import { useAutoHideTabBar } from '../hooks/use-auto-hide-tab-bar';
import { TAB_BAR_HEIGHT } from '../constants/layout';

const HistoryScreen = ({ navigation }: any) => {
  const { user } = useAuthStore();
  const { onScroll, onScrollBeginDrag, onScrollEndDrag } = useAutoHideTabBar();
  const [trips, setTrips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTrips();
  }, [user?.id]);

  const loadTrips = async () => {
    try {
      setLoading(true);
      const data = await SupabaseService.getUserTrips(user?.id);
      setTrips(data || []);
    } catch (error) {
      console.error('Failed to load trips:', error);
      setTrips([]);
    } finally {
      setLoading(false);
    }
  };
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

      <FlatList
        data={trips}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: 20, paddingBottom: TAB_BAR_HEIGHT + 24 }}
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
                        <Text style={styles.statText}>{((item.distance || 0) / 1000).toFixed(1)} km</Text>
                    </View>
                    <View style={styles.stat}>
                        <MaterialCommunityIcons name="clock-outline" size={16} color="#94A3B8" />
                        <Text style={styles.statText}>{Math.round((item.duration || 0) / 60)}m</Text>
                    </View>
                    <TouchableOpacity style={styles.detailsBtn}>
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
