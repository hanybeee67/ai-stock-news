// 📁 app/(tabs)/index.tsx
// 메인 대시보드 화면 — '오늘 아침 딱 3분 리포트'
// v2.0: 카테고리 필터 실동작, 단계별 로딩 UX, 폴링 지원

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Animated,
  StatusBar,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { DailyReport, NewsItem } from '../../types';
import { ApiService } from '../../services/api';
import { StorageService } from '../../services/storage';
import { NewsCard } from '../../components/NewsCard';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

// ─── 로딩 단계 메시지 ─────────────────────────────────────────────
const LOADING_STEPS = [
  '📡 전 세계 뉴스 수집 중...',
  '🔍 AI가 핵심 뉴스를 선별 중...',
  '🤖 찰리가 나비효과를 분석 중...',
  '📈 수혜주 매핑 중...',
  '⚡ 리포트 마무리 중...',
];

// 서울 현재 시각 문자열
function getKoreanDateTime(): { date: string; time: string; greeting: string } {
  const now = new Date();
  const koOptions: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Seoul' };
  const hour = parseInt(new Intl.DateTimeFormat('ko', { ...koOptions, hour: 'numeric', hour12: false }).format(now));

  let greeting = '좋은 아침이에요';
  if (hour >= 12 && hour < 18) greeting = '좋은 오후에요';
  else if (hour >= 18) greeting = '좋은 저녁이에요';

  const date = new Intl.DateTimeFormat('ko-KR', {
    ...koOptions,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(now);

  const time = new Intl.DateTimeFormat('ko-KR', {
    ...koOptions,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);

  return { date, time, greeting };
}

export default function DashboardScreen() {
  const [report, setReport] = useState<DailyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingStep, setLoadingStep] = useState(0);
  const [serverProgress, setServerProgress] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [{ date, time, greeting }] = useState(getKoreanDateTime());

  // 애니메이션
  const headerAnim = useRef(new Animated.Value(0)).current;
  const contentAnim = useRef(new Animated.Value(0)).current;
  const loadingStepInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── 로딩 스텝 순환 ─────────────────────────────────────────────
  const startLoadingAnimation = useCallback(() => {
    setLoadingStep(0);
    loadingStepInterval.current = setInterval(() => {
      setLoadingStep(prev => (prev + 1) % LOADING_STEPS.length);
    }, 2500);
  }, []);

  const stopLoadingAnimation = useCallback(() => {
    if (loadingStepInterval.current) {
      clearInterval(loadingStepInterval.current);
      loadingStepInterval.current = null;
    }
  }, []);

  // ─── 카테고리 설정 불러오기 ────────────────────────────────────
  useEffect(() => {
    StorageService.getSettings().then(s => {
      setSelectedCategories(s.selectedCategories);
    });
  }, []);

  // ─── 리포트 로드 ─────────────────────────────────────────────────
  const loadReport = useCallback(async (force = false) => {
    try {
      setError(null);
      startLoadingAnimation();

      let data: DailyReport | null = null;

      try {
        data = await ApiService.fetchDailyReport(force);
      } catch (err: any) {
        if (err?.message === 'analyzing') {
          // 서버가 분석 중 → 폴링
          setServerProgress('🤖 서버에서 분석 중...');
          data = await ApiService.pollUntilReady(
            (msg) => setServerProgress(msg),
            180,
            5,
          );
          if (!data) {
            throw new Error('분석 완료 대기 시간 초과');
          }
        } else {
          throw err;
        }
      }

      setReport(data);
      setServerProgress('');

      // 등장 애니메이션
      Animated.sequence([
        Animated.timing(headerAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(contentAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]).start();
    } catch (e: any) {
      setError('데이터를 불러오는 데 실패했습니다. 새로고침을 시도하세요.');
    } finally {
      stopLoadingAnimation();
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadReport();
    return () => stopLoadingAnimation();
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    // 수동 갱신 시 서버 분석 트리거
    ApiService.triggerAnalysis().then(() => {
      loadReport(true);
    });
  }, []);

  const handleNewsPress = (news: NewsItem) => {
    router.push({
      pathname: '/news/[id]',
      params: { id: news.id, data: JSON.stringify(news) },
    });
  };

  // ─── 카테고리 필터링 ────────────────────────────────────────────
  const filteredNews = report?.topNews.filter(news => {
    if (!selectedCategories || selectedCategories.length === 0) return true;
    return selectedCategories.some(cat =>
      news.category?.includes(cat) ||
      news.tags?.some(tag => tag.includes(cat))
    );
  }) ?? [];

  // 필터 결과가 없으면 전체 표시
  const displayNews = filteredNews.length > 0 ? filteredNews : (report?.topNews ?? []);
  const isFiltered = filteredNews.length > 0 && filteredNews.length < (report?.topNews.length ?? 0);

  // ─── 로딩 화면 ───────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.bgDeep} />
        <View style={styles.loadingLogoBox}>
          <Text style={styles.loadingLogo}>📊</Text>
        </View>
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: SPACING.md }} />
        <Text style={styles.loadingText}>
          {serverProgress || LOADING_STEPS[loadingStep]}
        </Text>
        <Text style={styles.loadingSubtext}>
          찰리 AI가 전 세계 뉴스를 분석하고 있어요
        </Text>
        {/* 스텝 인디케이터 */}
        <View style={styles.stepIndicator}>
          {LOADING_STEPS.map((_, i) => (
            <View
              key={i}
              style={[
                styles.stepDot,
                i === loadingStep && styles.stepDotActive,
              ]}
            />
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bgDeep} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
            title="새 분석 요청 중..."
            titleColor={COLORS.textSecondary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* ── 헤더 그라디언트 영역 ── */}
        <Animated.View style={{ opacity: headerAnim }}>
          <LinearGradient
            colors={['#0D1240', '#060914']}
            style={styles.headerGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            {/* 배경 장식 원 */}
            <View style={styles.decorCircle1} />
            <View style={styles.decorCircle2} />

            {/* 인사 & 날짜 */}
            <View style={styles.greetingRow}>
              <Text style={styles.greetingText}>{greeting} 👋</Text>
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
            </View>

            <Text style={styles.dateText}>{date}</Text>

            {/* 슬로건 */}
            <View style={styles.sloganBox}>
              <Text style={styles.sloganEmoji}>⏱</Text>
              <Text style={styles.sloganText}>오늘 아침 딱 3분 리포트</Text>
            </View>

            {/* 오늘의 핵심 한 줄 요약 */}
            {report && (
              <View style={styles.headlineCard}>
                <Text style={styles.headlineLabel}>🤖 AI 오늘의 핵심</Text>
                <Text style={styles.headlineText}>{report.headline}</Text>
                <View style={styles.headlineMeta}>
                  <Text style={styles.metaText}>📰 분석 뉴스 {report.totalNewsAnalyzed}개</Text>
                  <Text style={styles.metaText}>🕐 {time} 기준</Text>
                </View>
              </View>
            )}
          </LinearGradient>
        </Animated.View>

        {/* ── 시장 분위기 배너 ── */}
        {report && (
          <Animated.View style={[styles.moodBanner, { opacity: contentAnim }]}>
            <Text style={styles.moodEmoji}>🌡️</Text>
            <Text style={styles.moodText}>{report.marketMood}</Text>
          </Animated.View>
        )}

        {/* ── 뉴스 카드 섹션 ── */}
        <Animated.View style={[styles.newsSection, { opacity: contentAnim }]}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>🎯 오늘의 중대 뉴스</Text>
            <Text style={styles.sectionSubtitle}>
              {isFiltered
                ? `${filteredNews.length}개 (필터 적용)`
                : `${report?.topNews.length ?? 0}개 엄선`}
            </Text>
          </View>

          {/* 필터 적용 안내 */}
          {isFiltered && (
            <View style={styles.filterBanner}>
              <Text style={styles.filterBannerText}>
                🏷️ 관심 카테고리 필터 적용 중
              </Text>
              <TouchableOpacity onPress={() => setSelectedCategories([])}>
                <Text style={styles.filterClearText}>전체 보기</Text>
              </TouchableOpacity>
            </View>
          )}

          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>⚠️ {error}</Text>
            </View>
          )}

          {/* 필터된 뉴스가 없는 경우 안내 */}
          {report && filteredNews.length === 0 && selectedCategories.length > 0 && (
            <View style={styles.emptyFilter}>
              <Text style={styles.emptyFilterEmoji}>🔍</Text>
              <Text style={styles.emptyFilterText}>
                선택한 카테고리의 뉴스가 없어요.{'\n'}전체 뉴스를 표시합니다.
              </Text>
            </View>
          )}

          {displayNews.map((news, idx) => (
            <NewsCard
              key={news.id}
              news={news}
              index={idx}
              onPress={handleNewsPress}
            />
          ))}
        </Animated.View>

        {/* ── 하단 마진 ── */}
        <View style={{ height: SPACING.xxxl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgBase,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },

  // ── 로딩 ──────────────────────────────────────────────────────────
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.bgDeep,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    padding: SPACING.xl,
  },
  loadingLogoBox: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: COLORS.primary + '20',
    borderWidth: 1,
    borderColor: COLORS.primary + '40',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingLogo: { fontSize: 40 },
  loadingText: {
    color: COLORS.textPrimary,
    fontSize: FONTS.base,
    fontWeight: FONTS.semibold,
    marginTop: SPACING.sm,
    textAlign: 'center',
    minHeight: 22,
  },
  loadingSubtext: {
    color: COLORS.textMuted,
    fontSize: FONTS.sm,
    textAlign: 'center',
  },
  stepIndicator: {
    flexDirection: 'row',
    gap: 6,
    marginTop: SPACING.md,
  },
  stepDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.bgSurface,
  },
  stepDotActive: {
    backgroundColor: COLORS.primary,
    width: 18,
  },

  // ── 헤더 ──────────────────────────────────────────────────────────
  headerGradient: {
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: SPACING.xl,
    paddingHorizontal: SPACING.base,
    overflow: 'hidden',
    position: 'relative',
  },
  decorCircle1: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: COLORS.primary + '15',
    top: -60,
    right: -40,
  },
  decorCircle2: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: COLORS.accentPurple + '10',
    bottom: 20,
    left: -20,
  },
  greetingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  greetingText: {
    fontSize: FONTS.base,
    color: COLORS.textSecondary,
    fontWeight: FONTS.medium,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.accentRed + '25',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.accentRed + '50',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.accentRed,
  },
  liveText: {
    fontSize: 10,
    color: COLORS.accentRed,
    fontWeight: FONTS.black,
    letterSpacing: 1,
  },
  dateText: {
    fontSize: FONTS.xl,
    fontWeight: FONTS.extrabold,
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
  },
  sloganBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginBottom: SPACING.base,
  },
  sloganEmoji: { fontSize: 16 },
  sloganText: {
    fontSize: FONTS.md,
    color: COLORS.primary,
    fontWeight: FONTS.semibold,
    letterSpacing: 0.3,
  },

  // ── 헤드라인 카드 ─────────────────────────────────────────────────
  headlineCard: {
    backgroundColor: 'rgba(79, 110, 247, 0.12)',
    borderRadius: RADIUS.lg,
    padding: SPACING.base,
    borderWidth: 1,
    borderColor: COLORS.primary + '30',
  },
  headlineLabel: {
    fontSize: FONTS.xs,
    color: COLORS.primary,
    fontWeight: FONTS.bold,
    marginBottom: SPACING.xs,
    letterSpacing: 0.5,
  },
  headlineText: {
    fontSize: FONTS.base,
    color: COLORS.textPrimary,
    fontWeight: FONTS.semibold,
    lineHeight: 22,
    marginBottom: SPACING.sm,
  },
  headlineMeta: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  metaText: {
    fontSize: FONTS.xs,
    color: COLORS.textMuted,
  },

  // ── 시장 분위기 ───────────────────────────────────────────────────
  moodBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.bgCard,
    marginHorizontal: SPACING.base,
    marginTop: SPACING.base,
    marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.base,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.borderCard,
  },
  moodEmoji: { fontSize: 16 },
  moodText: {
    fontSize: FONTS.sm,
    color: COLORS.textSecondary,
    fontWeight: FONTS.medium,
    flex: 1,
  },

  // ── 뉴스 섹션 ─────────────────────────────────────────────────────
  newsSection: {
    paddingHorizontal: SPACING.base,
    paddingTop: SPACING.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  sectionTitle: {
    fontSize: FONTS.lg,
    fontWeight: FONTS.bold,
    color: COLORS.textPrimary,
  },
  sectionSubtitle: {
    fontSize: FONTS.sm,
    color: COLORS.primary,
    fontWeight: FONTS.medium,
  },

  // ── 필터 배너 ─────────────────────────────────────────────────────
  filterBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.primary + '12',
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.primary + '30',
  },
  filterBannerText: {
    fontSize: FONTS.xs,
    color: COLORS.primary,
    fontWeight: FONTS.medium,
  },
  filterClearText: {
    fontSize: FONTS.xs,
    color: COLORS.textMuted,
    fontWeight: FONTS.semibold,
    textDecorationLine: 'underline',
  },

  // ── 빈 필터 상태 ──────────────────────────────────────────────────
  emptyFilter: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
  },
  emptyFilterEmoji: { fontSize: 32, marginBottom: SPACING.sm },
  emptyFilterText: {
    fontSize: FONTS.sm,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },

  // ── 에러 ──────────────────────────────────────────────────────────
  errorBox: {
    backgroundColor: COLORS.dangerBg,
    borderRadius: RADIUS.md,
    padding: SPACING.base,
    marginBottom: SPACING.base,
    borderWidth: 1,
    borderColor: COLORS.danger + '40',
  },
  errorText: {
    color: COLORS.danger,
    fontSize: FONTS.sm,
    lineHeight: 18,
  },
});
