import React, { useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Dimensions, Platform } from 'react-native';
import { Text, Surface, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { 
  FadeInRight, 
  FadeInUp, 
  useAnimatedStyle, 
  useSharedValue, 
  withSpring,
  interpolate,
  Extrapolate
} from 'react-native-reanimated';

const { width } = Dimensions.get('window');
const allowLayoutAnimations = Platform.OS !== 'android';

const AlertCard3D = ({ alert, index }: any) => {
  const offset = useSharedValue(50);
  const rotation = useSharedValue(10);

  useEffect(() => {
    offset.value = withSpring(0, { damping: 12, stiffness: 90 });
    rotation.value = withSpring(0, { damping: 12, stiffness: 90 });
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateY: offset.value },
        { perspective: 1000 },
        { rotateX: `${rotation.value}deg` },
        { scale: interpolate(offset.value, [0, 50], [1, 0.9], Extrapolate.CLAMP) }
      ],
      opacity: interpolate(offset.value, [0, 50], [1, 0], Extrapolate.CLAMP)
    };
  });

  return (
    <Animated.View style={[styles.alertWrapper, animatedStyle]}>
      <Surface style={styles.alertCard} elevation={4}>
        <LinearGradient
          colors={['#1C1C1E', '#252525']}
          style={styles.cardGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.alertLeftBar} />
          <View style={styles.alertContent}>
            <View style={styles.alertHeader}>
              <View style={[styles.alertIconContainer, { shadowColor: '#FF5252', shadowOpacity: 0.5, shadowRadius: 10 }]}>
                <MaterialCommunityIcons name="alert" size={28} color="#FF5252" />
              </View>
              <View style={styles.alertTitleContainer}>
                <Text style={styles.alertTitle}>{alert.type}</Text>
                <Text style={styles.alertSubtitle}>{alert.distance} away</Text>
              </View>
              <TouchableOpacity style={styles.okButton}>
                <Text style={styles.okButtonText}>OK</Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.alertFooter}>
              <View style={styles.metaItem}>
                <MaterialCommunityIcons name="clock-outline" size={14} color="#666" />
                <Text style={styles.alertMeta}> ETA: {alert.eta}</Text>
              </View>
              <Text style={styles.alertMeta}>{alert.time}</Text>
            </View>
          </View>
        </LinearGradient>
      </Surface>
    </Animated.View>
  );
};

const AlertsScreen = ({ navigation }: any) => {
  // In a real app, this would come from useRadarStore()
  // For now, we simulate "Live" alerts based on props or random generation to satisfy the user request for "flow"
  const [activeAlerts, setActiveAlerts] = React.useState<any[]>([
      { id: 1, type: 'Radar Detected', distance: '0.3 km', eta: '0.0 min', time: new Date().toLocaleTimeString(), severity: 'high' }
  ]);

  // Simulate incoming alerts while "driving"
  useEffect(() => {
      const interval = setInterval(() => {
          if (Math.random() > 0.7) {
              const newAlert = {
                  id: Date.now(),
                  type: Math.random() > 0.5 ? 'Speed Trap' : 'Police',
                  distance: (Math.random() * 2).toFixed(1) + ' km',
                  eta: '1.2 min',
                  time: new Date().toLocaleTimeString(),
                  severity: Math.random() > 0.5 ? 'high' : 'medium'
              };
              setActiveAlerts(prev => [newAlert, ...prev].slice(0, 5));
          }
      }, 5000);
      return () => clearInterval(interval);
  }, []);

  const historyAlerts = [
    { id: 3, type: 'Speed Trap', distance: '1.2 km', time: 'Yesterday', severity: 'medium' },
    { id: 4, type: 'Red Light Camera', distance: '5.4 km', time: '2 days ago', severity: 'low' },
  ];

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#000000', '#121212']}
        style={styles.background}
      />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{marginRight: 15}}>
          <MaterialCommunityIcons name="chevron-left" size={32} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Alerts</Text>
        <View style={{flex:1}} />
        <TouchableOpacity onPress={() => console.log('Clear All')}>
          <Text style={styles.clearAllText}>Clear All</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Active Alerts ({activeAlerts.length})</Text>
        
        {activeAlerts.map((alert, index) => (
          <AlertCard3D key={alert.id} alert={alert} index={index} />
        ))}

        <Text style={[styles.sectionTitle, { marginTop: 30 }]}>Alert History</Text>
        
        {historyAlerts.map((alert, index) => (
          <Animated.View
            key={alert.id}
            entering={allowLayoutAnimations ? FadeInUp.delay(300 + (index * 100)) : undefined}
          >
            <Surface style={styles.historyCard} elevation={1}>
              <View style={styles.historyIcon}>
                <MaterialCommunityIcons 
                  name={alert.severity === 'high' ? "alert-octagon" : "alert-circle-outline"} 
                  size={24} 
                  color="#8E8E93" 
                />
              </View>
              <View style={styles.historyContent}>
                <Text style={styles.historyTitle}>{alert.type}</Text>
                <Text style={styles.historySubtitle}>{alert.distance} • {alert.time}</Text>
              </View>
            </Surface>
          </Animated.View>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000', paddingTop: 50 },
  background: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 20 },
  headerTitle: { fontSize: 28, fontWeight: 'bold', color: 'white' },
  clearAllText: { color: '#FF5252', fontSize: 16, fontWeight: '600' },
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  sectionTitle: { color: 'white', fontSize: 18, fontWeight: 'bold', marginBottom: 15 },
  
  alertWrapper: { marginBottom: 20 },
  alertCard: { borderRadius: 16, overflow: 'hidden', backgroundColor: '#1C1C1E', transform: [{ perspective: 1000 }] },
  cardGradient: { flexDirection: 'row' },
  alertLeftBar: { width: 6, backgroundColor: '#FF5252' },
  alertContent: { flex: 1, padding: 15 },
  alertHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  alertIconContainer: { marginRight: 15 },
  alertTitleContainer: { flex: 1 },
  alertTitle: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  alertSubtitle: { color: '#8E8E93', fontSize: 14 },
  okButton: { backgroundColor: '#FF6B35', paddingHorizontal: 15, paddingVertical: 6, borderRadius: 20, shadowColor: '#FF6B35', shadowOpacity: 0.4, shadowRadius: 5 },
  okButtonText: { color: 'white', fontWeight: 'bold', fontSize: 12 },
  alertFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaItem: { flexDirection: 'row', alignItems: 'center' },
  alertMeta: { color: '#666', fontSize: 12 },
  
  historyCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1C1C1E', padding: 15, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#333' },
  historyIcon: { marginRight: 15 },
  historyContent: { flex: 1 },
  historyTitle: { color: 'white', fontSize: 16, fontWeight: '600' },
  historySubtitle: { color: '#8E8E93', fontSize: 12, marginTop: 2 },
});

export default AlertsScreen;
