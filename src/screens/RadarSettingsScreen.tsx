import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Text, Switch, useTheme, IconButton, Surface } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSettingsStore } from '../store/settingsStore';

const RadarSettingsScreen = ({ navigation }: any) => {
  const theme = useTheme();
  const [voiceWarning, setVoiceWarning] = useState(true);
  const { unitSystem, toggleUnitSystem } = useSettingsStore();

  const SettingItem = ({ label, value, type = 'text', onPress }: any) => (
    <Surface style={styles.settingCard} elevation={1}>
      <TouchableOpacity 
        style={styles.settingContent} 
        onPress={onPress}
        disabled={type === 'switch'}
      >
        <Text style={styles.settingLabel}>{label}</Text>
        {type === 'text' && <Text style={styles.settingValue}>{value}</Text>}
        {type === 'switch' && (
          <Switch 
            value={voiceWarning} 
            onValueChange={setVoiceWarning} 
            color="#2196F3"
          />
        )}
      </TouchableOpacity>
    </Surface>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <IconButton 
          icon="chevron-left" 
          iconColor="white" 
          size={30} 
          onPress={() => navigation.goBack()} 
        />
        <Text style={styles.headerTitle}>Radar Settings</Text>
      </View>

      <ScrollView style={styles.content}>
        <SettingItem 
          label="Distance Unit" 
          value={unitSystem === 'metric' ? 'Kilometers (km)' : 'Miles (mi)'} 
          onPress={toggleUnitSystem}
        />
        <SettingItem label="Warning Sound Level" value="100%" />
        <SettingItem 
          label="Voice Warning" 
          type="switch" 
        />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    paddingTop: 50,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    marginBottom: 20,
  },
  headerTitle: {
    color: 'white',
    fontSize: 22,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  content: {
    paddingHorizontal: 20,
  },
  settingCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    marginBottom: 15,
    overflow: 'hidden',
  },
  settingContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
  },
  settingLabel: {
    color: 'white',
    fontSize: 18,
    fontWeight: '500',
  },
  settingValue: {
    color: '#8E8E93',
    fontSize: 18,
  },
});

export default RadarSettingsScreen;