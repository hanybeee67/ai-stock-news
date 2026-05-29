// 📁 components/NewsCard.tsx
// 메인 화면 뉴스 카드 컴포넌트 (프리미엄 글래스모피즘 디자인)

import React, { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { NewsItem } from '../types';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../constants/theme';
import { ImportanceBadge } from './ui/ImportanceBadge';
import { CategoryTag } from './ui/CategoryTag';

interface Props {
  news: NewsItem;
  onPress: (news: NewsItem) => void;
  index: number;
}

const MARKET_IMPACT_CONFIG = {
  bullish: { icon: '▲', color: COLORS.accentGreen, label: '긍정적' },
  bearish: { icon: '▼', color: COLORS.accentRed, label: '부정적' },
  neutral: { icon: '◆', color: COLORS.accentGold, label: '중립' },
};

export function NewsCard({ news, onPress, index }: Props) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const impact = MARKET_IMPACT_CONFIG[news.marketImpact];

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      useNativeDriver: true,
      tension: 300,
      friction: 10,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 300,
      friction: 10,
    }).start();
  };

  return (
    <Animated.View style={[styles.wrapper, { transform: [{ scale: scaleAnim }] }]}>
      <TouchableOpacity
        style={styles.card}
        onPress={() => onPress(news)}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
      >
        {/* 상단 좌측: 카테고리 + 번호 */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.cardNumber}>
              {String(index + 1).padStart(2, '0')}
            </Text>
            <CategoryTag category={news.category} small />
          </View>
          <View style={styles.headerRight}>
            <ImportanceBadge level={news.importance} compact />
          </View>
        </View>

        {/* 뉴스 제목 (한국어) */}
        <Text style={styles.title} numberOfLines={2}>
          {news.titleKo}
        </Text>

        {/* 한 줄 미리보기 */}
        <Text style={styles.preview} numberOfLines={2}>
          {news.summary.split('.')[0]}.
        </Text>

        {/* 하단 정보 바 */}
        <View style={styles.footer}>
          <View style={styles.sourceInfo}>
            <Text style={styles.source}>{news.source}</Text>
            <Text style={styles.dot}>·</Text>
            <Text style={styles.timeAgo}>
              {getTimeAgo(news.publishedAt)}
            </Text>
          </View>

          {/* 시장 방향성 */}
          <View style={[styles.impactBadge, { backgroundColor: impact.color + '20' }]}>
            <Text style={[styles.impactIcon, { color: impact.color }]}>{impact.icon}</Text>
            <Text style={[styles.impactLabel, { color: impact.color }]}>{impact.label}</Text>
          </View>
        </View>

        {/* 수혜주 미리보기 */}
        {news.beneficiaryStocks.length > 0 && (
          <View style={styles.stocksPreview}>
            <Text style={styles.stocksLabel}>주목 종목</Text>
            <View style={styles.stocksList}>
              {news.beneficiaryStocks.slice(0, 3).map((stock, i) => (
                <View key={i} style={styles.stockChip}>
                  <View style={[
                    styles.stockDot,
                    { backgroundColor: stock.relevance === 'high' ? COLORS.accentGreen : COLORS.accentGold }
                  ]} />
                  <Text style={styles.stockName}>{stock.name}</Text>
                </View>
              ))}
              {news.beneficiaryStocks.length > 3 && (
                <Text style={styles.moreStocks}>+{news.beneficiaryStocks.length - 3}</Text>
              )}
            </View>
          </View>
        )}

        {/* AI 신뢰도 바 */}
        <View style={styles.confidenceBar}>
          <View style={styles.confidenceTrack}>
            <View style={[styles.confidenceFill, { width: `${news.aiConfidence}%` as any }]} />
          </View>
          <Text style={styles.confidenceLabel}>AI 신뢰도 {news.aiConfidence}%</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

function getTimeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}분 전`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}시간 전`;
  return `${Math.floor(hrs / 24)}일 전`;
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: SPACING.md,
  },
  card: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.xl,
    padding: SPACING.base,
    borderWidth: 1,
    borderColor: COLORS.borderCard,
    ...SHADOWS.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  cardNumber: {
    fontSize: FONTS.xs,
    fontWeight: FONTS.black,
    color: COLORS.primary,
    letterSpacing: 1,
  },
  title: {
    fontSize: FONTS.base,
    fontWeight: FONTS.bold,
    color: COLORS.textPrimary,
    lineHeight: 22,
    marginBottom: SPACING.xs,
  },
  preview: {
    fontSize: FONTS.sm,
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginBottom: SPACING.md,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  sourceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  source: {
    fontSize: FONTS.xs,
    color: COLORS.textMuted,
    fontWeight: FONTS.semibold,
  },
  dot: {
    color: COLORS.textMuted,
    fontSize: FONTS.xs,
  },
  timeAgo: {
    fontSize: FONTS.xs,
    color: COLORS.textMuted,
  },
  impactBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
  },
  impactIcon: {
    fontSize: 9,
  },
  impactLabel: {
    fontSize: 10,
    fontWeight: FONTS.bold,
  },
  stocksPreview: {
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    paddingTop: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  stocksLabel: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontWeight: FONTS.semibold,
    marginBottom: 6,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  stocksList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  stockChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.bgSurface,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
  },
  stockDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  stockName: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: FONTS.medium,
  },
  moreStocks: {
    fontSize: 11,
    color: COLORS.primary,
    fontWeight: FONTS.bold,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  confidenceBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  confidenceTrack: {
    flex: 1,
    height: 3,
    backgroundColor: COLORS.bgSurface,
    borderRadius: 2,
    overflow: 'hidden',
  },
  confidenceFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 2,
  },
  confidenceLabel: {
    fontSize: 10,
    color: COLORS.textMuted,
    minWidth: 80,
    textAlign: 'right',
  },
});
