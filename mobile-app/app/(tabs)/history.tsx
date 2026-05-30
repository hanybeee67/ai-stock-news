// 📁 app/(tabs)/history.tsx
// 히스토리 화면 — 최근 7일 리포트 카드 목록 + 날짜 선택 조회
// (신규 파일 v2.0)

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  StatusBar,
  RefreshControl,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ApiService, HistoryItem } from '../../services/api';
import { DailyReport, NewsItem } from '../../types';
import { NewsCard } from '../../components/NewsCard';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

const IMPACT_CONFIG = {
  bullish: { label: '상승', color: COLORS.accentGreen, icon: '▲' },
  bearish: { label: '하락', color: COLORS.accentRed, icon: '▼' },
  neutral: { label: '중립', color: COLORS.accentGold, icon: '◆' },
};

export default function HistoryScreen() {
  const [historyList, setHistoryList] = useState<HistoryItem[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<DailyReport | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // ─── 히스토리 목록 불러오기 ─────────────────────────────────────
  const loadHistory = useCallback(async () => {
    try {
      const data = await ApiService.fetchHistory();
      setHistoryList(data);

      // 첫 번째 항목 자동 선택
      if (data.length > 0 && !selectedDate) {
        setSelectedDate(data[0].date);
        loadReportForDate(data[0].date);
      }
    } catch {
      // 히스토리 없으면 빈 상태 표시
    } finally {
      setLoadingHistory(false);
      setRefreshing(false);
    }
  }, [selectedDate]);

  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    setSelectedDate(null);
    setSelectedReport(null);
    loadHistory();
  };

  // ─── 특정 날짜 리포트 불러오기 ─────────────────────────────────
  const loadReportForDate = async (date: string) => {
    setLoadingReport(true);
    setSelectedReport(null);
    try {
      const report = await ApiService.fetchReportByDate(date);
      setSelectedReport(report);
    } finally {
      setLoadingReport(false);
    }
  };

  const handleDateSelect = (date: string) => {
    if (selectedDate === date) return;
    setSelectedDate(date);
    loadReportForDate(date);
  };

  const handleNewsPress = (news: NewsItem) => {
    router.push({
      pathname: '/news/[id]',
      params: { id: news.id, data: JSON.stringify(news) },
    });
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const weekday = weekdays[d.getDay()];
    // ✅ KST(UTC+9) 기준 오늘 날짜
    const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const todayKST = nowKST.toISOString().split('T')[0];
    const isToday = dateStr === todayKST;
    return {
      label: `${month}/${day}`,
      weekday: isToday ? '오늘' : `${weekday}요일`,
      isToday,
    };
  };

  // ─── 빈 상태 ───────────────────────────────────────────────────
  if (!loadingHistory && historyList.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <StatusBar barStyle="light-content" />
        <Text style={styles.emptyEmoji}>📅</Text>
        <Text style={styles.emptyTitle}>아직 히스토리가 없어요</Text>
        <Text style={styles.emptyDesc}>
          AI 분석이 완료되면{'\n'}여기에 날짜별 리포트가 쌓입니다
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* ── 헤더 ── */}
      <LinearGradient
        colors={['#0D1240', COLORS.bgBase]}
        style={styles.header}
      >
        <View style={styles.headerTop}>
          <Text style={styles.headerTitle}>📅 히스토리</Text>
          <Text style={styles.headerSubtitle}>최근 7일 AI 분석 리포트</Text>
        </View>

        {/* ── 날짜 선택 탭 ── */}
        {loadingHistory ? (
          <ActivityIndicator color={COLORS.primary} style={{ marginTop: SPACING.base }} />
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.dateTabs}
          >
            {historyList.map(item => {
              const { label, weekday, isToday } = formatDate(item.date);
              const isSelected = selectedDate === item.date;
              const impact = IMPACT_CONFIG[item.dominantImpact] || IMPACT_CONFIG.neutral;

              return (
                <TouchableOpacity
                  key={item.date}
                  style={[styles.dateTab, isSelected && styles.dateTabActive]}
                  onPress={() => handleDateSelect(item.date)}
                >
                  {isToday && (
                    <View style={styles.todayBadge}>
                      <Text style={styles.todayBadgeText}>TODAY</Text>
                    </View>
                  )}
                  <Text style={[styles.dateLabel, isSelected && styles.dateLabelActive]}>
                    {label}
                  </Text>
                  <Text style={[styles.weekdayLabel, isSelected && styles.weekdayLabelActive]}>
                    {weekday}
                  </Text>
                  <Text style={[styles.impactIcon, { color: impact.color }]}>
                    {impact.icon}
                  </Text>
                  {isSelected && <View style={styles.dateTabUnderline} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </LinearGradient>

      {/* ── 선택된 날짜의 리포트 ── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
      >
        {selectedDate && historyList.find(h => h.date === selectedDate) && (
          <HistorySummaryCard item={historyList.find(h => h.date === selectedDate)!} />
        )}

        {loadingReport ? (
          <View style={styles.reportLoading}>
            <ActivityIndicator color={COLORS.primary} />
            <Text style={styles.reportLoadingText}>리포트 불러오는 중...</Text>
          </View>
        ) : selectedReport ? (
          <>
            <View style={styles.newsListHeader}>
              <Text style={styles.newsListTitle}>📰 선별 뉴스</Text>
              <Text style={styles.newsListCount}>{selectedReport.topNews.length}개</Text>
            </View>
            {selectedReport.topNews.map((news, idx) => (
              <NewsCard
                key={news.id}
                news={news}
                index={idx}
                onPress={handleNewsPress}
              />
            ))}
          </>
        ) : selectedDate ? (
          <View style={styles.reportLoading}>
            <Text style={styles.reportLoadingText}>⚠️ 해당 날짜의 리포트를 불러올 수 없습니다.</Text>
          </View>
        ) : null}

        <View style={{ height: SPACING.xxxl }} />
      </ScrollView>
    </View>
  );
}

// ── 히스토리 요약 카드 ──────────────────────────────────────────────
function HistorySummaryCard({ item }: { item: HistoryItem }) {
  const impact = IMPACT_CONFIG[item.dominantImpact] || IMPACT_CONFIG.neutral;

  return (
    <View style={styles.summaryCard}>
      <View style={styles.summaryCardHeader}>
        <View>
          <Text style={styles.summaryDate}>{item.date}</Text>
          <Text style={styles.summaryHeadline} numberOfLines={2}>{item.headline}</Text>
        </View>
        <View style={[styles.impactBadge, { backgroundColor: impact.color + '20' }]}>
          <Text style={[styles.impactBadgeIcon, { color: impact.color }]}>{impact.icon}</Text>
          <Text style={[styles.impactBadgeText, { color: impact.color }]}>{impact.label}</Text>
        </View>
      </View>

      <Text style={styles.summaryMood} numberOfLines={2}>{item.marketMood}</Text>

      <View style={styles.summaryMeta}>
        <View style={styles.metaChip}>
          <Text style={styles.metaChipText}>📰 {item.newsCount}개 뉴스</Text>
        </View>
        <View style={styles.metaChip}>
          <Text style={styles.metaChipText}>🤖 신뢰도 {item.avgConfidence}%</Text>
        </View>
        {item.topCategories.slice(0, 2).map(cat => (
          <View key={cat} style={[styles.metaChip, styles.catChip]}>
            <Text style={styles.catChipText}>{cat}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgBase },

  // ── 헤더 ──────────────────────────────────────────────────────────
  header: {
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 0,
  },
  headerTop: {
    paddingHorizontal: SPACING.base,
    marginBottom: SPACING.base,
  },
  headerTitle: {
    fontSize: FONTS.xxl,
    fontWeight: FONTS.extrabold,
    color: COLORS.textPrimary,
  },
  headerSubtitle: {
    fontSize: FONTS.sm,
    color: COLORS.textMuted,
    marginTop: 2,
  },

  // ── 날짜 탭 ───────────────────────────────────────────────────────
  dateTabs: {
    paddingHorizontal: SPACING.base,
    paddingBottom: SPACING.base,
    gap: SPACING.sm,
  },
  dateTab: {
    alignItems: 'center',
    paddingHorizontal: SPACING.base,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.borderCard,
    minWidth: 64,
    position: 'relative',
  },
  dateTabActive: {
    backgroundColor: COLORS.primary + '20',
    borderColor: COLORS.primary + '60',
  },
  todayBadge: {
    position: 'absolute',
    top: -8,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: RADIUS.full,
  },
  todayBadgeText: {
    fontSize: 8,
    color: COLORS.white,
    fontWeight: FONTS.black,
    letterSpacing: 0.5,
  },
  dateLabel: {
    fontSize: FONTS.base,
    fontWeight: FONTS.bold,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  dateLabelActive: { color: COLORS.primary },
  weekdayLabel: {
    fontSize: FONTS.xs,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  weekdayLabelActive: { color: COLORS.primary + 'CC' },
  impactIcon: { fontSize: 10, marginTop: 4 },
  dateTabUnderline: {
    position: 'absolute',
    bottom: 0,
    left: '20%',
    right: '20%',
    height: 2,
    backgroundColor: COLORS.primary,
    borderRadius: 1,
  },

  // ── 스크롤 콘텐츠 ─────────────────────────────────────────────────
  scroll: { flex: 1 },
  scrollContent: { padding: SPACING.base },

  // ── 요약 카드 ─────────────────────────────────────────────────────
  summaryCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.xl,
    padding: SPACING.base,
    marginBottom: SPACING.base,
    borderWidth: 1,
    borderColor: COLORS.borderCard,
  },
  summaryCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.sm,
    gap: SPACING.sm,
  },
  summaryDate: {
    fontSize: FONTS.xs,
    color: COLORS.textMuted,
    marginBottom: 4,
  },
  summaryHeadline: {
    fontSize: FONTS.md,
    fontWeight: FONTS.bold,
    color: COLORS.textPrimary,
    lineHeight: 20,
    flex: 1,
  },
  impactBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderRadius: RADIUS.md,
  },
  impactBadgeIcon: { fontSize: 10 },
  impactBadgeText: { fontSize: FONTS.xs, fontWeight: FONTS.bold },
  summaryMood: {
    fontSize: FONTS.sm,
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginBottom: SPACING.sm,
  },
  summaryMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  metaChip: {
    backgroundColor: COLORS.bgSurface,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
  },
  metaChipText: { fontSize: 11, color: COLORS.textMuted, fontWeight: FONTS.medium },
  catChip: {
    backgroundColor: COLORS.primary + '15',
  },
  catChipText: { fontSize: 11, color: COLORS.primary, fontWeight: FONTS.semibold },

  // ── 뉴스 목록 ─────────────────────────────────────────────────────
  newsListHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  newsListTitle: {
    fontSize: FONTS.base,
    fontWeight: FONTS.bold,
    color: COLORS.textPrimary,
  },
  newsListCount: {
    fontSize: FONTS.sm,
    color: COLORS.textMuted,
  },

  // ── 로딩 ──────────────────────────────────────────────────────────
  reportLoading: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
    gap: SPACING.sm,
  },
  reportLoadingText: {
    fontSize: FONTS.sm,
    color: COLORS.textMuted,
    textAlign: 'center',
  },

  // ── 빈 상태 ───────────────────────────────────────────────────────
  emptyContainer: {
    flex: 1,
    backgroundColor: COLORS.bgBase,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  emptyEmoji: { fontSize: 56, marginBottom: SPACING.base },
  emptyTitle: {
    fontSize: FONTS.xl,
    fontWeight: FONTS.bold,
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
  },
  emptyDesc: {
    fontSize: FONTS.md,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
});
