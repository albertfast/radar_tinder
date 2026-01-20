// @ts-nocheck
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Button,
  Alert,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useTheme } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../store/authStore';
import { LocationService } from '../services/LocationService';
import { RadarService } from '../services/RadarService';
import { OfflineService } from '../services/OfflineService';
import { AnalyticsService } from '../services/AnalyticsService';

const ReportRadarScreen = ({ navigation }: any) => {
  const theme = useTheme();
  const { user, refreshProfile } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [formData, setFormData] = useState({
    type: 'fixed' as 'fixed' | 'mobile' | 'red_light' | 'speed_camera',
    direction: '',
    speedLimit: '',
    notes: '',
  });

  React.useEffect(() => {
    getCurrentLocation();
  }, []);

  const getCurrentLocation = async () => {
    try {
      const location = await LocationService.getCurrentLocation();
      setCurrentLocation(location);
    } catch (error) {
      Alert.alert('Error', 'Unable to get current location');
    }
  };

  const handleSubmit = async () => {
    if (!currentLocation) {
      Alert.alert('Error', 'Please enable location services');
      return;
    }

    if (!user) {
      Alert.alert('Error', 'Please login to report radar locations');
      return;
    }

    setIsLoading(true);
    try {
      const radarData = {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        type: formData.type,
        direction: formData.direction || undefined,
        speedLimit: formData.speedLimit ? parseInt(formData.speedLimit) : undefined,
        confidence: 0.7,
        lastConfirmed: new Date(),
        reportedBy: user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Try to sync with server first
      await RadarService.reportRadarLocation(radarData);
      
      // Save offline as backup
      await OfflineService.saveRadarLocationOffline(radarData);

      await refreshProfile();
      
      await AnalyticsService.trackRadarReport({
          type: radarData.type,
          location: `${radarData.latitude},${radarData.longitude}`
      });

      Alert.alert('Success', 'Radar location reported successfully!');
      navigation.goBack();
    } catch (error) {
      console.error('Error reporting radar location:', error);
      
      // Save offline if online sync fails
      try {
        const offlineRadarData = {
          ...formData,
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
          confidence: 0.7,
          lastConfirmed: new Date(),
          reportedBy: user.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await OfflineService.saveRadarLocationOffline(offlineRadarData);
        Alert.alert('Saved Offline', 'Radar location saved and will sync when online');
        navigation.goBack();
      } catch (offlineError) {
        Alert.alert('Error', 'Failed to report radar location');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const radarTypes = [
    { value: 'fixed', label: 'Fixed Camera', icon: 'camera' },
    { value: 'mobile', label: 'Mobile Camera', icon: 'car' },
    { value: 'red_light', label: 'Red Light Camera', icon: 'stop-circle' },
    { value: 'speed_camera', label: 'Speed Camera', icon: 'speedometer' },
  ];

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          Report Radar
        </Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content}>
        <View style={[styles.locationCard, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
            Location
          </Text>
          {currentLocation ? (
            <View style={styles.locationInfo}>
              <Ionicons name="location" size={20} color={theme.colors.primary} />
              <Text style={[styles.locationText, { color: theme.colors.outline }]}>
                {currentLocation.latitude.toFixed(6)}, {currentLocation.longitude.toFixed(6)}
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.getLocationButton, { backgroundColor: theme.colors.primary }]}
              onPress={getCurrentLocation}
            >
              <Text style={[styles.getLocationText, { color: theme.colors.surface }]}>
                Get Current Location
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={[styles.typeCard, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
            Radar Type
          </Text>
          <View style={styles.typeGrid}>
            {radarTypes.map((type) => (
              <TouchableOpacity
                key={type.value}
                style={[
                  styles.typeButton,
                  formData.type === type.value && {
                    backgroundColor: theme.colors.primary + '20',
                    borderColor: theme.colors.primary,
                  },
                  { borderColor: theme.colors.outline },
                ]}
                onPress={() => setFormData({ ...formData, type: type.value as any })}
              >
                <Ionicons
                  name={type.icon as any}
                  size={24}
                  color={formData.type === type.value ? theme.colors.primary : theme.colors.outline}
                />
                <Text
                  style={[
                    styles.typeText,
                    { color: formData.type === type.value ? theme.colors.primary : theme.colors.text },
                  ]}
                >
                  {type.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={[styles.detailsCard, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
            Additional Details
          </Text>

          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: theme.colors.background,
                color: theme.colors.text,
                borderColor: theme.colors.outline,
              },
            ]}
            placeholder="Direction (e.g., North, South, etc.)"
            placeholderTextColor={theme.colors.outline}
            value={formData.direction}
            onChangeText={(text) => setFormData({ ...formData, direction: text })}
          />

          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: theme.colors.background,
                color: theme.colors.text,
                borderColor: theme.colors.outline,
              },
            ]}
            placeholder="Speed Limit (km/h)"
            placeholderTextColor={theme.colors.outline}
            value={formData.speedLimit}
            onChangeText={(text) => setFormData({ ...formData, speedLimit: text.replace(/[^0-9]/g, '') })}
            keyboardType="numeric"
          />

          <TextInput
            style={[
              styles.input,
              styles.textArea,
              {
                backgroundColor: theme.colors.background,
                color: theme.colors.text,
                borderColor: theme.colors.outline,
              },
            ]}
            placeholder="Additional notes (optional)"
            placeholderTextColor={theme.colors.outline}
            value={formData.notes}
            onChangeText={(text) => setFormData({ ...formData, notes: text })}
            multiline
            numberOfLines={4}
          />
        </View>

        <View style={[styles.infoCard, { backgroundColor: theme.colors.info + '20' }]}>
          <Ionicons name="information-circle" size={24} color={theme.colors.info} />
          <Text style={[styles.infoText, { color: theme.colors.info }]}>
            Your report helps other drivers stay safe. All reports are verified by the community.
          </Text>
        </View>

        {isLoading ? (
          <ActivityIndicator size="large" color={theme.colors.primary} />
        ) : (
          <TouchableOpacity
            style={[styles.submitButton, { backgroundColor: theme.colors.primary }]}
            onPress={handleSubmit}
            disabled={!currentLocation}
          >
            <Text style={[styles.submitText, { color: theme.colors.surface }]}>
              Submit Report
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    paddingBottom: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  placeholder: {
    width: 24,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  locationCard: {
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    elevation: 2,
    minHeight: 100,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 15,
  },
  locationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationText: {
    fontSize: 14,
    marginLeft: 10,
    flex: 1,
  },
  getLocationButton: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  getLocationText: {
    fontSize: 16,
    fontWeight: '600',
  },
  typeCard: {
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    elevation: 2,
    minHeight: 150,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  typeButton: {
    flex: 1,
    minWidth: '45%',
    alignItems: 'center',
    padding: 15,
    borderRadius: 8,
    borderWidth: 1,
  },
  typeText: {
    fontSize: 12,
    marginTop: 5,
    textAlign: 'center',
  },
  detailsCard: {
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    elevation: 2,
    minHeight: 180,
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 15,
    paddingHorizontal: 15,
    fontSize: 16,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  infoCard: {
    borderRadius: 12,
    padding: 15,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoText: {
    fontSize: 14,
    marginLeft: 10,
    flex: 1,
  },
  submitButton: {
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  submitText: {
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ReportRadarScreen;
// @ts-nocheck
