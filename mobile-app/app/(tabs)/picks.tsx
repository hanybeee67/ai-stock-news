// 📁 app/(tabs)/picks.tsx
// 오늘의 유망주 — 오늘 뉴스에서 AI가 선별한 수혜 종목만 표시

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { StorageService } from '../../services/storage';
import { ApiService } from '../../services/api';
import { DailyReport } from '../../types';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

// ── 오늘 날짜 KST ───────────────────────────────────────────────────
function getTodayKST(): string {
  const kstNow = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
  return kstNow.toISOString().split('T')[0];
}

// ── 오늘 리포트에서 수혜주 추출 ─────────────────────────────────────
interface TodayPick {
  key: string;
  stockName: string;
  ticker: string;
  market: string;
  reason: string;
  relevance: string;
  priceLevel: string; // 'high' | 'low'(15000원 이하)
  sector: string;
  newsTitle: string;
  newsCategory: string;
  marketImpact: string;
}

function extractTodayPicks(report: DailyReport | null): TodayPick[] {
  if (!report) return [];
  const picks: TodayPick[] = [];
  const seen = new Set<string>();
  for (const news of report.topNews ?? []) {
    for (const stock of news.beneficiaryStocks ?? []) {
      const key = stock.ticker || stock.name;
      if (seen.has(key)) continue;
      seen.add(key);
      picks.push({
        key,
        stockName: stock.name,
        ticker: stock.ticker ?? '',
        market: stock.market ?? 'KRX',
        reason: stock.reason ?? '',
        relevance: stock.relevance ?? 'medium',
        priceLevel: (stock as any).priceLevel ?? 'high',
        sector: stock.sector ?? '',
        newsTitle: news.titleKo ?? news.title ?? '',
        newsCategory: news.category ?? '',
        marketImpact: news.marketImpact ?? 'neutral',
      });
    }
  }
  // 저가주(low)를 위로 정렬
  picks.sort((a, b) => {
    if (a.priceLevel === 'low' && b.priceLevel !== 'low') return -1;
    if (b.priceLevel === 'low' && a.priceLevel !== 'low') return 1;
    return 0;
  });
  return picks;
}

function relevanceColor(r: string): string {
  if (r === 'high') return COLORS.accentGreen;
  if (r === 'medium') return COLORS.accentGold;
  return COLORS.textMuted;
}

function impactColor(impact: string): string {
  if (impact === 'bullish') return COLORS.accentGreen;
  if (impact === 'bearish') return COLORS.accentRed;
  return COLORS.accentGold;
}

// ── 메인 컴포넌트 ───────────────────────────────────────────────────
export default function PicksScreen() {
  const [report, setReport] = useState<DailyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    setLoading(true);
    try {
      let rep = await StorageService.getTodayReport();
      if (!rep) {
        rep = await ApiService.fetchDailyReport(false).catch(() => null);
      }
      setReport(rep);
    } finally {
      setLoading(false);
    }
  };

  const todayPicks = extractTodayPicks(report);
  const todayKST = getTodayKST();
  const highPicks = todayPicks.filter(p => p.relevance === 'high');
  const otherPicks = todayPicks.filter(p => p.relevance !== 'high');
  const newsCount = report?.topNews?.length ?? 0;

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sm, marginTop: SPACING.md }}>
          오늘의 유망주를 불러오는 중...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* ── 헤더 ── */}
      <LinearGradient colors={['#0D1240', COLORS.bgBase]} style={styles.header}>
        <Text style={styles.headerTitle}>🎯 오늘의 유망주</Text>
        <Text style={styles.headerSubtitle}>
          {todayKST} · AI가 오늘 뉴스에서 선별한 수혜 종목
        </Text>

        {/* 요약 배지 */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryChip}>
            <Text style={styles.summaryChipNum}>{todayPicks.length}</Text>
            <Text style={styles.summaryChipLabel}>오늘 유망주</Text>
          </View>
          <View style={[styles.summaryChip, { borderColor: COLORS.accentGreen + '50' }]}>
            <Text style={[styles.summaryChipNum, { color: COLORS.accentGreen }]}>{highPicks.length}</Text>
            <Text style={styles.summaryChipLabel}>고관련성</Text>
          </View>
          <View style={[styles.summaryChip, { borderColor: COLORS.primary + '50' }]}>
            <Text style={[styles.summaryChipNum, { color: COLORS.primary }]}>{newsCount}</Text>
            <Text style={styles.summaryChipLabel}>분석 뉴스</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {todayPicks.length === 0 ? (
          <EmptyState
            emoji="📊"
            title="오늘의 유망주가 없습니다"
            desc={'홈 화면에서 당겨서 새로고침 후\n다시 확인해 주세요'}
          />
        ) : (
          <>
            {/* 고관련성 종목 */}
            {highPicks.length > 0 && (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>⭐ 핵심 수혜주</Text>
                  <Text style={styles.sectionDesc}>오늘 뉴스와 직접 연관된 주목 종목</Text>
                </View>
                {highPicks.map(pick => (
                  <TodayPickCard
                    key={pick.key}
                    pick={pick}
                    expanded={expanded}
                    setExpanded={setExpanded}
                  />
                ))}
              </>
            )}

            {/* 중/저관련성 종목 */}
            {otherPicks.length > 0 && (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>📈 관련 수혜주</Text>
                  <Text style={styles.sectionDesc}>간접 수혜 가능성이 있는 종목</Text>
                </View>
                {otherPicks.map(pick => (
                  <TodayPickCard
                    key={pick.key}
                    pick={pick}
                    expanded={expanded}
                    setExpanded={setExpanded}
                  />
                ))}
              </>
            )}
          </>
        )}

        <View style={{ height: SPACING.xxxl }} />
      </ScrollView>
    </View>
  );
}

// ── 유망주 카드 컴포넌트 ─────────────────────────────────────────────
function TodayPickCard({
  pick,
  expanded,
  setExpanded,
}: {
  pick: TodayPick;
  expanded: string | null;
  setExpanded: (k: string | null) => void;
}) {
  const isOpen = expanded === pick.key;
  const relColor = relevanceColor(pick.relevance);
  const impColor = impactColor(pick.marketImpact);
  const relLabel =
    pick.relevance === 'high' ? '고관련' : pick.relevance === 'medium' ? '중관련' : '저관련';
  const impactLabel =
    pick.marketImpact === 'bullish'
      ? '📈 상승 재료'
      : pick.marketImpact === 'bearish'
      ? '📉 하락 재료'
      : '↔ 중립';

  return (
    <TouchableOpacity
      style={styles.pickCard}
      onPress={() => setExpanded(isOpen ? null : pick.key)}
      activeOpacity={0.85}
    >
      {/* 상단: 종목명 + 배지 */}
      <View style={styles.pickCardHeader}>
        <View style={{ flex: 1 }}>
          <View style={styles.pickNameRow}>
            <Text style={styles.pickStockName}>{pick.stockName}</Text>
            <View
              style={[
                styles.relBadge,
                { backgroundColor: relColor + '20', borderColor: relColor + '50' },
              ]}
            >
              <Text style={[styles.relBadgeText, { color: relColor }]}>{relLabel}</Text>
            </View>
            {pick.priceLevel === 'low' && (
              <View style={[styles.relBadge, { backgroundColor: COLORS.accentGold + '20', borderColor: COLORS.accentGold + '50' }]}>
                <Text style={[styles.relBadgeText, { color: COLORS.accentGold }]}>💸 1.5만원 이하</Text>
              </View>
            )}
          </View>
          <Text style={styles.pickTicker}>
            {pick.ticker ? pick.ticker : '티커 미확인'}{pick.market ? ` · ${pick.market}` : ''}
          </Text>
        </View>
        <View style={[styles.impactBadge, { backgroundColor: impColor + '18' }]}>
          <Text style={[styles.impactText, { color: impColor }]}>{impactLabel}</Text>
        </View>
      </View>

      {/* 연관 뉴스 제목 */}
      <Text style={styles.pickNewsTitle} numberOfLines={1}>
        📰 {pick.newsTitle}
      </Text>

      {/* 카테고리 · 섹터 · 펼치기 */}
      <View style={styles.pickMeta}>
        {pick.newsCategory ? (
          <View style={[styles.catChip, { backgroundColor: COLORS.primary + '20' }]}>
            <Text style={styles.catChipText}>{pick.newsCategory}</Text>
          </View>
        ) : null}
        {pick.sector ? (
          <View style={[styles.catChip, { backgroundColor: COLORS.bgSurface }]}>
            <Text style={styles.catChipText}>{pick.sector}</Text>
          </View>
        ) : null}
        <Text style={styles.expandHint}>{isOpen ? '▲ 닫기' : '▼ 수혜 이유'}</Text>
      </View>

      {/* 펼쳐진 수혜 이유 + 시세 버튼 */}
      {isOpen && (
        <View style={styles.reasonBox}>
          <Text style={styles.reasonText}>{pick.reason || '분석 정보 없음'}</Text>
          {pick.ticker ? (
            <TouchableOpacity
              style={styles.stockDetailBtn}
              onPress={() => router.push(`/stock/${pick.ticker}?name=${encodeURIComponent(pick.name)}`)}
              activeOpacity={0.8}
            >
              <Text style={styles.stockDetailBtnText}>
                📊 {pick.stockName} 실시간 시세 보기
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── 빈 상태 ─────────────────────────────────────────────────────────
function EmptyState({
  emoji,
  title,
  desc,
}: {
  emoji: string;
  title: string;
  desc: string;
}) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyEmoji}>{emoji}</Text>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDesc}>{desc}</Text>
    </View>
  );
}

// ── 스타일 ──────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgBase },

  // 헤더
  header: {
    paddingTop: Platform.OS === 'ios' ? 50 : 24,
    paddingBottom: SPACING.base,
    paddingHorizontal: SPACING.base,
  },
  headerTitle: {
    fontSize: FONTS.xl,
    fontWeight: FONTS.extrabold,
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: FONTS.sm,
    color: COLORS.textMuted,
    marginBottom: SPACING.base,
  },

  // 요약 배지 행
  summaryRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  summaryChip: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.borderCard,
  },
  summaryChipNum: {
    fontSize: FONTS.xl,
    fontWeight: FONTS.black,
    color: COLORS.textPrimary,
  },
  summaryChipLabel: {
    fontSize: FONTS.xs,
    color: COLORS.textMuted,
    marginTop: 2,
  },

  scroll: { flex: 1 },
  scrollContent: { padding: SPACING.base, paddingTop: SPACING.md },

  // 섹션 헤더
  sectionHeader: {
    marginBottom: SPACING.sm,
    marginTop: SPACING.sm,
  },
  sectionTitle: {
    fontSize: FONTS.md,
    fontWeight: FONTS.bold,
    color: COLORS.textPrimary,
  },
  sectionDesc: {
    fontSize: FONTS.xs,
    color: COLORS.textMuted,
    marginTop: 2,
  },

  // 픽 카드
  pickCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.xl,
    padding: SPACING.base,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.borderCard,
  },
  pickCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.xs,
    gap: SPACING.sm,
  },
  pickNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    flexWrap: 'wrap',
  },
  pickStockName: {
    fontSize: FONTS.md,
    fontWeight: FONTS.bold,
    color: COLORS.textPrimary,
  },
  relBadge: {
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  relBadgeText: {
    fontSize: 10,
    fontWeight: FONTS.bold,
  },
  pickTicker: {
    fontSize: FONTS.xs,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  impactBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.md,
    alignSelf: 'flex-start',
  },
  impactText: {
    fontSize: FONTS.xs,
    fontWeight: FONTS.semibold,
  },

  // 뉴스 제목
  pickNewsTitle: {
    fontSize: FONTS.xs,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
    lineHeight: 16,
  },

  // 메타 행
  pickMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    flexWrap: 'wrap',
  },
  catChip: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
  },
  catChipText: {
    fontSize: 11,
    color: COLORS.primary,
    fontWeight: FONTS.semibold,
  },
  expandHint: {
    fontSize: FONTS.xs,
    color: COLORS.textMuted,
    marginLeft: 'auto',
  },

  // 수혜 이유 박스
  reasonBox: {
    marginTop: SPACING.sm,
    backgroundColor: COLORS.bgSurface,
    borderRadius: RADIUS.lg,
    padding: SPACING.sm,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
  },
  reasonText: {
    fontSize: FONTS.sm,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  stockDetailBtn: {
    marginTop: SPACING.sm,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
  },
  stockDetailBtnText: {
    fontSize: FONTS.sm,
    color: '#fff',
    fontWeight: FONTS.bold,
  },

  // 빈 상태
  emptyState: {
    alignItems: 'center',
    paddingVertical: SPACING.section,
    gap: SPACING.sm,
  },
  emptyEmoji: { fontSize: 52 },
  emptyTitle: {
    fontSize: FONTS.lg,
    fontWeight: FONTS.bold,
    color: COLORS.textPrimary,
  },
  emptyDesc: {
    fontSize: FONTS.md,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
});
