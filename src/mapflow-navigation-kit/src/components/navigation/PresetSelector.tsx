import React from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Text, Surface } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StoredDestination } from '../../types/map';

interface PresetSelectorProps {
  presets: StoredDestination[];
  onSelectPreset: (preset: StoredDestination) => void;
  onConfigurePreset: (label: string) => void;
}

export const PresetSelector: React.FC<PresetSelectorProps> = ({
  presets,
  onSelectPreset,
  onConfigurePreset,
}) => {
  const getPresetByLabel = (label: string) => {
    return presets.find((p) => p.label === label);
  };

  const renderPresetButton = (label: string, icon: string, activeColor: string) => {
    const preset = getPresetByLabel(label);
    const isSaved = !!preset;

    return (
      <TouchableOpacity
        key={label}
        style={styles.buttonWrapper}
        onPress={() => {
          if (isSaved && preset) {
            onSelectPreset(preset);
          } else {
            onConfigurePreset(label);
          }
        }}
      >
        <Surface
          style={[
            styles.button,
            isSaved ? { borderColor: activeColor, backgroundColor: 'rgba(30, 41, 59, 0.7)' } : styles.unsavedButton,
          ]}
          elevation={1}
        >
          <MaterialCommunityIcons
            name={icon as any}
            size={20}
            color={isSaved ? activeColor : '#64748B'}
          />
          <View style={styles.textContainer}>
            <Text style={[styles.label, isSaved ? { color: '#E2E8F0' } : styles.unsavedLabel]}>
              {label}
            </Text>
            {isSaved && preset ? (
              <Text numberOfLines={1} style={styles.address}>
                {preset.name || preset.address}
              </Text>
            ) : (
              <Text style={styles.configureText}>Set address</Text>
            )}
          </View>
          {!isSaved && (
            <MaterialCommunityIcons name="plus" size={14} color="#64748B" style={styles.plusIcon} />
          )}
        </Surface>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {renderPresetButton('Home', 'home-outline', '#06B6D4')}
        {renderPresetButton('Work', 'briefcase-outline', '#10B981')}
        {renderPresetButton('School', 'school-outline', '#F59E0B')}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 10,
    width: '100%',
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 12,
    flexDirection: 'row',
  },
  buttonWrapper: {
    minWidth: 120,
    maxWidth: 160,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: '#1E293B',
    borderColor: '#334155',
  },
  unsavedButton: {
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    borderColor: 'rgba(51, 65, 85, 0.5)',
    borderStyle: 'dashed',
  },
  textContainer: {
    marginLeft: 8,
    flex: 1,
  },
  label: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  unsavedLabel: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: 'bold',
  },
  address: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 2,
  },
  configureText: {
    fontSize: 10,
    color: '#475569',
    marginTop: 2,
  },
  plusIcon: {
    marginLeft: 4,
  },
});
