import React from 'react';
import { TouchableOpacity, StyleSheet, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS } from '../../utils/colors';

interface IconButtonProps {
  icon: string;
  onPress: () => void;
  color?: string;
  bgColor?: string;
  size?: number;
}

export default function IconButton({
  icon,
  onPress,
  color = COLORS.text,
  bgColor = COLORS.bgCard,
  size = 22,
}: IconButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.btn, { backgroundColor: bgColor }]}
    >
      <MaterialIcons name={icon as any} size={size} color={color} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
});
