import React, { memo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  SectionList,
  StyleSheet,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS } from '../../utils/colors';
import { SearchResult, SearchResultsSection } from '../../types/map';
import { formatDistance } from '../../utils/units';

const PLACE_ICONS: Record<string, string> = {
  home: '🏠',
  work: '💼',
  school: '🏫',
  restaurant: '🍽️',
  cafe: '☕',
  hotel: '🏨',
  hospital: '🏥',
  park: '🌳',
  fuel: '⛽',
  parking: '🅿️',
  bank: '🏦',
  pharmacy: '💊',
  supermarket: '🛒',
};

function getTypeIcon(type?: string | null): string {
  if (!type) return '';
  const normalizedType = type.toLowerCase();
  for (const [key, icon] of Object.entries(PLACE_ICONS)) {
    if (normalizedType.includes(key)) return icon;
  }
  return '';
}

function getTypeLabel(type?: string | null): string | null {
  if (!type) return null;
  const normalizedType = type.toLowerCase();
  if (normalizedType === 'home') return 'Home';
  if (normalizedType === 'work') return 'Work';
  if (normalizedType === 'school') return 'School';
  if (normalizedType.includes('restaurant')) return 'Restaurant';
  if (normalizedType.includes('cafe')) return 'Cafe';
  if (normalizedType.includes('hospital')) return 'Hospital';
  if (normalizedType.includes('school')) return 'School';
  if (normalizedType.includes('park')) return 'Park';
  if (normalizedType.includes('fuel')) return 'Gas';
  if (normalizedType.includes('hotel')) return 'Hotel';
  return null;
}

interface SearchResultsProps {
  sections: SearchResultsSection[];
  onSelect: (result: SearchResult) => void;
  onToggleSaved: (result: SearchResult) => void;
  onClearRecents?: () => void;
  onClearSaved?: () => void;
  hideHeaders?: boolean;
  unitSystem: 'metric' | 'imperial';
  footerText?: string;
}

export default memo(function SearchResults({
  sections,
  onSelect,
  onToggleSaved,
  onClearRecents,
  onClearSaved,
  hideHeaders = false,
  unitSystem,
  footerText,
}: SearchResultsProps) {
  const isEmpty = sections.length === 0 || sections.every((s) => s.data.length === 0);

  if (isEmpty) {
    if (hideHeaders) return null;
    return (
      <View style={styles.container}>
        <View style={styles.emptyContainer}>
          <MaterialIcons name="bookmark-border" size={36} color={COLORS.textMuted} />
          <Text style={styles.emptyTitle}>No saved locations yet</Text>
          <Text style={styles.emptySubtitle}>
            Search for places and tap the bookmark icon to save them.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SectionList
        sections={sections}
        keyExtractor={(item, index) => `${item.sourceKind || 'network'}-${item.lat}-${item.lng}-${index}`}
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled={false}
        style={styles.list}
        renderSectionHeader={({ section }) => {
          if (hideHeaders) return null;
          return (
            <View style={styles.sectionHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                {section.key === 'recent' && onClearRecents && (
                  <TouchableOpacity onPress={onClearRecents} style={styles.clearAllBtn} activeOpacity={0.7} hitSlop={8}>
                    <Text style={styles.clearAllText}>Clear All</Text>
                  </TouchableOpacity>
                )}
                {section.key === 'saved' && onClearSaved && (
                  <TouchableOpacity onPress={onClearSaved} style={styles.clearAllBtn} activeOpacity={0.7} hitSlop={8}>
                    <Text style={styles.clearAllText}>Clear All</Text>
                  </TouchableOpacity>
                )}
              </View>
              <Text style={styles.sectionCount}>{section.data.length}</Text>
            </View>
          );
        }}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <TouchableOpacity
              style={styles.itemMain}
              onPress={() => onSelect(item)}
              activeOpacity={0.72}
            >
              <View style={styles.icon}>
                {getTypeIcon(item.type) ? (
                  <Text style={styles.placeEmoji}>{getTypeIcon(item.type)}</Text>
                ) : (
                  <MaterialIcons
                    name={item.sourceKind === 'saved' ? 'bookmark' : 'location-on'}
                    size={20}
                    color={item.sourceKind === 'saved' ? COLORS.primary : COLORS.textMuted}
                  />
                )}
              </View>

              <View style={styles.content}>
                <View style={styles.nameRow}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {getTypeLabel(item.type) && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{getTypeLabel(item.type)}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.address} numberOfLines={1}>
                  {item.address}
                </Text>
                {typeof item.distanceMeters === 'number' && (
                  <Text style={styles.distance}>
                    {formatDistance(item.distanceMeters, unitSystem)}
                  </Text>
                )}
              </View>

              <MaterialIcons name="chevron-right" size={18} color={COLORS.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => onToggleSaved(item)}
              style={styles.saveButton}
              hitSlop={8}
              activeOpacity={0.7}
            >
              <MaterialIcons
                name={item.isSaved ? 'bookmark' : 'bookmark-border'}
                size={20}
                color={item.isSaved ? COLORS.primary : COLORS.textMuted}
              />
            </TouchableOpacity>
          </View>
        )}
      />

      {footerText ? (
        <View style={styles.footer}>
          <Text style={styles.footerText}>{footerText}</Text>
        </View>
      ) : null}
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
    maxHeight: 372,
  },
  list: {
    maxHeight: 332,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
    backgroundColor: 'rgba(6, 22, 41, 0.97)',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontFamily: 'System',
  },
  sectionCount: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontFamily: 'System',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
    paddingRight: 12,
  },
  itemMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingVertical: 13,
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
  placeEmoji: {
    fontSize: 18,
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
  saveButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: COLORS.white06,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
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
  clearAllBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 0.5,
    borderColor: 'rgba(239, 68, 68, 0.24)',
  },
  clearAllText: {
    fontSize: 10,
    color: '#EF4444',
    fontWeight: '600',
    fontFamily: 'System',
  },
  emptyContainer: {
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: 10,
    marginBottom: 4,
    fontFamily: 'System',
  },
  emptySubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
    fontFamily: 'System',
    lineHeight: 18,
  },
});
