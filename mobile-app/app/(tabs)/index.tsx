// 📁 app/(tabs)/index.tsx
// 메인 대시보드 화면 — '오늘 아침 딱 3분 리포트'

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
import { NewsCard } from '../../components/NewsCard';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

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
  const [{ date, time, greeting }] = useState(getKoreanDateTime());

  // 애니메이션
  const headerAnim = useRef(new Animated.Value(0)).current;
  const contentAnim = useRef(new Animated.Value(0)).current;

  const loadReport = useCallback(async (force = false) => {
    try {
      setError(null);
      const data = await ApiService.fetchDailyReport(force);
      setReport(data);

      // 등장 애니메이션
      Animated.sequence([
        Animated.timing(headerAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(contentAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]).start();
    } catch (e) {
      setError('데이터를 불러오는 데 실패했습니다. 새로고침을 시도하세요.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadReport();
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadReport(true);
  }, []);

  const handleNewsPress = (news: NewsItem) => {
    router.push({
      pathname: '/news/[id]',
      params: { id: news.id, data: JSON.stringify(news) },
    });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.bgDeep} />
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>AI가 오늘의 뉴스를 분석 중...</Text>
        <Text style={styles.loadingSubtext}>전 세계 뉴스 수백 개를 스캔하고 있어요</Text>
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
            title="새로고침 중..."
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
              {report?.topNews.length ?? 0}개 엄선
            </Text>
          </View>

          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>⚠️ {error}</Text>
            </View>
          )}

          {report?.topNews.map((news, idx) => (
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

  // 로딩
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.bgDeep,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
    padding: SPACING.xl,
  },
  loadingText: {
    color: COLORS.textPrimary,
    fontSize: FONTS.lg,
    fontWeight: FONTS.semibold,
    marginTop: SPACING.md,
  },
  loadingSubtext: {
    color: COLORS.textMuted,
    fontSize: FONTS.sm,
    textAlign: 'center',
  },

  // 헤더
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
  sloganEmoji: {
    fontSize: 16,
  },
  sloganText: {
    fontSize: FONTS.md,
    color: COLORS.primary,
    fontWeight: FONTS.semibold,
    letterSpacing: 0.3,
  },

  // 헤드라인 카드
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

  // 시장 분위기
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
  moodEmoji: {
    fontSize: 16,
  },
  moodText: {
    fontSize: FONTS.sm,
    color: COLORS.textSecondary,
    fontWeight: FONTS.medium,
    flex: 1,
  },

  // 뉴스 섹션
  newsSection: {
    paddingHorizontal: SPACING.base,
    paddingTop: SPACING.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.base,
  },
  sectionTitle: {
    fontSize: FONTS.lg,
    fontWeight: FONTS.bold,
    color: COLORS.textPrimary,
  },
  sectionSubtitle: {
    fontSize: FONTS.sm,
    color: COLORS.textMuted,
    fontWeight: FONTS.medium,
  },

  // 에러
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
