import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Image,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Linking,
} from 'react-native';
import { Text, Surface, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInUp, SlideInRight } from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import { ANIMATION_TIMING, STAGGER_DELAYS } from '../utils/animationConstants';
import { HapticPatterns } from '../utils/hapticFeedback';
import { SupabaseService } from '../services/SupabaseService';
import { ProfileMediaService } from '../services/ProfileMediaService';
import { TAB_BAR_HEIGHT } from '../constants/layout';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { appVersion, nativeBuildVersion } from '../utils/buildInfo';
import {
  APP_PRIVACY_POLICY_URL,
  APP_STANDARD_EULA_URL,
  APP_TERMS_URL,
} from '../config/appIdentity';

const StatBadge = ({ icon, value, label, color = '#4ECDC4', delay = 0 }: any) => (
  <Animated.View
    entering={FadeInDown.delay(delay).duration(ANIMATION_TIMING.BASE)}
    style={styles.statItem}
  >
    <View style={[styles.statIconBox, { backgroundColor: `${color}20` }]}>
      <MaterialCommunityIcons name={icon} size={24} color={color} />
    </View>
    <Text style={styles.statNumber}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </Animated.View>
);

const MenuButton = ({ icon, label, subLabel, onPress, color = 'white', delay = 0 }: any) => (
  <Animated.View
    entering={FadeInUp.delay(delay).duration(ANIMATION_TIMING.BASE)}
    style={styles.menuBtn}
  >
    <TouchableOpacity
      onPress={() => {
        HapticPatterns.medium();
        onPress();
      }}
      style={styles.menuBtnContent}
      accessibilityLabel={label}
      accessibilityHint={subLabel}
      accessibilityRole="button"
    >
      <LinearGradient
        colors={['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.02)']}
        style={styles.menuGradient}
      >
        <View style={[styles.menuIcon, { backgroundColor: `${color}15` }]}>
          <MaterialCommunityIcons name={icon} size={24} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.menuLabel}>{label}</Text>
          {subLabel && <Text style={styles.menuSubLabel}>{subLabel}</Text>}
        </View>
        <MaterialCommunityIcons name="chevron-right" size={24} color="#64748B" />
      </LinearGradient>
    </TouchableOpacity>
  </Animated.View>
);

const ProfileScreen = ({ navigation }: any) => {
  const { user, logout, updateUser, normalizeAccessState, refreshProfile } = useAuthStore();
  const { unitSystem } = useSettingsStore();
  const insets = useSafeAreaInsets();
  const tabBarInset = TAB_BAR_HEIGHT + Math.max(insets.bottom, 10) + 16;

  const handleLogout = async () => {
    // Ensure admin overrides are cleared when the user signs out.
    updateUser({ 
      isAdminSession: false,
      subscriptionType: 'free'
    });
    await logout();
  };
  const handleExitAdminMode = async () => {
    if (user?.id === 'local-admin') {
      await logout();
      Alert.alert('Admin mode disabled', 'Local admin mode was cleared.');
      return;
    }

    updateUser({
      isAdminSession: false,
    });
    await normalizeAccessState();
    Alert.alert('Admin mode disabled', 'The app returned to your normal account permissions.');
  };
  const [isEditing, setIsEditing] = useState(false);
  const [username, setUsername] = useState(user?.username || user?.name || '');
  const [uploadingMediaType, setUploadingMediaType] = useState<'profile' | 'car' | null>(null);
  const [resolvedProfileImage, setResolvedProfileImage] = useState<string | null>(null);
  const [resolvedCarImage, setResolvedCarImage] = useState<string | null>(null);
  const mediaRefreshAttemptedRef = useRef<{ profile: boolean; car: boolean }>({
    profile: false,
    car: false,
  });
  
  // Local state for editing
  const [carBrand, setCarBrand] = useState(user?.carDetails?.brand || '');
  const [carModel, setCarModel] = useState(user?.carDetails?.model || '');
  const [carYear, setCarYear] = useState(user?.carDetails?.year || '');
  const [carKm, setCarKm] = useState(user?.carDetails?.km || '');

  const handleSave = () => {
    updateUser({
      carDetails: { brand: carBrand, model: carModel, year: carYear, km: carKm }
    });
    setIsEditing(false);
  };

  const resolveProfileMedia = useCallback(async () => {
    const nextProfileImage = await ProfileMediaService.resolveDisplayUri({
      userId: user?.id,
      type: 'profile',
      primaryUri: user?.profileImage || user?.avatarUrl || null,
    });
    const nextCarImage = await ProfileMediaService.resolveDisplayUri({
      userId: user?.id,
      type: 'car',
      primaryUri: user?.carImage || null,
    });

    setResolvedProfileImage((current) => (current === nextProfileImage ? current : nextProfileImage));
    setResolvedCarImage((current) => (current === nextCarImage ? current : nextCarImage));
  }, [user?.avatarUrl, user?.carImage, user?.id, user?.profileImage]);

  useEffect(() => {
    mediaRefreshAttemptedRef.current = {
      profile: false,
      car: false,
    };
    void resolveProfileMedia();
  }, [resolveProfileMedia]);

  const handleMediaRenderError = useCallback(
    (type: 'profile' | 'car') => {
      const primaryUri =
        type === 'profile' ? user?.profileImage || user?.avatarUrl || null : user?.carImage || null;

      void (async () => {
        const fallbackUri = await ProfileMediaService.resolveDisplayUri({
          userId: user?.id,
          type,
          primaryUri,
          preferLocal: true,
        });
        const safeFallback =
          fallbackUri && fallbackUri === primaryUri && /^https?:\/\//i.test(fallbackUri)
            ? null
            : fallbackUri;

        if (type === 'profile') {
          setResolvedProfileImage(safeFallback);
        } else {
          setResolvedCarImage(safeFallback);
        }

        if (user?.id && !mediaRefreshAttemptedRef.current[type]) {
          mediaRefreshAttemptedRef.current[type] = true;
          await refreshProfile().catch(() => {});
        }
      })();
    },
    [refreshProfile, user?.avatarUrl, user?.carImage, user?.id, user?.profileImage]
  );

  const pickImage = async (type: 'profile' | 'car') => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: type === 'profile' ? [1, 1] : [16, 9],
      quality: 1,
    });

    if (result.canceled || !result.assets?.[0]?.uri) return;

    const sourceUri = result.assets[0].uri;
    if (!user?.id) {
      updateUser(
        type === 'profile'
          ? { avatarUrl: sourceUri, profileImage: sourceUri }
          : { carImage: sourceUri }
      );
      return;
    }

    setUploadingMediaType(type);
    try {
      const media = await ProfileMediaService.saveMedia({
        userId: user.id,
        type,
        sourceUri,
      });
      const persistedUri = media.remoteUrl || media.localUri;

      const updatedProfile = await SupabaseService.updateProfile(
        user.id,
        type === 'profile'
          ? { avatar_url: persistedUri }
          : { car_image_url: persistedUri }
      );

      const syncedUri =
        type === 'profile'
          ? updatedProfile?.avatar_url || persistedUri
          : updatedProfile?.car_image_url || persistedUri;

      updateUser(
        type === 'profile'
          ? { avatarUrl: syncedUri, profileImage: syncedUri }
          : { carImage: syncedUri }
      );
    } catch (error) {
      console.error('Profile media save failed:', error);
      Alert.alert('Upload failed', 'Could not save this image right now. Please try again.');
    } finally {
      setUploadingMediaType(null);
    }
  };

  const handleUsernameSave = async () => {
    const clean = username.trim();
    if (!clean) {
      Alert.alert('Username', 'Please enter a username.');
      return;
    }

    const currentUsername = (user?.username || user?.name || '').trim();
    if (clean.toLowerCase() === currentUsername.toLowerCase()) {
      return;
    }

    if (!user?.id) {
      updateUser({ username: clean, name: clean, displayName: clean });
      return;
    }

    const available = await SupabaseService.isUsernameAvailable(clean, user.id);
    if (available === false) {
      Alert.alert('Username unavailable', 'This username is already in use. Please choose another one.');
      return;
    }

    const updated = await SupabaseService.updateProfile(user.id, {
      username: clean,
      display_name: clean,
    });

    if (updated) {
      updateUser({ username: clean, name: clean, displayName: clean });
      return;
    }

    const availableAfterFail = await SupabaseService.isUsernameAvailable(clean, user.id);
    if (availableAfterFail === false) {
      Alert.alert('Username unavailable', 'This username was just taken. Please choose another one.');
    } else {
      Alert.alert('Save failed', 'Could not update username right now. Please try again.');
    }
    setUsername(currentUsername);
  };

  const openExternalLink = async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert('Link unavailable', 'Please try again in Safari.');
        return;
      }
      await Linking.openURL(url);
    } catch {
      Alert.alert('Link unavailable', 'Please try again in Safari.');
    }
  };

  return (
    <Animated.View
      style={styles.container}
      entering={SlideInRight.duration(ANIMATION_TIMING.SLOW)}
    >
      {/* Background with subtle gradient */}
      <LinearGradient
        colors={['#0F172A', '#020617']}
        style={styles.background}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Custom Header */}
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <IconButton
              icon="arrow-left"
              iconColor="white"
              onPress={() => {
                HapticPatterns.light();
                navigation.goBack();
              }}
              accessibilityLabel="Go back to previous screen"
              accessibilityRole="button"
            />
            <Text style={styles.appTitle}>PROFILE</Text>
          </View>
          <IconButton
            icon="logout"
            iconColor="#EF4444"
            size={24}
            style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)' }}
            onPress={handleLogout}
            accessibilityLabel="Sign out"
            accessibilityHint="Logs you out of the application"
            accessibilityRole="button"
          />
        </View>

        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: tabBarInset + 24 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}
        >
        
        {/* Profile Card */}
        <Animated.View
          style={styles.profileSection}
          entering={FadeInDown.duration(ANIMATION_TIMING.BASE)}
        >
            <TouchableOpacity onPress={() => pickImage('profile')} style={styles.avatarContainer}>
              <LinearGradient colors={['#4ECDC4', '#2196F3']} style={styles.avatarRing}>
                 {resolvedProfileImage ? (
                   <Image
                     source={{ uri: resolvedProfileImage }}
                     style={styles.avatarImage}
                     onError={() => {
                       handleMediaRenderError('profile');
                     }}
                   />
                 ) : (
                    <View style={[styles.avatarImage, { backgroundColor: '#1E293B', justifyContent: 'center', alignItems: 'center' }]}>
                        <Text style={{color: 'white', fontSize: 30, fontWeight: 'bold'}}>{user?.name?.substring(0, 2).toUpperCase() || 'US'}</Text>
                    </View>
                 )}
              </LinearGradient>
              <View
                style={[
                  styles.editBadge,
                  uploadingMediaType === 'profile' && styles.editBadgeBusy,
                ]}
              >
                 <MaterialCommunityIcons name="camera" size={12} color="white" />
              </View>
            </TouchableOpacity>

            <Animated.Text
              style={styles.userName}
              entering={FadeInDown.delay(100).duration(ANIMATION_TIMING.BASE)}
            >
              {user?.username || user?.name || 'Rookie Driver'}
            </Animated.Text>
            
            <Animated.View
              style={styles.levelBadge}
              entering={FadeInDown.delay(150).duration(ANIMATION_TIMING.BASE)}
            >
                <MaterialCommunityIcons name="shield-star" size={16} color="#FFD700" />
                <Text style={styles.levelText}>Level {user?.level || 1} • {user?.rank || 'Novice'}</Text>
            </Animated.View>

            {user?.isAdminSession ? (
              <Animated.View
                style={styles.adminBadge}
                entering={FadeInDown.delay(165).duration(ANIMATION_TIMING.BASE)}
              >
                <MaterialCommunityIcons name="shield-crown" size={16} color="#FCA5A5" />
                <Text style={styles.adminBadgeText}>Admin mode active</Text>
              </Animated.View>
            ) : null}

            {/* Username / leaderboard handle */}
            <Animated.View
              entering={FadeInDown.delay(180).duration(ANIMATION_TIMING.BASE)}
              style={styles.usernameCard}
            >
              <Text style={styles.usernameLabel}>Username for leaderboard</Text>
              <View style={styles.usernameRow}>
                  <TextInput
                    style={styles.usernameInput}
                    value={username}
                    onChangeText={setUsername}
                    placeholder="Enter username"
                    placeholderTextColor="#64748B"
                    autoCapitalize="none"
                  />
                  <TouchableOpacity style={styles.usernameSave} onPress={handleUsernameSave}>
                    <Text style={styles.usernameSaveText}>Save</Text>
                  </TouchableOpacity>
              </View>
            </Animated.View>

            {/* XP Bar using Gradients */}
            <Animated.View
              style={styles.xpWrapper}
              entering={FadeInDown.delay(200).duration(ANIMATION_TIMING.BASE)}
            >
                 <Text style={styles.xpLabel}>{user?.points || 0} XP</Text>
                 <View style={styles.xpTrack}>
                    <LinearGradient 
                        colors={['#4ECDC4', '#2196F3']} 
                        start={{x:0, y:0}} end={{x:1, y:0}}
                        style={[styles.xpFill, { width: `${Math.min(((user?.xp || 0) % 100), 100)}%` }]} 
                    />
                 </View>
                 <Text style={styles.xpLabel}>Next Lvl</Text>
            </Animated.View>
        </Animated.View>

        {/* Stats Grid */}
        <Animated.View
          style={styles.statsGrid}
          entering={FadeInDown.delay(250).duration(ANIMATION_TIMING.BASE)}
        >
            <StatBadge 
                icon="map-marker-distance" 
                value={(unitSystem === 'metric' 
                    ? (user?.stats?.distanceDriven || 0).toLocaleString() 
                    : ((user?.stats?.distanceDriven || 0) * 0.621371).toFixed(1))} 
                label={unitSystem === 'metric' ? "km Driven" : "mi Driven"} 
                color="#4ECDC4"
                delay={0}
            />
            <StatBadge 
              icon="bullhorn-outline" 
              value={user?.stats?.reports || 0} 
              label="Reports" 
              color="#FFD700"
              delay={STAGGER_DELAYS.ITEM_FAST}
            />
            <StatBadge 
              icon="check-decagram" 
              value={user?.stats?.confirmations || 0} 
              label="Helped" 
              color="#A855F7"
              delay={STAGGER_DELAYS.ITEM_FAST * 2}
            />
        </Animated.View>

        {/* Garage Section */}
        <Text style={styles.sectionHeader}>MY GARAGE</Text>
        <Surface style={styles.garageCard} elevation={4}>
            <LinearGradient colors={['#1E293B', '#0F172A']} style={styles.garageGradient}>
                <TouchableOpacity
                  onPress={() => pickImage('car')}
                  style={styles.carImageWrapper}
                  accessibilityLabel="Vehicle photo"
                  accessibilityHint="Tap to change your car photo"
                  accessibilityRole="button"
                >
                    {resolvedCarImage ? (
                        <Image
                          source={{ uri: resolvedCarImage }}
                          style={styles.carImage}
                          resizeMode="cover"
                          onError={() => {
                            handleMediaRenderError('car');
                          }}
                        />
                    ) : (
                        <LinearGradient colors={['#334155', '#1E293B']} style={styles.carPlaceholder}>
                            <MaterialCommunityIcons name="car-sports" size={60} color="rgba(255,255,255,0.1)" />
                            <Text style={styles.addPhotoText}>Add Vehicle Photo</Text>
                        </LinearGradient>
                    )}
                    <View
                      style={[
                        styles.carImageBadge,
                        uploadingMediaType === 'car' && styles.editBadgeBusy,
                      ]}
                    >
                      <MaterialCommunityIcons name="camera" size={14} color="#fff" />
                    </View>
                 </TouchableOpacity>
                 
                 <View style={styles.garageDetails}>
                     <View style={styles.garageHeaderRow}>
                         <Text style={styles.garageTitle}>{carBrand || 'Unknown'} {carModel || 'Vehicle'}</Text>
                         <TouchableOpacity
                           onPress={() => isEditing ? handleSave() : setIsEditing(true)}
                           accessibilityLabel={isEditing ? 'Save vehicle details' : 'Edit vehicle details'}
                           accessibilityRole="button"
                         >
                             <Text style={styles.editBtn}>{isEditing ? 'Done' : 'Edit'}</Text>
                         </TouchableOpacity>
                     </View>
                     
                     {isEditing ? (
                         <View style={styles.editGrid}>
                             <TextInput placeholder="Brand" placeholderTextColor="#64748B" value={carBrand} onChangeText={setCarBrand} style={styles.editInput} />
                             <TextInput placeholder="Model" placeholderTextColor="#64748B" value={carModel} onChangeText={setCarModel} style={styles.editInput} />
                             <TextInput placeholder="Year" placeholderTextColor="#64748B" value={String(carYear)} onChangeText={setCarYear} style={styles.editInput} keyboardType="numeric" />
                             <TextInput placeholder="Km" placeholderTextColor="#64748B" value={String(carKm)} onChangeText={setCarKm} style={styles.editInput} keyboardType="numeric" />
                         </View>
                     ) : (
                         <View style={styles.specsRow}>
                             <View style={styles.specItem}><Text style={styles.specVal}>{carYear || '----'}</Text><Text style={styles.specLabel}>Year</Text></View>
                             <View style={styles.sep} />
                             <View style={styles.specItem}><Text style={styles.specVal}>{carKm || '0'}</Text><Text style={styles.specLabel}>km</Text></View>
                             <View style={styles.sep} />
                             <View style={styles.specItem}><Text style={styles.specVal}>Stock</Text><Text style={styles.specLabel}>Trim</Text></View>
                         </View>
                     )}
                 </View>
            </LinearGradient>
        </Surface>

        {/* Menu Grid */}
        <Text style={styles.sectionHeader}>DASHBOARD</Text>
        <View style={styles.menuGrid}>
             <MenuButton
                icon="shield-crown"
                label="Admin Mode"
                subLabel={user?.isAdminSession ? 'Admin mode is currently active' : 'Enter admin testing mode'}
                color="#EF4444"
                onPress={() => {
                  navigation.navigate('AdminLogin');
                }}
             />
             {user?.isAdminSession && (
               <MenuButton
                  icon="shield-off"
                  label="Exit Admin Mode"
                  subLabel="Return to your normal account permissions"
                  color="#FCA5A5"
                  onPress={handleExitAdminMode}
               />
             )}
             <MenuButton 
                icon="trophy" 
                label="Leaderboard" 
                subLabel="Compare with others"
                color="#FFD700"
                onPress={() => navigation.navigate('Leaderboard')} 
             />
             <MenuButton 
                icon="cog" 
                label="Settings" 
                subLabel="Preferences & Legal"
                color="#94A3B8"
                onPress={() => navigation.navigate('Settings')} // Assume Settings handles legal too now? Or list individually? Let's use individual if strict
             />
        </View>
        
        <TouchableOpacity
          style={styles.legalLink}
          onPress={() => {
            void openExternalLink(APP_TERMS_URL);
          }}
          accessibilityLabel="Terms and Conditions"
          accessibilityRole="link"
        >
            <Text style={styles.legalText}>Terms & Conditions</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.legalLink}
          onPress={() => {
            void openExternalLink(APP_PRIVACY_POLICY_URL);
          }}
          accessibilityLabel="Privacy Policy"
          accessibilityRole="link"
        >
          <Text style={styles.legalText}>Privacy Policy</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.legalLink}
          onPress={() => {
            void openExternalLink(APP_STANDARD_EULA_URL);
          }}
          accessibilityLabel="Apple Standard EULA"
          accessibilityRole="link"
        >
          <Text style={styles.legalText}>Apple Standard EULA</Text>
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityRole="text"
          accessibilityLabel="Build information"
        >
          <Text style={styles.version}>v{appVersion} • build {nativeBuildVersion}</Text>
        </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617' },
  background: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: 60, paddingBottom: 10 },
  appTitle: { color: 'white', fontWeight: '900', fontSize: 24, letterSpacing: 1 },
  
  content: { padding: 20 },

  // Profile
  profileSection: { alignItems: 'center', marginBottom: 30 },
  avatarContainer: { marginBottom: 15 },
  avatarRing: { width: 110, height: 110, borderRadius: 55, padding: 3, justifyContent: 'center', alignItems: 'center' },
  avatarImage: { width: 100, height: 100, borderRadius: 50, borderWidth: 3, borderColor: '#020617' },
  editBadge: { position: 'absolute', bottom: 5, right: 5, backgroundColor: '#2563EB', padding: 6, borderRadius: 15, borderWidth: 2, borderColor: '#020617' },
  editBadgeBusy: { backgroundColor: '#0284C7' },
  
  userName: { color: 'white', fontSize: 28, fontWeight: 'bold' },
  levelBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255, 215, 0, 0.1)', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, marginTop: 8, borderWidth: 1, borderColor: 'rgba(255, 215, 0, 0.3)' },
  levelText: { color: '#FFD700', fontWeight: 'bold', fontSize: 13, marginLeft: 6 },
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(127, 29, 29, 0.45)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.35)',
  },
  adminBadgeText: {
    color: '#FECACA',
    fontWeight: '800',
    fontSize: 13,
    marginLeft: 6,
  },
  
  xpWrapper: { flexDirection: 'row', alignItems: 'center', width: '70%', marginTop: 20, gap: 10 },
  xpTrack: { flex: 1, height: 6, backgroundColor: '#1E293B', borderRadius: 3, overflow: 'hidden' },
  xpFill: { height: '100%', borderRadius: 3 },
  xpLabel: { color: '#64748B', fontSize: 10, fontWeight: 'bold' },
  usernameCard: { width: '100%', backgroundColor: 'rgba(15,23,42,0.85)', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', marginTop: 14 },
  usernameLabel: { color: '#94A3B8', fontSize: 12, fontWeight: '700', marginBottom: 6, letterSpacing: 0.4 },
  usernameRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  usernameInput: { flex: 1, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: 'white', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  usernameSave: { backgroundColor: '#4ECDC4', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  usernameSaveText: { color: '#0B1424', fontWeight: '800' },
  accountLinkCard: {
    marginBottom: 18,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(94, 234, 212, 0.18)',
  },
  accountLinkGradient: {
    padding: 18,
  },
  accountLinkHeader: {
    flexDirection: 'row',
    gap: 14,
  },
  accountLinkIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(94, 234, 212, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  accountLinkCopy: {
    flex: 1,
  },
  accountLinkTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6,
  },
  accountLinkBody: {
    color: '#C8D6E8',
    fontSize: 13,
    lineHeight: 19,
  },
  accountLinkDeadline: {
    color: '#5EEAD4',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 8,
  },
  accountLinkButtons: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 10,
  },
  accountLinkButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(94, 234, 212, 0.18)',
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  accountLinkButtonPrimary: {
    backgroundColor: '#5EEAD4',
    borderColor: '#5EEAD4',
  },
  accountLinkButtonText: {
    color: '#E2F8F6',
    fontSize: 13,
    fontWeight: '800',
  },
  accountLinkButtonPrimaryText: {
    color: '#08111D',
    fontSize: 13,
    fontWeight: '900',
  },

  // Stats
  statsGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 30 },
  statItem: { width: '31%', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 16, padding: 15, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  statIconBox: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  statNumber: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  statLabel: { color: '#64748B', fontSize: 11 },

  // Garage
  sectionHeader: { color: '#94A3B8', fontSize: 12, fontWeight: 'bold', marginBottom: 15, letterSpacing: 1 },
  garageCard: { borderRadius: 24, overflow: 'hidden', marginBottom: 30, backgroundColor: 'transparent' },
  garageGradient: { padding: 4 },
  carImageWrapper: { height: 180, borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden', backgroundColor: '#0F172A' },
  carImage: { width: '100%', height: '100%' },
  carImageBadge: {
    position: 'absolute',
    right: 14,
    bottom: 14,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.86)',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
  },
  carPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  addPhotoText: { color: '#64748B', marginTop: 10, fontWeight: '600' },
  
  garageDetails: { padding: 20, backgroundColor: 'rgba(15, 23, 42, 0.95)' },
  garageHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  garageTitle: { color: 'white', fontSize: 20, fontWeight: 'bold' },
  editBtn: { color: '#4ECDC4', fontSize: 14, fontWeight: 'bold' },
  
  specsRow: { flexDirection: 'row', alignItems: 'center' },
  specItem: { flex: 1, alignItems: 'center' },
  specVal: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  specLabel: { color: '#64748B', fontSize: 12 },
  sep: { width: 1, height: 20, backgroundColor: '#334155' },

  editGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  editInput: { width: '48%', backgroundColor: '#1E293B', color: 'white', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#334155' },

  // Menu
  menuGrid: { gap: 12, marginBottom: 30 },
  menuBtn: { borderRadius: 16, overflow: 'hidden', marginBottom: 12 },
  menuBtnContent: { width: '100%' },
  menuGradient: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  menuIcon: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  menuLabel: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  menuSubLabel: { color: '#64748B', fontSize: 12 },

  legalLink: { alignSelf: 'center', padding: 10 },
  legalText: { color: '#475569', fontSize: 12 },
  adContainer: {
    marginTop: 8,
    marginBottom: 10,
    alignItems: 'center',
  },
  version: { textAlign: 'center', color: '#334155', marginTop: 20, fontSize: 10 },
});

export default ProfileScreen;
