// 📁 components/ui/ImportanceBadge.tsx
// 뉴스 중요도를 불꽃 아이콘으로 표시하는 컴포넌트

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

interface Props {
  level: 1 | 2 | 3 | 4 | 5;
  compact?: boolean;
}

const IMPORTANCE_CONFIG = {
  1: { label: '참고', color: COLORS.textMuted, flames: 1 },
  2: { label: '보통', color: COLORS.accentGreen, flames: 2 },
  3: { label: '주목', color: COLORS.accentGold, flames: 3 },
  4: { label: '중요', color: COLORS.accentOrange, flames: 4 },
  5: { label: '긴급', color: COLORS.accentRed, flames: 5 },
};

export function ImportanceBadge({ level, compact = false }: Props) {
  const config = IMPORTANCE_CONFIG[level];
  const flames = '🔥'.repeat(config.flames);

  if (compact) {
    return (
      <View style={[styles.compactContainer, { borderColor: config.color + '40' }]}>
        <Text style={styles.flames}>{flames}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: config.color + '20', borderColor: config.color + '40' }]}>
      <Text style={styles.flames}>{flames}</Text>
      <Text style={[styles.label, { color: config.color }]}>{config.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  compactContainer: {
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  flames: {
    fontSize: 11,
    lineHeight: 16,
  },
  label: {
    fontSize: FONTS.xs,
    fontWeight: FONTS.bold,
    letterSpacing: 0.3,
  },
});
