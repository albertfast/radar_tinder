import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { TAB_BAR_HEIGHT } from '../constants/layout';
import { LocationPermissionStatus } from '../services/LocationService';

type LocationPermissionGateProps = {
  title: string;
  body: string;
  permissionStatus: LocationPermissionStatus;
  isRequestingPermission: boolean;
  onContinue: () => void;
  onOpenSettings: () => void;
  onDismiss?: () => void;
};

export function LocationPermissionGate({
  title,
  body,
  permissionStatus,
  isRequestingPermission,
  onContinue,
  onOpenSettings,
  onDismiss,
}: LocationPermissionGateProps) {
  const showSettingsAction = permissionStatus === 'denied';

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#020617', '#0F172A', '#020617']} style={StyleSheet.absoluteFill} />
      <View style={styles.content}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <MaterialCommunityIcons name="crosshairs-gps" size={28} color="#5EEAD4" />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>

          {!showSettingsAction ? (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={onContinue}
              disabled={isRequestingPermission}
            >
              {isRequestingPermission ? (
                <ActivityIndicator color="#08111D" />
              ) : (
                <Text style={styles.primaryButtonText}>Continue</Text>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.primaryButton} onPress={onOpenSettings}>
              <Text style={styles.primaryButtonText}>Open Settings</Text>
            </TouchableOpacity>
          )}

          {showSettingsAction ? (
            <Text style={styles.hint}>
              Location access is still off. Enable it in Settings, then return here to continue.
            </Text>
          ) : (
            <Text style={styles.hint}>
              The permission request appears only when you choose to continue.
            </Text>
          )}

          {onDismiss ? (
            <TouchableOpacity style={styles.secondaryButton} onPress={onDismiss}>
              <Text style={styles.secondaryButtonText}>Not now</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingBottom: TAB_BAR_HEIGHT,
  },
  card: {
    borderRadius: 24,
    padding: 24,
    backgroundColor: 'rgba(15, 23, 42, 0.94)',
    borderWidth: 1,
    borderColor: 'rgba(94, 234, 212, 0.2)',
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(45, 212, 191, 0.12)',
    marginBottom: 16,
  },
  title: {
    color: '#F8FAFC',
    fontSize: 24,
    fontWeight: '800',
  },
  body: {
    color: '#CBD5E1',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 10,
  },
  primaryButton: {
    marginTop: 22,
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: '#5EEAD4',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    color: '#08111D',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  hint: {
    marginTop: 12,
    color: '#94A3B8',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  secondaryButton: {
    marginTop: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '700',
  },
});
