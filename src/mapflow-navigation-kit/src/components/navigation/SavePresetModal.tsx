import React from 'react';
import { View, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { Text, Surface } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SearchResult } from '../../types/map';

interface SavePresetModalProps {
  visible: boolean;
  onClose: () => void;
  onSavePreset: (label: string) => void;
  onSaveBookmark: () => void;
  destination: SearchResult | null;
}

export const SavePresetModal: React.FC<SavePresetModalProps> = ({
  visible,
  onClose,
  onSavePreset,
  onSaveBookmark,
  destination,
}) => {
  if (!destination) return null;

  const renderOption = (
    label: string,
    title: string,
    icon: string,
    color: string,
    onPress: () => void
  ) => (
    <TouchableOpacity style={styles.option} onPress={onPress}>
      <Surface style={[styles.iconContainer, { backgroundColor: `${color}1A`, borderColor: color }]} elevation={1}>
        <MaterialCommunityIcons name={icon as any} size={24} color={color} />
      </Surface>
      <View style={styles.optionTextContainer}>
        <Text style={styles.optionTitle}>{title}</Text>
        <Text style={styles.optionSubtitle}>Save to {label} preset</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={20} color="#475569" />
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={onClose} />
        
        <Surface style={styles.sheet} elevation={5}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Save Location</Text>
            <TouchableOpacity onPress={onClose}>
              <MaterialCommunityIcons name="close" size={22} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          {/* Place Summary */}
          <View style={styles.placeSummary}>
            <Text style={styles.placeName}>{destination.name}</Text>
            <Text numberOfLines={2} style={styles.placeAddress}>{destination.address}</Text>
          </View>

          {/* Preset Options */}
          <View style={styles.optionsList}>
            {renderOption('Home', 'Home Preset', 'home', '#06B6D4', () => onSavePreset('Home'))}
            {renderOption('Work', 'Work Preset', 'briefcase', '#10B981', () => onSavePreset('Work'))}
            {renderOption('School', 'School Preset', 'school', '#F59E0B', () => onSavePreset('School'))}
            
            <TouchableOpacity style={styles.option} onPress={onSaveBookmark}>
              <Surface style={[styles.iconContainer, { backgroundColor: 'rgba(99, 102, 241, 0.1)', borderColor: '#6366F1' }]} elevation={1}>
                <MaterialCommunityIcons name="bookmark" size={24} color="#6366F1" />
              </Surface>
              <View style={styles.optionTextContainer}>
                <Text style={styles.optionTitle}>Standard Bookmark</Text>
                <Text style={styles.optionSubtitle}>Add to general saved locations list</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color="#475569" />
            </TouchableOpacity>
          </View>
        </Surface>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.75)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: '#1E293B',
    borderBottomWidth: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  placeSummary: {
    backgroundColor: 'rgba(30, 41, 59, 0.4)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 24,
  },
  placeName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#F8FAFC',
    marginBottom: 4,
  },
  placeAddress: {
    fontSize: 12,
    color: '#94A3B8',
    lineHeight: 18,
  },
  optionsList: {
    gap: 12,
    marginBottom: 12,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  optionTextContainer: {
    marginLeft: 14,
    flex: 1,
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#F8FAFC',
  },
  optionSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
});
