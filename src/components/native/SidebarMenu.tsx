import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const navItems = [
  { label: 'Overview', icon: 'view-dashboard-outline' },
  { label: 'Tasks', icon: 'checkbox-multiple-outline' },
  { label: 'Meetings', icon: 'calendar-blank-outline' },
  { label: 'Notes', icon: 'note-text-outline' },
  { label: 'Calendar', icon: 'calendar-month-outline' },
  { label: 'Completed', icon: 'check-circle-outline' },
  { label: 'Notifications', icon: 'bell-outline' },
];

const favorites = [
  { label: 'Design', color: '#22C55E' },
  { label: 'Development', color: '#3B82F6' },
  { label: 'Workshop', color: '#F97316' },
  { label: 'Personal', color: '#F43F5E' },
];

const teams = [
  { label: 'Product', color: '#F59E0B' },
  { label: 'Marketing', color: '#10B981' },
  { label: 'Research', color: '#6366F1' },
];

const SidebarMenu = () => {
  const [favoritesOpen, setFavoritesOpen] = useState(true);
  const [teamsOpen, setTeamsOpen] = useState(true);

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <MaterialCommunityIcons name="magnify" size={18} color="#6B7280" />
        <TextInput
          placeholder="Search"
          placeholderTextColor="#9CA3AF"
          style={styles.searchInput}
        />
        <View style={styles.kbd}>
          <Text style={styles.kbdText}>Ctrl K</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {navItems.map((item) => (
          <TouchableOpacity key={item.label} style={styles.navItem}>
            <MaterialCommunityIcons name={item.icon} size={18} color="#111827" />
            <Text style={styles.navText}>{item.label}</Text>
          </TouchableOpacity>
        ))}

        <View style={styles.section}>
          <TouchableOpacity style={styles.sectionHeader} onPress={() => setFavoritesOpen((prev) => !prev)}>
            <Text style={styles.sectionTitle}>Favorites</Text>
            <MaterialCommunityIcons
              name={favoritesOpen ? 'chevron-up' : 'chevron-down'}
              size={18}
              color="#6B7280"
            />
          </TouchableOpacity>
          {favoritesOpen && (
            <View style={styles.sectionBody}>
              {favorites.map((item) => (
                <View key={item.label} style={styles.sectionItem}>
                  <View style={[styles.dot, { backgroundColor: item.color }]} />
                  <Text style={styles.sectionText}>{item.label}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <TouchableOpacity style={styles.sectionHeader} onPress={() => setTeamsOpen((prev) => !prev)}>
            <Text style={styles.sectionTitle}>Teams</Text>
            <MaterialCommunityIcons
              name={teamsOpen ? 'chevron-up' : 'chevron-down'}
              size={18}
              color="#6B7280"
            />
          </TouchableOpacity>
          {teamsOpen && (
            <View style={styles.sectionBody}>
              {teams.map((item) => (
                <View key={item.label} style={styles.sectionItem}>
                  <View style={[styles.dot, { backgroundColor: item.color }]} />
                  <Text style={styles.sectionText}>{item.label}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#111827',
  },
  kbd: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: '#FFFFFF',
  },
  kbdText: {
    fontSize: 10,
    color: '#6B7280',
  },
  scrollContent: {
    paddingTop: 16,
    paddingBottom: 12,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  navText: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '500',
  },
  section: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  sectionBody: {
    marginTop: 12,
    gap: 8,
  },
  sectionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sectionText: {
    fontSize: 13,
    color: '#111827',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});

export default SidebarMenu;
