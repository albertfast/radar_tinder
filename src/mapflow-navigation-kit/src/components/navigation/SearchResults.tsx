import React, { memo } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS } from '../../utils/colors';
import { SearchResult } from '../../types/map';
import { formatDistance } from '../../utils/units';

const PLACE_ICONS: Record<string, string> = {
  restaurant: '🍽️', cafe: '☕', hotel: '🏨', hospital: '🏥',
  school: '🏫', park: '🌳', fuel: '⛽', parking: '🅿️',
  bank: '🏦', pharmacy: '💊', supermarket: '🛒',
};

function getTypeIcon(type?: string | null): string {
  if (!type) return '';
  const t = type.toLowerCase();
  for (const [key, icon] of Object.entries(PLACE_ICONS)) {
    if (t.includes(key)) return icon;
  }
  return '';
}

function getTypeLabel(type?: string | null): string | null {
  if (!type) return null;
  const t = type.toLowerCase();
  if (t.includes('restaurant')) return 'Restaurant';
  if (t.includes('cafe')) return 'Café';
  if (t.includes('hospital')) return 'Hospital';
  if (t.includes('school')) return 'School';
  if (t.includes('park')) return 'Park';
  if (t.includes('fuel')) return 'Gas';
  if (t.includes('hotel')) return 'Hotel';
  return null;
}

interface SearchResultsProps {
  results: SearchResult[];
  onSelect: (result: SearchResult) => void;
  unitSystem: 'metric' | 'imperial';
}

export default memo(function SearchResults({ results, onSelect, unitSystem }: SearchResultsProps) {
  if (results.length === 0) return null;

  return (
    <View style={styles.container}>
      <FlatList
        data={results}
        keyExtractor={(item, idx) => `${item.lat}-${item.lng}-${idx}`}
        keyboardShouldPersistTaps="handled"
        style={styles.list}
        renderItem={({ item, index }) => (
          <TouchableOpacity
            style={[styles.item, index === 0 && styles.itemFirst]}
            onPress={() => onSelect(item)}
            activeOpacity={0.7}
          >
            <View style={styles.icon}>
              {getTypeIcon(item.type) ? (
                <Text style={{ fontSize: 18 }}>{getTypeIcon(item.type)}</Text>
              ) : (
                <MaterialIcons name="location-on" size={20} color={COLORS.textMuted} />
              )}
            </View>
                <View style={styles.content}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                    {getTypeLabel(item.type) && (
                      <View style={styles.badge}>
                    <Text style={styles.badgeText}>{getTypeLabel(item.type)}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.address} numberOfLines={1}>{item.address}</Text>
                  {typeof item.distanceMeters === 'number' && (
                    <Text style={styles.distance}>
                      {formatDistance(item.distanceMeters, unitSystem)}
                    </Text>
                  )}
                </View>
                <MaterialIcons name="chevron-right" size={18} color={COLORS.textMuted} />
              </TouchableOpacity>
            )}
          />
      <View style={styles.footer}>
        <Text style={styles.footerText}>Live search via free provider fallbacks</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    marginTop: 12,
    borderRadius: 22,
    backgroundColor: 'rgba(6, 22, 41, 0.97)',
    borderWidth: 1,
    borderColor: 'rgba(88, 214, 216, 0.14)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.44,
    shadowRadius: 18,
    elevation: 14,
    overflow: 'hidden',
    maxHeight: 356,
  },
  list: {
    maxHeight: 304,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
  },
  itemFirst: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  content: {
    flex: 1,
    marginRight: 8,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    fontFamily: 'System',
    flexShrink: 1,
  },
  badge: {
    backgroundColor: COLORS.white10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 10,
    color: COLORS.textSecondary,
    fontWeight: '500',
    fontFamily: 'System',
  },
  address: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontFamily: 'System',
    marginTop: 2,
  },
  distance: {
    fontSize: 11,
    color: COLORS.primary,
    fontFamily: 'System',
    marginTop: 3,
  },
  footer: {
    paddingVertical: 8,
    alignItems: 'center',
    borderTopWidth: 0.5,
    borderTopColor: COLORS.border,
  },
  footerText: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontFamily: 'System',
  },
});
