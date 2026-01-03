import React from 'react';
import { View, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import { Text, Surface } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const MOCK_HISTORY = [
    { id: '1', date: 'Today, 10:23 AM', distance: '12.4 km', duration: '24m', score: 98, from: 'Home', to: 'Work' },
    { id: '2', date: 'Yesterday, 6:15 PM', distance: '12.8 km', duration: '32m', score: 85, from: 'Work', to: 'Home' },
    { id: '3', date: 'Aug 24, 2:00 PM', distance: '45.2 km', duration: '55m', score: 92, from: 'Downtown', to: 'Airport' },
    { id: '4', date: 'Aug 23, 9:00 AM', distance: '5.1 km', duration: '12m', score: 100, from: 'Home', to: 'Gym' },
];

const HistoryScreen = ({ navigation }: any) => {
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
        data={MOCK_HISTORY}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: 20 }}
        renderItem={({ item }) => (
            <Surface style={styles.tripCard}>
                <View style={styles.tripHeader}>
                    <Text style={styles.dateText}>{item.date}</Text>
                    <View style={[styles.scoreBadge, { backgroundColor: item.score > 90 ? '#10B981' : '#F59E0B' }]}>
                        <Text style={styles.scoreText}>{item.score}</Text>
                    </View>
                </View>

                <View style={styles.routeContainer}>
                    <View style={styles.routeCol}>
                        <View style={styles.dot} />
                        <View style={styles.line} />
                        <View style={[styles.dot, { backgroundColor: '#4ECDC4' }]} />
                    </View>
                    <View style={styles.locCol}>
                        <Text style={styles.locText}>{item.from}</Text>
                        <Text style={[styles.locText, { marginTop: 22 }]}>{item.to}</Text>
                    </View>
                </View>

                <View style={styles.statsRow}>
                    <View style={styles.stat}>
                        <MaterialCommunityIcons name="map-marker-distance" size={16} color="#94A3B8" />
                        <Text style={styles.statText}>{item.distance}</Text>
                    </View>
                    <View style={styles.stat}>
                        <MaterialCommunityIcons name="clock-outline" size={16} color="#94A3B8" />
                        <Text style={styles.statText}>{item.duration}</Text>
                    </View>
                    <TouchableOpacity style={styles.detailsBtn}>
                        <Text style={styles.detailsText}>Details</Text>
                        <MaterialCommunityIcons name="chevron-right" size={16} color="#4ECDC4" />
                    </TouchableOpacity>
                </View>
            </Surface>
        )}
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
