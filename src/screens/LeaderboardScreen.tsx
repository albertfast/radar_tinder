import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, FlatList, Platform, RefreshControl, UIManager } from 'react-native';
import { Text, Surface, Avatar, ActivityIndicator, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { GamificationService, Rank } from '../services/GamificationService';
import { useAuthStore } from '../store/authStore';
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

const LeaderboardScreen = ({ navigation }: NavProps) => {
  const { user } = useAuthStore();
  const [leaders, setLeaders] = useState<LeaderboardUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const pulse = useSharedValue(0.6);
  const heroPulse = useSharedValue(0.4);
  const spin = useSharedValue(0);
  const canUseRadar3D = useMemo(
    () => Platform.OS === 'android' && !!UIManager.getViewManagerConfig?.('Radar3DView'),
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

  const heroPulseStyle = useAnimatedStyle(() => ({
    opacity: 0.2 + heroPulse.value * 0.4,
    transform: [{ scale: 0.8 + heroPulse.value * 0.3 }],
  }));

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value}deg` }],
  }));

  const topThree = useMemo(() => leaders.slice(0, 3), [leaders]);
  const restLeaders = useMemo(() => leaders.slice(3), [leaders]);

  const rankStyles = (rank: Rank) => {
    switch (rank) {
      case 'Legend':
        return { bg: 'rgba(255, 215, 0, 0.2)', text: '#FFD700' };
      case 'Commander':
        return { bg: 'rgba(0, 200, 255, 0.2)', text: '#4DD0E1' };
      case 'Ranger':
        return { bg: 'rgba(76, 175, 80, 0.2)', text: '#66BB6A' };
      case 'Scout':
        return { bg: 'rgba(255, 152, 0, 0.2)', text: '#FFB74D' };
      default:
        return { bg: 'rgba(148, 163, 184, 0.2)', text: '#94A3B8' };
    }
  };

  const renderPodium = () => {
    if (topThree.length === 0) return null;
    return (
      <View style={styles.podiumRow}>
        {topThree.map((item, index) => {
          const isFirst = index === 0;
          const badgeColor = isFirst ? '#FFD700' : index === 1 ? '#C0C0C0' : '#CD7F32';
          const rankStyle = rankStyles(item.rank);
          return (
            <Surface
              key={item.id}
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
    <View style={styles.container}>
      <LinearGradient
        colors={['#000000', '#121212']}
        style={styles.background}
      />
      
      <View style={styles.header}>
        <IconButton 
          icon="chevron-left" 
          iconColor="white" 
          size={30} 
          onPress={() => navigation.goBack()} 
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
                        <MaterialCommunityIcons name="trophy" size={38} color="#FFD700" />
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
              {leaders.length > 3 && (
                <Text style={styles.sectionLabel}>ALL DRIVERS</Text>
              )}
            </View>
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000', paddingTop: 50 },
  background: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, marginBottom: 10 },
  headerTitle: { fontSize: 28, fontWeight: 'bold', color: 'white' },
  headerSubtitle: { fontSize: 14, color: '#8E8E93', marginTop: 5 },
  liveBadge: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)' },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF5252' },
  liveText: { color: '#F87171', fontWeight: 'bold', fontSize: 11, letterSpacing: 1 },
  
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { paddingHorizontal: 20, paddingBottom: 20 },
  
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
  sectionLabel: { color: '#64748B', fontSize: 11, fontWeight: 'bold', marginBottom: 10, letterSpacing: 1 },
});

export default LeaderboardScreen;
