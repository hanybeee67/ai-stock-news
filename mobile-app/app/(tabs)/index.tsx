// 📁 app/(tabs)/index.tsx
// 메인 대시보드 — v3.0: 시장 온도계 + 찰리 한마디 강조

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
import { DailyReport, NewsItem, MarketTemperature } from '../../types';
import { ApiService } from '../../services/api';
import { StorageService } from '../../services/storage';
import { NewsCard } from '../../components/NewsCard';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

const LOADING_STEPS = [
  '📡 전 세계 뉴스 수집 중...',
  '🔍 AI가 핵심 뉴스를 선별 중...',
  '🤖 찰리가 나비효과를 분석 중...',
  '📈 수혜주 매핑 중...',
  '⚡ 리포트 마무리 중...',
];

function getKoreanDateTime(): { date: string; time: string; greeting: string } {
  const now = new Date();
  const koOptions: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Seoul' };
  const hour = parseInt(new Intl.DateTimeFormat('ko', { ...koOptions, hour: 'numeric', hour12: false }).format(now));
  let greeting = '좋은 아침이에요';
  if (hour >= 12 && hour < 18) greeting = '좋은 오후에요';
  else if (hour >= 18) greeting = '좋은 저녁이에요';
  const date = new Intl.DateTimeFormat('ko-KR', { ...koOptions, year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(now);
  const time = new Intl.DateTimeFormat('ko-KR', { ...koOptions, hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
  return { date, time, greeting };
}

// 시장 분위기 → 온도 매핑 (키워드 기반)
function deriveTemperature(marketMood: string): {
  temp: MarketTemperature; score: number; label: string; emoji: string; color: string;
} {
  const m = marketMood.toLowerCase();
  if (m.includes('과열') || m.includes('급등') || m.includes('폭등')) return { temp: 'overheat', score: 88, label: '과열', emoji: '🔥', color: '#FF5C7A' };
  if (m.includes('강세') || m.includes('상승') || m.includes('호조')) return { temp: 'warm', score: 68, label: '따뜻', emoji: '☀️', color: '#FF8C42' };
  if (m.includes('혼조') || m.includes('보통') || m.includes('관망')) return { temp: 'neutral', score: 50, label: '보통', emoji: '😐', color: '#F5C842' };
  if (m.includes('약세') || m.includes('하락') || m.includes('부진')) return { temp: 'cool', score: 32, label: '냉각', emoji: '❄️', color: '#4F6EF7' };
  if (m.includes('폭락') || m.includes('패닉') || m.includes('침체')) return { temp: 'cold', score: 12, label: '한랭', emoji: '🧊', color: '#A855F7' };
  return { temp: 'neutral', score: 50, label: '보통', emoji: '😐', color: '#F5C842' };
}

// 찰리 전략 코멘트 생성 (카테고리 기반)
function getCharlieComment(report: DailyReport, investorLevel: string): string {
  const topNews = report.topNews[0];
  if (!topNews) return '오늘 시장을 관망하며 기회를 찾아보세요.';
  const cat = topNews.category;
  const impact = topNews.marketImpact;
  const levelSuffix = investorLevel === 'beginner' ? ' 초보자는 관망 추천.' : investorLevel === 'advanced' ? ' 변동성 활용 전략 고려.' : '';
  if (impact === 'bullish') return `${cat} 뉴스 호재. 장 초반 갭상승 시 추격매수 금지. 눌림목 기다려라.${levelSuffix}`;
  if (impact === 'bearish') return `${cat} 악재 출현. 손절 기준선 미리 정해두고, 공황 매도 피해라.${levelSuffix}`;
  return `${cat} 방향성 불투명. 포지션 줄이고 현금 비중 높여라.${levelSuffix}`;
}

export default function DashboardScreen() {
  const [report, setReport] = useState<DailyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingStep, setLoadingStep] = useState(0);
  const [serverProgress, setServerProgress] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [investorLevel, setInvestorLevel] = useState<string>('intermediate');
  const [{ date, time, greeting }] = useState(getKoreanDateTime());

  const headerAnim = useRef(new Animated.Value(0)).current;
  const contentAnim = useRef(new Animated.Value(0)).current;
  const thermometerAnim = useRef(new Animated.Value(0)).current;
  const loadingStepInterval = useRef<ReturnType<typeof setInterval> | null>(null);

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

  useEffect(() => {
    StorageService.getSettings().then(s => {
      setSelectedCategories(s.selectedCategories);
      setInvestorLevel(s.investorLevel ?? 'intermediate');
    });
  }, []);

  const loadReport = useCallback(async (force = false) => {
    try {
      setError(null);
      startLoadingAnimation();
      let data: DailyReport | null = null;
      try {
        data = await ApiService.fetchDailyReport(force);
      } catch (err: any) {
        if (err?.message === 'analyzing') {
          setServerProgress('🤖 서버에서 분석 중...');
          data = await ApiService.pollUntilReady((msg) => setServerProgress(msg), 180, 5);
          if (!data) throw new Error('분석 완료 대기 시간 초과');
        } else {
          throw err;
        }
      }
      setReport(data);
      setServerProgress('');
      Animated.stagger(150, [
        Animated.timing(headerAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(thermometerAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
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

  useEffect(() => { loadReport(); return () => stopLoadingAnimation(); }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    ApiService.triggerAnalysis().then(() => { loadReport(true); });
  }, []);

  const handleNewsPress = (news: NewsItem) => {
    router.push({ pathname: '/news/[id]', params: { id: news.id, data: JSON.stringify(news) } });
  };

  const filteredNews = report?.topNews.filter(news => {
    if (!selectedCategories || selectedCategories.length === 0) return true;
    return selectedCategories.some(cat => news.category?.includes(cat) || news.tags?.some(tag => tag.includes(cat)));
  }) ?? [];

  const displayNews = filteredNews.length > 0 ? filteredNews : (report?.topNews ?? []);
  const isFiltered = filteredNews.length > 0 && filteredNews.length < (report?.topNews.length ?? 0);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.bgDeep} />
        <View style={styles.loadingLogoBox}>
          <Text style={styles.loadingLogo}>📊</Text>
        </View>
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: SPACING.md }} />
        <Text style={styles.loadingText}>{serverProgress || LOADING_STEPS[loadingStep]}</Text>
        <Text style={styles.loadingSubtext}>찰리 AI가 전 세계 뉴스를 분석하고 있어요</Text>
        <View style={styles.stepIndicator}>
          {LOADING_STEPS.map((_, i) => (
            <View key={i} style={[styles.stepDot, i === loadingStep && styles.stepDotActive]} />
          ))}
        </View>
      </View>
    );
  }

  const tempInfo = report ? deriveTemperature(report.marketMood) : null;
  const charlieComment = report ? getCharlieComment(report, investorLevel) : '';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bgDeep} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} title="새 분석 요청 중..." titleColor={COLORS.textSecondary} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* ── 헤더 그라디언트 ── */}
        <Animated.View style={{ opacity: headerAnim }}>
          <LinearGradient colors={['#0D1240', '#060914']} style={styles.headerGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <View style={styles.decorCircle1} />
            <View style={styles.decorCircle2} />

            <View style={styles.greetingRow}>
              <Text style={styles.greetingText}>{greeting} 👋</Text>
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
            </View>

            <Text style={styles.dateText}>{date}</Text>

            <View style={styles.sloganBox}>
              <Text style={styles.sloganEmoji}>⏱</Text>
              <Text style={styles.sloganText}>오늘 아침 딱 3분 리포트</Text>
            </View>

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

        {/* ── 🌡️ 시장 온도계 (1순위) ── */}
        {report && tempInfo && (
          <Animated.View style={[styles.thermometerSection, { opacity: thermometerAnim }]}>
            <Text style={styles.sectionLabel}>📊 오늘 시장 온도계</Text>
            <View style={styles.thermometerCard}>
              {/* 온도 레벨 바 */}
              <View style={styles.tempBarRow}>
                {(['cold', 'cool', 'neutral', 'warm', 'overheat'] as const).map((t, i) => {
                  const configs = {
                    cold: { emoji: '🧊', label: '한랭', color: '#A855F7' },
                    cool: { emoji: '❄️', label: '냉각', color: '#4F6EF7' },
                    neutral: { emoji: '😐', label: '보통', color: '#F5C842' },
                    warm: { emoji: '☀️', label: '따뜻', color: '#FF8C42' },
                    overheat: { emoji: '🔥', label: '과열', color: '#FF5C7A' },
                  };
                  const cfg = configs[t];
                  const isActive = t === tempInfo.temp;
                  return (
                    <View key={t} style={styles.tempSegment}>
                      <View style={[styles.tempBar, { backgroundColor: cfg.color + (isActive ? 'FF' : '30') }]} />
                      <Text style={[styles.tempEmoji, isActive && styles.tempEmojiActive]}>{cfg.emoji}</Text>
                      {isActive && (
                        <View style={[styles.tempPointer, { borderTopColor: cfg.color }]} />
                      )}
                    </View>
                  );
                })}
              </View>

              {/* 현재 온도 뱃지 */}
              <View style={[styles.tempBadge, { backgroundColor: tempInfo.color + '20', borderColor: tempInfo.color + '50' }]}>
                <Text style={[styles.tempBadgeEmoji]}>{tempInfo.emoji}</Text>
                <View>
                  <Text style={[styles.tempBadgeLabel, { color: tempInfo.color }]}>현재 시장: {tempInfo.label}</Text>
                  <Text style={styles.tempBadgeScore}>온도 지수 {tempInfo.score}/100</Text>
                </View>
              </View>

              {/* 섹터 요약 (marketMood) */}
              <Text style={styles.tempMoodText}>{report.marketMood}</Text>
            </View>
          </Animated.View>
        )}

        {/* ── 💬 찰리의 오늘 한마디 (5순위 — 메인에 크게) ── */}
        {report && (
          <Animated.View style={[styles.charlieSection, { opacity: contentAnim }]}>
            <LinearGradient
              colors={['rgba(79,110,247,0.18)', 'rgba(168,85,247,0.10)']}
              style={styles.charlieCard}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            >
              <View style={styles.charlieHeader}>
                <View style={styles.charlieBadge}>
                  <Text style={styles.charlieBadgeText}>💬 찰리의 오늘 한마디</Text>
                </View>
              </View>
              <Text style={styles.charlieText}>{charlieComment}</Text>
              <View style={styles.charlieFooter}>
                <Text style={styles.charlieLevel}>
                  {investorLevel === 'beginner' ? '🟢 초보 모드' : investorLevel === 'advanced' ? '🔴 고수 모드' : '🟡 중급 모드'} 기준
                </Text>
              </View>
            </LinearGradient>
          </Animated.View>
        )}

        {/* ── 뉴스 카드 섹션 ── */}
        <Animated.View style={[styles.newsSection, { opacity: contentAnim }]}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>🎯 오늘의 중대 뉴스</Text>
            <Text style={styles.sectionSubtitle}>
              {isFiltered ? `${filteredNews.length}개 (필터 적용)` : `${report?.topNews.length ?? 0}개 엄선`}
            </Text>
          </View>

          {isFiltered && (
            <View style={styles.filterBanner}>
              <Text style={styles.filterBannerText}>🏷️ 관심 카테고리 필터 적용 중</Text>
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

          {report && filteredNews.length === 0 && selectedCategories.length > 0 && (
            <View style={styles.emptyFilter}>
              <Text style={styles.emptyFilterEmoji}>🔍</Text>
              <Text style={styles.emptyFilterText}>선택한 카테고리의 뉴스가 없어요.{'\n'}전체 뉴스를 표시합니다.</Text>
            </View>
          )}

          {displayNews.map((news, idx) => (
            <NewsCard key={news.id} news={news} index={idx} onPress={handleNewsPress} />
          ))}
        </Animated.View>

        <View style={{ height: SPACING.xxxl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgBase },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1 },

  // ── 로딩 ──
  loadingContainer: { flex: 1, backgroundColor: COLORS.bgDeep, alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, padding: SPACING.xl },
  loadingLogoBox: { width: 80, height: 80, borderRadius: 24, backgroundColor: COLORS.primary + '20', borderWidth: 1, borderColor: COLORS.primary + '40', alignItems: 'center', justifyContent: 'center' },
  loadingLogo: { fontSize: 40 },
  loadingText: { color: COLORS.textPrimary, fontSize: FONTS.base, fontWeight: FONTS.semibold, marginTop: SPACING.sm, textAlign: 'center', minHeight: 22 },
  loadingSubtext: { color: COLORS.textMuted, fontSize: FONTS.sm, textAlign: 'center' },
  stepIndicator: { flexDirection: 'row', gap: 6, marginTop: SPACING.md },
  stepDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.bgSurface },
  stepDotActive: { backgroundColor: COLORS.primary, width: 18 },

  // ── 헤더 ──
  headerGradient: { paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: SPACING.xl, paddingHorizontal: SPACING.base, overflow: 'hidden', position: 'relative' },
  decorCircle1: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: COLORS.primary + '15', top: -60, right: -40 },
  decorCircle2: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: COLORS.accentPurple + '10', bottom: 20, left: -20 },
  greetingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xs },
  greetingText: { fontSize: FONTS.base, color: COLORS.textSecondary, fontWeight: FONTS.medium },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.accentRed + '25', paddingHorizontal: SPACING.sm, paddingVertical: 3, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.accentRed + '50' },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.accentRed },
  liveText: { fontSize: 10, color: COLORS.accentRed, fontWeight: FONTS.black, letterSpacing: 1 },
  dateText: { fontSize: FONTS.xl, fontWeight: FONTS.extrabold, color: COLORS.textPrimary, marginBottom: SPACING.md },
  sloganBox: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginBottom: SPACING.base },
  sloganEmoji: { fontSize: 16 },
  sloganText: { fontSize: FONTS.md, color: COLORS.primary, fontWeight: FONTS.semibold, letterSpacing: 0.3 },
  headlineCard: { backgroundColor: 'rgba(79, 110, 247, 0.12)', borderRadius: RADIUS.lg, padding: SPACING.base, borderWidth: 1, borderColor: COLORS.primary + '30' },
  headlineLabel: { fontSize: FONTS.xs, color: COLORS.primary, fontWeight: FONTS.bold, marginBottom: SPACING.xs, letterSpacing: 0.5 },
  headlineText: { fontSize: FONTS.base, color: COLORS.textPrimary, fontWeight: FONTS.semibold, lineHeight: 22, marginBottom: SPACING.sm },
  headlineMeta: { flexDirection: 'row', gap: SPACING.md },
  metaText: { fontSize: FONTS.xs, color: COLORS.textMuted },

  // ── 시장 온도계 ──
  thermometerSection: { paddingHorizontal: SPACING.base, paddingTop: SPACING.base },
  sectionLabel: { fontSize: FONTS.sm, color: COLORS.textSecondary, fontWeight: FONTS.bold, marginBottom: SPACING.sm, letterSpacing: 0.5 },
  thermometerCard: { backgroundColor: COLORS.bgCard, borderRadius: RADIUS.xl, padding: SPACING.base, borderWidth: 1, borderColor: COLORS.borderCard },
  tempBarRow: { flexDirection: 'row', gap: 4, marginBottom: SPACING.md, alignItems: 'flex-end' },
  tempSegment: { flex: 1, alignItems: 'center', gap: 6, position: 'relative' },
  tempBar: { width: '100%', height: 8, borderRadius: 4 },
  tempEmoji: { fontSize: 18, opacity: 0.35 },
  tempEmojiActive: { opacity: 1, fontSize: 22 },
  tempPointer: { position: 'absolute', top: -6, width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 6, borderLeftColor: 'transparent', borderRightColor: 'transparent' },
  tempBadge: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.base, paddingVertical: SPACING.sm, borderRadius: RADIUS.lg, borderWidth: 1, marginBottom: SPACING.sm },
  tempBadgeEmoji: { fontSize: 28 },
  tempBadgeLabel: { fontSize: FONTS.md, fontWeight: FONTS.bold },
  tempBadgeScore: { fontSize: FONTS.xs, color: COLORS.textMuted, marginTop: 2 },
  tempMoodText: { fontSize: FONTS.sm, color: COLORS.textSecondary, lineHeight: 18 },

  // ── 찰리 한마디 ──
  charlieSection: { paddingHorizontal: SPACING.base, paddingTop: SPACING.base },
  charlieCard: { borderRadius: RADIUS.xl, padding: SPACING.base, borderWidth: 1, borderColor: COLORS.primary + '40' },
  charlieHeader: { marginBottom: SPACING.sm },
  charlieBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.primary + '25', paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: RADIUS.full, alignSelf: 'flex-start' },
  charlieBadgeText: { fontSize: FONTS.xs, color: COLORS.primary, fontWeight: FONTS.bold, letterSpacing: 0.3 },
  charlieText: { fontSize: FONTS.md, color: COLORS.textPrimary, fontWeight: FONTS.semibold, lineHeight: 24, marginBottom: SPACING.sm },
  charlieFooter: { alignItems: 'flex-end' },
  charlieLevel: { fontSize: FONTS.xs, color: COLORS.textMuted },

  // ── 뉴스 섹션 ──
  newsSection: { paddingHorizontal: SPACING.base, paddingTop: SPACING.base },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  sectionTitle: { fontSize: FONTS.lg, fontWeight: FONTS.bold, color: COLORS.textPrimary },
  sectionSubtitle: { fontSize: FONTS.sm, color: COLORS.primary, fontWeight: FONTS.medium },
  filterBanner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.primary + '12', borderRadius: RADIUS.md, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.primary + '30' },
  filterBannerText: { fontSize: FONTS.xs, color: COLORS.primary, fontWeight: FONTS.medium },
  filterClearText: { fontSize: FONTS.xs, color: COLORS.textMuted, fontWeight: FONTS.semibold, textDecorationLine: 'underline' },
  emptyFilter: { alignItems: 'center', paddingVertical: SPACING.xl },
  emptyFilterEmoji: { fontSize: 32, marginBottom: SPACING.sm },
  emptyFilterText: { fontSize: FONTS.sm, color: COLORS.textMuted, textAlign: 'center', lineHeight: 20 },
  errorBox: { backgroundColor: COLORS.dangerBg, borderRadius: RADIUS.md, padding: SPACING.base, marginBottom: SPACING.base, borderWidth: 1, borderColor: COLORS.danger + '40' },
  errorText: { color: COLORS.danger, fontSize: FONTS.sm, lineHeight: 18 },
});
