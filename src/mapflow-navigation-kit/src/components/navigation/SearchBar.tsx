import React, { memo } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS } from '../../utils/colors';

interface SearchBarProps {
  value: string;
  onChangeQuery: (query: string) => void;
  onClear: () => void;
  onMyLocation: () => void;
  onFocus: () => void;
  onBlur: () => void;
  isSearching: boolean;
  topOffset: number;
  onToggleSavedList?: () => void;
  isSavedListActive?: boolean;
}

export default memo(function SearchBar({
  value,
  onChangeQuery,
  onClear,
  onMyLocation,
  onFocus,
  onBlur,
  isSearching,
  topOffset,
  onToggleSavedList,
  isSavedListActive,
}: SearchBarProps) {
  const hasValue = value.trim().length > 0;

  return (
    <View style={[styles.wrapper, { top: topOffset }]} pointerEvents="box-none">
      <View style={styles.inputRow}>
        <TouchableOpacity onPress={onMyLocation} style={styles.locBtn} activeOpacity={0.8}>
          <MaterialIcons name="my-location" size={22} color={COLORS.primary} />
        </TouchableOpacity>

        <View style={styles.inputContainer}>
          <TouchableOpacity onPress={onToggleSavedList} style={styles.menuButton} activeOpacity={0.7} hitSlop={12}>
            <MaterialIcons name="menu" size={24} color={isSavedListActive ? COLORS.primary : "#a9bbd5"} />
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            placeholder="Search places, addresses..."
            placeholderTextColor="#90a7c8"
            value={value}
            onChangeText={onChangeQuery}
            onFocus={onFocus}
            onBlur={onBlur}
            autoCorrect={false}
            autoCapitalize="words"
            returnKeyType="search"
            clearButtonMode="never"
          />
          {isSearching ? (
            <View style={styles.trailingIcon}>
              <MaterialIcons name="hourglass-empty" size={18} color={COLORS.primary} />
            </View>
          ) : hasValue ? (
            <TouchableOpacity onPress={onClear} style={styles.clearButton} hitSlop={8}>
              <MaterialIcons name="close" size={18} color={COLORS.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 20,
    paddingHorizontal: 12,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  locBtn: {
    width: 50,
    height: 50,
    borderRadius: 18,
    backgroundColor: 'rgba(6, 24, 44, 0.96)',
    borderWidth: 1,
    borderColor: 'rgba(88, 214, 216, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.34,
    shadowRadius: 12,
    elevation: 10,
  },
  inputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    borderRadius: 18,
    backgroundColor: 'rgba(6, 24, 44, 0.94)',
    borderWidth: 1,
    borderColor: 'rgba(88, 214, 216, 0.24)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.38,
    shadowRadius: 14,
    elevation: 12,
  },
  menuButton: {
    marginLeft: 16,
    marginRight: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    height: '100%',
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '600',
    fontFamily: 'System',
    paddingHorizontal: 8,
  },
  clearButton: {
    marginRight: 16,
  },
  trailingIcon: {
    marginRight: 16,
  },
});
