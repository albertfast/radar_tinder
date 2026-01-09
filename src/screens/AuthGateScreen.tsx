import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Platform, Alert } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { FirebaseAuthService } from '../services/FirebaseAuthService';
import { useAuthStore } from '../store/authStore';

const AuthGateScreen = () => {
  const { signInWithProvider, hydrateFromSupabaseSession, isLoading } = useAuthStore();
  const [bootstrapping, setBootstrapping] = useState(true);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    FirebaseAuthService.configureGoogle();
  }, []);

  useEffect(() => {
    const checkApple = async () => {
      if (Platform.OS !== 'ios') return;
      const available = await AppleAuthentication.isAvailableAsync();
      setAppleAvailable(available);
    };
    checkApple();
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      const restored = await hydrateFromSupabaseSession();
      setBootstrapping(false);
      if (restored) return;
    };
    bootstrap();
  }, [hydrateFromSupabaseSession]);

  const handleGoogle = async () => {
    try {
      const result = await FirebaseAuthService.signInWithGoogle();
      await signInWithProvider({
        provider: 'google',
        idToken: result.idToken,
        profile: result.profile,
      });
    } catch (error: any) {
      Alert.alert('Google Sign-in Failed', error?.message || 'Please try again.');
    }
  };

  const handleApple = async () => {
    try {
      const result = await FirebaseAuthService.signInWithApple();
      await signInWithProvider({
        provider: 'apple',
        idToken: result.idToken,
        nonce: result.nonce,
        profile: result.profile,
      });
    } catch (error: any) {
      if (error?.code === 'ERR_REQUEST_CANCELED') return;
      Alert.alert('Apple Sign-in Failed', error?.message || 'Please try again.');
    }
  };

  if (bootstrapping) {
    return (
      <View style={styles.bootContainer}>
        <ActivityIndicator size="large" color="#4ECDC4" />
        <Text style={styles.bootText}>Preparing your account…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#020617', '#0F172A', '#020617']} style={StyleSheet.absoluteFill} />
      <View style={styles.hero}>
        <Text style={styles.title}>Radar Tinder</Text>
        <Text style={styles.subtitle}>
          Join the safe driving network with a single tap.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Continue with</Text>

        {Platform.OS === 'ios' && appleAvailable ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={12}
            style={styles.appleButton}
            onPress={handleApple}
          />
        ) : null}

        <TouchableOpacity style={styles.googleButton} onPress={handleGoogle}>
          <MaterialCommunityIcons name="google" size={20} color="#111827" />
          <Text style={styles.googleText}>Continue with Google</Text>
        </TouchableOpacity>

        {isLoading ? <ActivityIndicator style={{ marginTop: 16 }} /> : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  hero: { marginBottom: 30, alignItems: 'center' },
  title: { color: 'white', fontSize: 32, fontWeight: '900', letterSpacing: 1 },
  subtitle: { color: '#94A3B8', marginTop: 8, textAlign: 'center' },
  card: {
    backgroundColor: '#0B1220',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(78,205,196,0.15)',
  },
  cardTitle: { color: '#E2E8F0', fontWeight: '600', marginBottom: 14 },
  appleButton: { width: '100%', height: 48, marginBottom: 12 },
  googleButton: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  googleText: { color: '#0F172A', fontWeight: '700' },
  bootContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#020617' },
  bootText: { color: '#94A3B8', marginTop: 12 },
});

export default AuthGateScreen;
