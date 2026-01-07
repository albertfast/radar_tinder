import React from 'react';
import { View, StyleSheet, TouchableOpacity, Platform, Dimensions, Alert } from 'react-native';
import { createDrawerNavigator, DrawerContentScrollView } from '@react-navigation/drawer';
import { Text, Avatar } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInLeft, FadeInDown } from 'react-native-reanimated';
import { useAuthStore } from '../store/authStore';
import RadarNavigator from './RadarNavigator';
import { BlurView } from 'expo-blur';

const Drawer = createDrawerNavigator();
const { width } = Dimensions.get('window');
const allowLayoutAnimations = Platform.OS !== 'android';

const CustomDrawerContent = (props: any) => {
  const { user, logout } = useAuthStore();

  const menuItems = [
    { icon: 'radar', label: 'Radar Map', screen: 'RadarMain', color: '#FF5252' },
    { icon: 'alert-decagram', label: 'Alerts', screen: 'Alerts', color: '#FFA726' },
    { icon: 'car-cog', label: 'AI Diagnosis', screen: 'AIDiagnose', color: '#4ECDC4' },
    { icon: 'trophy-outline', label: 'Leaderboard', screen: 'Leaderboard', color: '#FFD700' },
  ];

  const secondaryItems = [
    { icon: 'cog-outline', label: 'Settings', screen: 'Settings' },
    { icon: 'help-circle-outline', label: 'Support', action: () => Alert.alert('Support', 'Support is coming soon.') },
  ];

  const handleNavigate = (screen: string) => {
    props.navigation.navigate('MainStack', { screen });
  };

  return (
    <View style={styles.container}>
        {/* Background Gradient */}
        <LinearGradient
            colors={['#0F172A', '#1E293B', '#020617']}
            style={StyleSheet.absoluteFillObject}
        />
        
        {/* Header Profile Section with Glass effect if possible, else gradient overlay */}
        <View style={styles.profileSection}>
             <LinearGradient
                colors={['rgba(255, 82, 82, 0.15)', 'transparent']}
                style={StyleSheet.absoluteFillObject}
             />
             <TouchableOpacity 
                style={styles.profileHeader}
                onPress={() => handleNavigate('Profile')}
             >
                <Animated.View entering={allowLayoutAnimations ? FadeInDown.delay(200) : undefined}>
                     <View style={styles.avatarContainer}>
                         {user?.profileImage ? (
                             <Avatar.Image source={{ uri: user.profileImage }} size={70} />
                         ) : (
                             <Avatar.Text 
                                label={user?.name?.substring(0, 2).toUpperCase() || 'US'} 
                                size={70} 
                                style={{backgroundColor: '#FF5252'}} 
                                labelStyle={{ fontWeight: 'bold' }}
                             />
                         )}
                         <View style={styles.badgeContainer}>
                             <MaterialCommunityIcons name="star-circle" size={24} color="#FFD700" />
                         </View>
                     </View>
                </Animated.View>
                
                <View style={styles.profileInfo}>
                    <Text style={styles.userName}>{user?.name || 'Guest User'}</Text>
                    <Text style={styles.userEmail}>{user?.email}</Text>
                    
                    <View style={styles.levelTag}>
                        <MaterialCommunityIcons name="speedometer" size={14} color="#4ECDC4" />
                        <Text style={styles.levelText}>Rookie Pilot • Lvl {user?.level || 1}</Text>
                    </View>
                </View>
             </TouchableOpacity>

             {/* Vehicle Card Mini */}
             {user?.carDetails && (
                 <Animated.View entering={allowLayoutAnimations ? FadeInLeft.delay(300) : undefined} style={styles.vehicleCard}>
                     <MaterialCommunityIcons name="car-sports" size={28} color="#FF5252" />
                     <View style={{marginLeft: 12}}>
                         <Text style={styles.vehicleName}>{user.carDetails.brand} {user.carDetails.model}</Text>
                         <Text style={styles.vehicleDetail}>{user.carDetails.year} • {user.carDetails.km} km</Text>
                     </View>
                 </Animated.View>
             )}
        </View>

        <DrawerContentScrollView {...props} contentContainerStyle={styles.drawerContent}>
            <View style={styles.menuSection}>
                <Text style={styles.sectionHeader}>NAVIGATION</Text>
                {menuItems.map((item, index) => (
                    <Animated.View key={item.label} entering={allowLayoutAnimations ? FadeInLeft.delay(400 + (index * 50)) : undefined}>
                        <TouchableOpacity 
                            style={styles.menuItem} 
                            onPress={() => handleNavigate(item.screen)}
                        >
                            <View style={[styles.menuIconBox, { backgroundColor: item.color + '20' }]}>
                                <MaterialCommunityIcons name={item.icon as any} size={22} color={item.color} />
                            </View>
                            <Text style={styles.menuLabel}>{item.label}</Text>
                            <MaterialCommunityIcons name="chevron-right" size={20} color="#64748B" />
                        </TouchableOpacity>
                    </Animated.View>
                ))}
            </View>

            <View style={styles.separator} />

            <View style={styles.menuSection}>
                 <Text style={styles.sectionHeader}>SYSTEM</Text>
                 {secondaryItems.map((item, index) => (
                    <TouchableOpacity 
                        key={item.label}
                        style={styles.menuItem} 
                        onPress={() => {
                          if (item.screen) {
                            handleNavigate(item.screen);
                            return;
                          }
                          item.action?.();
                        }}
                    >
                        <MaterialCommunityIcons name={item.icon as any} size={22} color="#94A3B8" style={{marginLeft: 10, marginRight: 16}} />
                        <Text style={[styles.menuLabel, { color: '#94A3B8' }]}>{item.label}</Text>
                    </TouchableOpacity>
                 ))}
            </View>
        </DrawerContentScrollView>

        {/* Footer */}
        <View style={styles.footer}>
             <TouchableOpacity style={styles.logoutButton} onPress={logout}>
                 <MaterialCommunityIcons name="logout" size={20} color="#FF5252" />
                 <Text style={styles.logoutText}>Log Out</Text>
             </TouchableOpacity>
             <Text style={styles.versionText}>RADAR TINDER v1.0.2</Text>
        </View>
    </View>
  );
}

const MainDrawerNavigator = () => {
    return (
        <Drawer.Navigator
            drawerContent={(props) => <CustomDrawerContent {...props} />}
            screenOptions={{
                headerShown: false,
                drawerStyle: {
                    backgroundColor: '#0F172A',
                    width: width * 0.8,
                },
                drawerType: 'slide',
                overlayColor: 'rgba(0,0,0,0.8)',
                sceneContainerStyle: { backgroundColor: '#0F172A' },
            }}
        >
            <Drawer.Screen name="MainStack" component={RadarNavigator} />
        </Drawer.Navigator>
    );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  profileSection: {
    padding: 24,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  avatarContainer: {
    position: 'relative',
  },
  badgeContainer: {
    position: 'absolute',
    bottom: -6,
    right: -6,
    backgroundColor: '#0F172A',
    borderRadius: 12,
  },
  profileInfo: {
    marginLeft: 16,
    flex: 1,
  },
  userName: {
    color: '#F8FAFC',
    fontSize: 20,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  userEmail: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
  levelTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(78, 205, 196, 0.1)',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 8,
    gap: 4,
  },
  levelText: {
    color: '#4ECDC4',
    fontSize: 11,
    fontWeight: 'bold',
  },
  vehicleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  vehicleName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  vehicleDetail: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  drawerContent: {
    paddingTop: 20,
  },
  sectionHeader: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 1.5,
    marginBottom: 10,
    marginLeft: 24,
    marginTop: 10,
  },
  menuSection: {
    marginBottom: 10,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginHorizontal: 8,
  },
  menuIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  menuLabel: {
    color: '#F8FAFC',
    fontSize: 16,
    flex: 1,
    fontWeight: '500',
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginVertical: 10,
    marginHorizontal: 24,
  },
  footer: {
    padding: 24,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
    marginBottom: 20,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 82, 82, 0.1)',
    padding: 16,
    borderRadius: 12,
    justifyContent: 'center',
  },
  logoutText: {
    color: '#FF5252',
    fontWeight: 'bold',
    marginLeft: 10,
    fontSize: 16,
  },
  versionText: {
    color: '#475569',
    textAlign: 'center',
    fontSize: 10,
    marginTop: 16,
    letterSpacing: 1,
  }
});

export default MainDrawerNavigator;
