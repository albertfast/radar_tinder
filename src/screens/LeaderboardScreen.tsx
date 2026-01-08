import React, { useEffect, useState } from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import { Text, Surface, Avatar, ActivityIndicator, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { GamificationService, Rank } from '../services/GamificationService';
import { useAuthStore } from '../store/authStore';

interface LeaderboardUser {
  id: string;
  name: string;
  points: number;
  rank: Rank;
  avatar?: string;
}

const LeaderboardScreen = ({ navigation }: any) => {
  const { user } = useAuthStore();
  const [leaders, setLeaders] = useState<LeaderboardUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLeaderboard();
  }, []);

  const loadLeaderboard = async () => {
    try {
      const data = await GamificationService.getLeaderboard();
      setLeaders(data);
    } catch (error) {
      console.error('Failed to load leaderboard', error);
    } finally {
      setLoading(false);
    }
  };

  const renderItem = ({ item, index }: { item: LeaderboardUser; index: number }) => {
    const isCurrentUser = item.id === user?.id;
    const isTop3 = index < 3;
    
    return (
      <Surface style={[styles.itemContainer, isCurrentUser && styles.currentUserItem]} elevation={1}>
        <View style={styles.rankColumn}>
          {index === 0 ? (
            <MaterialCommunityIcons name="crown" size={24} color="#FFD700" />
          ) : index === 1 ? (
            <MaterialCommunityIcons name="crown" size={24} color="#C0C0C0" />
          ) : index === 2 ? (
            <MaterialCommunityIcons name="crown" size={24} color="#CD7F32" />
          ) : (
            <Text style={styles.rankNumber}>{index + 1}</Text>
          )}
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
          <View style={styles.rankBadge}>
            <Text style={styles.rankText}>{item.rank}</Text>
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
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2196F3" />
        </View>
      ) : (
        <FlatList
          data={leaders}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000', paddingTop: 50 },
  background: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, marginBottom: 20 },
  headerTitle: { fontSize: 28, fontWeight: 'bold', color: 'white' },
  headerSubtitle: { fontSize: 14, color: '#8E8E93', marginTop: 5 },
  
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { paddingHorizontal: 20, paddingBottom: 20 },
  
  itemContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1C1C1E', borderRadius: 12, padding: 15, marginBottom: 10, borderWidth: 1, borderColor: '#333' },
  currentUserItem: { borderColor: '#2196F3', backgroundColor: 'rgba(33, 150, 243, 0.1)' },
  
  rankColumn: { width: 40, alignItems: 'center', justifyContent: 'center' },
  rankNumber: { color: '#8E8E93', fontSize: 16, fontWeight: 'bold' },
  
  avatarContainer: { marginRight: 15 },
  
  infoColumn: { flex: 1 },
  userName: { color: 'white', fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  currentUserName: { color: '#2196F3' },
  rankBadge: { alignSelf: 'flex-start', backgroundColor: 'rgba(255, 215, 0, 0.15)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  rankText: { color: '#FFD700', fontSize: 10, fontWeight: 'bold' },
  
  pointsColumn: { alignItems: 'flex-end' },
  pointsText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  pointsLabel: { color: '#8E8E93', fontSize: 10 },
});

export default LeaderboardScreen;
