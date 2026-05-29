// 📁 components/ui/CategoryTag.tsx
// 카테고리 태그 컴포넌트

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, FONTS, SPACING, RADIUS, CATEGORY_CONFIG } from '../../constants/theme';

interface Props {
  category: string;
  small?: boolean;
}

export function CategoryTag({ category, small = false }: Props) {
  const config = CATEGORY_CONFIG[category] || {
    color: COLORS.primary,
    bg: 'rgba(79, 110, 247, 0.15)',
    emoji: '📌',
  };

  return (
    <View style={[
      styles.container,
      {
        backgroundColor: config.bg,
        borderColor: config.color + '50',
      },
      small && styles.small,
    ]}>
      <Text style={[styles.emoji, small && styles.smallEmoji]}>{config.emoji}</Text>
      <Text style={[styles.label, { color: config.color }, small && styles.smallLabel]}>
        {category}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  small: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  emoji: {
    fontSize: 12,
    lineHeight: 16,
  },
  smallEmoji: {
    fontSize: 10,
    lineHeight: 14,
  },
  label: {
    fontSize: FONTS.sm,
    fontWeight: FONTS.semibold,
  },
  smallLabel: {
    fontSize: 10,
  },
});
