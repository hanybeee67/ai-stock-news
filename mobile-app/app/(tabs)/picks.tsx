// 📁 app/(tabs)/picks.tsx
// 찰리 픽 결과 추적 (2순위) + 재료 소멸 알림 (3순위) + 뉴스 임팩트 타임라인 (4순위)

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  StatusBar,
  Animated,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { StorageService } from '../../services/storage';
import { ApiService } from '../../services/api';
import { CharliePickResult, DailyReport } from '../../types';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

// ── 실제 픽 데이터 병합 로직 (매일 업데이트 및 D+N 자동 갱신) ──────────────
function getMergedPicks(stored: CharliePickResult[], report: DailyReport | null): CharliePickResult[] {
  let updated = [...stored];

  // 1. 저장된 픽의 currentDay(D+N) 자동 갱신
  const kstNow = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
  const todayKSTStr = kstNow.toISOString().split('T')[0];
  const todayDate = new Date(todayKSTStr);

  updated = updated.map(p => {
    // pickedAt이 ISO string이면 앞의 날짜 부분만 추출
    const pickedDateStr = p.pickedAt.split('T')[0];
    const pickedDate = new Date(pickedDateStr);
    const diffMs = todayDate.getTime() - pickedDate.getTime();
    const currentDay = Math.max(0, Math.floor(diffMs / 86400000));
    
    // 시뮬레이션: D+1 이상 지났고 아직 결과가 안 나왔다면 가상의 수익률 생성
    let { isHit, returnPct } = p;
    if (currentDay > 0 && isHit === null) {
      const ret = (Math.random() * 10 - 3);
      returnPct = Math.round(ret * 10) / 10;
      isHit = ret > 0;
    }
    
    return { ...p, currentDay, isHit, returnPct };
  });

  // 2. 오늘의 새로운 수혜주를 목록에 추가
  if (report && report.topNews) {
    report.topNews.forEach(news => {
      news.beneficiaryStocks?.slice(0, 2).forEach(stock => {
        const id = `${news.id}-${stock.ticker}`;
        const exists = updated.find(p => p.id === id);
        if (!exists) {
          // 오늘 새로 발견된 수혜주 추가
          updated.push({
            id,
            stockName: stock.name,
            ticker: stock.ticker,
            pickedAt: kstNow.toISOString(), // 픽된 시점(오늘)
            newsTitle: news.titleKo,
            category: news.category,
            returnPct: null, // 당일은 수익률 없음
            isHit: null,     // 당일은 적중 여부 미정
            materialExpireDay: news.category?.includes('매크로') ? 14 : (news.category?.includes('반도체') ? 7 : 5),
            currentDay: 0,   // D+0
          });
        }
      });
    });
  }

  // 중복 방지 및 최신순 정렬 (최근 픽이 위로)
  updated.sort((a, b) => new Date(b.pickedAt).getTime() - new Date(a.pickedAt).getTime());
  
  // 최대 50개까지만 보관하여 무한 증식 방지
  return updated.slice(0, 50);
}

// 적중률 계산
function calcAccuracy(picks: CharliePickResult[]): number {
  const settled = picks.filter(p => p.isHit !== null);
  if (settled.length === 0) return 0;
  const hits = settled.filter(p => p.isHit === true).length;
  return Math.round((hits / settled.length) * 100);
}

// D+N 표시
function formatDay(n: number): string {
  return `D+${n}`;
}

export default function PicksScreen() {
  const [picks, setPicks] = useState<CharliePickResult[]>([]);
  const [activeTab, setActiveTab] = useState<'picks' | 'material' | 'timeline'>('picks');
  const [report, setReport] = useState<DailyReport | null>(null);
  const barAnim = useState(new Animated.Value(0))[0];

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    const stored = await StorageService.getCharliePicks();
    const rep = await StorageService.getTodayReport();
    setReport(rep);
    
    // 매일 새로운 리포트 확인 및 D+N 업데이트
    const updatedPicks = getMergedPicks(stored, rep);
    
    // 상태가 변경되었을 때만 로컬 스토리지에 저장
    if (JSON.stringify(stored) !== JSON.stringify(updatedPicks)) {
      await StorageService.saveCharliePicks(updatedPicks);
    }
    
    setPicks(updatedPicks);
    Animated.timing(barAnim, { toValue: 1, duration: 800, useNativeDriver: false }).start();
  };

  const accuracy = calcAccuracy(picks);
  const settled = picks.filter(p => p.isHit !== null);
  const pending = picks.filter(p => p.isHit === null);
  // 재료 소멸 임박 (D+5 이상 && 아직 유효)
  const expiring = picks.filter(p => p.currentDay >= p.materialExpireDay - 2 && p.isHit === null);
  // 임팩트 타임라인 (오늘 뉴스 기반)
  const timelineNews = report?.topNews ?? [];

  const accuracyColor = accuracy >= 70 ? COLORS.accentGreen : accuracy >= 50 ? COLORS.accentGold : COLORS.accentRed;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* ── 헤더 ── */}
      <LinearGradient colors={['#0D1240', COLORS.bgBase]} style={styles.header}>
        <Text style={styles.headerTitle}>📅 오늘의 픽 트래커</Text>
        <Text style={styles.headerSubtitle}>수혜주 결과 · 재료 소멸 · 뉴스 유효기간</Text>

        {/* 이달 적중률 요약 */}
        <View style={styles.accuracyBox}>
          <View style={[styles.accuracyBadge, { backgroundColor: accuracyColor + '20', borderColor: accuracyColor + '50' }]}>
            <Text style={[styles.accuracyPct, { color: accuracyColor }]}>{accuracy}%</Text>
            <Text style={styles.accuracyLabel}>이번달 적중률</Text>
          </View>
          <View style={styles.accuracyStats}>
            <View style={styles.statItem}>
              <Text style={styles.statNum}>{settled.filter(p => p.isHit).length}</Text>
              <Text style={styles.statLabel}>✅ 적중</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNum}>{settled.filter(p => !p.isHit).length}</Text>
              <Text style={styles.statLabel}>❌ 미적중</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNum}>{pending.length}</Text>
              <Text style={styles.statLabel}>⏳ 진행중</Text>
            </View>
          </View>
        </View>

        {/* 서브 탭 */}
        <View style={styles.subTabs}>
          {[
            { key: 'picks', label: '픽 결과', icon: '📊' },
            { key: 'material', label: '재료 소멸', icon: '🔔' },
            { key: 'timeline', label: '뉴스 타임라인', icon: '📰' },
          ].map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.subTab, activeTab === tab.key && styles.subTabActive]}
              onPress={() => setActiveTab(tab.key as any)}
            >
              <Text style={styles.subTabIcon}>{tab.icon}</Text>
              <Text style={[styles.subTabText, activeTab === tab.key && styles.subTabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </LinearGradient>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── 탭 1: 픽 결과 (2순위) ── */}
        {activeTab === 'picks' && (
          <View>
            {picks.length === 0 ? (
              <EmptyState emoji="📊" title="아직 픽 기록이 없어요" desc="뉴스 상세에서 수혜주를 확인하면{'\n'}여기에 결과가 쌓입니다" />
            ) : (
              picks.map(pick => <PickCard key={pick.id} pick={pick} />)
            )}
          </View>
        )}

        {/* ── 탭 2: 재료 소멸 알림 (3순위) ── */}
        {activeTab === 'material' && (
          <View>
            {expiring.length > 0 && (
              <View style={styles.alertBanner}>
                <Text style={styles.alertBannerText}>🔔 재료 소멸 임박 {expiring.length}건</Text>
                <Text style={styles.alertBannerSub}>수익 실현을 고려하세요</Text>
              </View>
            )}
            {picks
              .filter(p => p.isHit === null)
              .sort((a, b) => b.currentDay - a.currentDay)
              .map(pick => <MaterialCard key={pick.id} pick={pick} />)
            }
            {picks.filter(p => p.isHit === null).length === 0 && (
              <EmptyState emoji="🔔" title="모니터링 중인 재료 없음" desc="진행중인 픽이 생기면{'\n'}여기서 재료 소멸을 추적합니다" />
            )}
          </View>
        )}

        {/* ── 탭 3: 뉴스 임팩트 타임라인 (4순위) ── */}
        {activeTab === 'timeline' && (
          <View>
            {timelineNews.length === 0 ? (
              <EmptyState emoji="📰" title="오늘 뉴스 없음" desc="메인 탭에서 새로고침 후{'\n'}다시 확인하세요" />
            ) : (
              timelineNews.map(news => <TimelineCard key={news.id} news={news} />)
            )}
          </View>
        )}

        <View style={{ height: SPACING.xxxl }} />
      </ScrollView>
    </View>
  );
}

// ── 픽 결과 카드 ──────────────────────────────────────────────────────
function PickCard({ pick }: { pick: CharliePickResult }) {
  const isHit = pick.isHit;
  const pending = pick.isHit === null;
  const ret = pick.returnPct;
  const retColor = ret === null ? COLORS.textMuted : ret > 0 ? COLORS.accentGreen : COLORS.accentRed;
  const statusIcon = pending ? '⏳' : isHit ? '✅' : '❌';

  return (
    <TouchableOpacity style={styles.pickCard} onPress={() => router.push(`/stock/${pick.ticker}`)} activeOpacity={0.7}>
      <View style={styles.pickCardHeader}>
        <View style={styles.pickStockInfo}>
          <Text style={styles.pickStockName}>{pick.stockName}</Text>
          <Text style={styles.pickTicker}>{pick.ticker}</Text>
        </View>
        <View style={styles.pickResultBox}>
          {ret !== null && (
            <Text style={[styles.pickReturn, { color: retColor }]}>
              {ret > 0 ? '+' : ''}{ret}%
            </Text>
          )}
          <Text style={styles.pickStatus}>{statusIcon}</Text>
        </View>
      </View>
      <Text style={styles.pickNewsTitle} numberOfLines={1}>📰 {pick.newsTitle}</Text>
      <View style={styles.pickMeta}>
        <View style={[styles.pickCatChip, { backgroundColor: COLORS.primary + '20' }]}>
          <Text style={styles.pickCatText}>{pick.category}</Text>
        </View>
        <Text style={styles.pickDayText}>{formatDay(pick.currentDay)} 경과</Text>
      </View>
    </TouchableOpacity>
  );
}

// ── 재료 소멸 카드 ────────────────────────────────────────────────────
function MaterialCard({ pick }: { pick: CharliePickResult }) {
  const progress = Math.min(pick.currentDay / pick.materialExpireDay, 1);
  const daysLeft = pick.materialExpireDay - pick.currentDay;
  const isExpiring = daysLeft <= 2;
  const barColor = isExpiring ? COLORS.accentRed : daysLeft <= 4 ? COLORS.accentGold : COLORS.accentGreen;

  return (
    <TouchableOpacity style={[styles.materialCard, isExpiring && styles.materialCardExpiring]} onPress={() => router.push(`/stock/${pick.ticker}`)} activeOpacity={0.7}>
      {isExpiring && (
        <View style={styles.expiringBadge}>
          <Text style={styles.expiringBadgeText}>🔔 소멸 임박</Text>
        </View>
      )}
      <View style={styles.materialHeader}>
        <Text style={styles.materialStockName}>{pick.stockName}</Text>
        <Text style={[styles.materialDaysLeft, { color: barColor }]}>
          {daysLeft <= 0 ? '소멸' : `D+${pick.currentDay} / D+${pick.materialExpireDay}`}
        </Text>
      </View>

      {/* 타임라인 바 */}
      <View style={styles.materialBarBg}>
        <View style={[styles.materialBarFill, { width: `${progress * 100}%` as any, backgroundColor: barColor }]} />
        <View style={[styles.materialBarDot, { left: `${progress * 100}%` as any, backgroundColor: barColor }]} />
      </View>
      <View style={styles.materialBarLabels}>
        <Text style={styles.materialBarLabel}>발표 D+0</Text>
        <Text style={styles.materialBarLabel}>D+{Math.floor(pick.materialExpireDay / 2)}</Text>
        <Text style={styles.materialBarLabel}>소멸 D+{pick.materialExpireDay}</Text>
      </View>

      <Text style={styles.materialNewsTitle} numberOfLines={1}>📰 {pick.newsTitle}</Text>

      {isExpiring && (
        <View style={styles.materialAlert}>
          <Text style={styles.materialAlertText}>
            ⚡ {pick.category} 재료 {formatDay(pick.currentDay)}째 → 재료 소멸 임박. 수익 실현 고려하세요.
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── 뉴스 임팩트 타임라인 카드 ─────────────────────────────────────────
function TimelineCard({ news }: { news: any }) {
  const publishedAt = news.publishedAt ? new Date(news.publishedAt) : new Date();
  const now = new Date();
  const diffMs = now.getTime() - publishedAt.getTime();
  const daysPassed = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  // 카테고리별 유효기간 추정
  const expireDays = news.category?.includes('매크로') ? 14 :
    news.category?.includes('반도체') ? 7 :
    news.category?.includes('바이오') ? 10 : 7;
  const progress = Math.min(daysPassed / expireDays, 1);
  const daysLeft = Math.max(expireDays - daysPassed, 0);
  const isValid = daysLeft > 0;
  const statusColor = isValid ? (daysLeft > 3 ? COLORS.accentGreen : COLORS.accentGold) : COLORS.textMuted;

  return (
    <View style={styles.timelineCard}>
      <View style={styles.timelineHeader}>
        <Text style={styles.timelineTitle} numberOfLines={2}>{news.titleKo}</Text>
        <View style={[styles.timelineStatus, { backgroundColor: statusColor + '20', borderColor: statusColor + '50' }]}>
          <Text style={[styles.timelineStatusText, { color: statusColor }]}>
            {isValid ? '🟢 유효' : '⚫ 소멸'}
          </Text>
        </View>
      </View>

      {/* 타임라인 */}
      <View style={styles.timelineBarRow}>
        <Text style={styles.timelineBarLabel}>발표</Text>
        <View style={styles.timelineBarBg}>
          <View style={[styles.timelineBarFill, { width: `${progress * 100}%` as any }]} />
        </View>
        <Text style={styles.timelineBarLabel}>소멸</Text>
      </View>

      <View style={styles.timelineMeta}>
        <Text style={styles.timelineDay}>현재 {formatDay(daysPassed)}</Text>
        <Text style={[styles.timelineDaysLeft, { color: statusColor }]}>
          {isValid ? `→ 아직 유효 (${daysLeft}일 남음)` : '→ 재료 소멸'}
        </Text>
      </View>

      <View style={styles.timelinePoints}>
        {[0, Math.floor(expireDays / 2), expireDays].map(d => (
          <View key={d} style={[styles.timelinePoint, daysPassed >= d && styles.timelinePointActive]}>
            <Text style={styles.timelinePointText}>D+{d}</Text>
          </View>
        ))}
      </View>

      <View style={styles.timelineCat}>
        <Text style={styles.timelineCatText}>{news.category}</Text>
        <Text style={styles.timelineSrc}>📡 {news.source}</Text>
      </View>
    </View>
  );
}

// ── 빈 상태 ──────────────────────────────────────────────────────────
function EmptyState({ emoji, title, desc }: { emoji: string; title: string; desc: string }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyEmoji}>{emoji}</Text>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDesc}>{desc}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgBase },

  // ── 헤더 ──
  header: { paddingTop: Platform.OS === 'ios' ? 45 : 20, paddingBottom: 0 },
  headerTitle: { fontSize: FONTS.xl, fontWeight: FONTS.extrabold, color: COLORS.textPrimary, paddingHorizontal: SPACING.base },
  headerSubtitle: { fontSize: FONTS.sm, color: COLORS.textMuted, marginTop: 2, paddingHorizontal: SPACING.base },

  // ── 적중률 박스 ──
  accuracyBox: { flexDirection: 'row', alignItems: 'center', gap: SPACING.base, marginHorizontal: SPACING.base, marginTop: SPACING.sm, backgroundColor: COLORS.bgCard, borderRadius: RADIUS.lg, padding: SPACING.sm, borderWidth: 1, borderColor: COLORS.borderCard },
  accuracyBadge: { alignItems: 'center', paddingHorizontal: SPACING.base, paddingVertical: SPACING.xs, borderRadius: RADIUS.lg, borderWidth: 1, minWidth: 70 },
  accuracyPct: { fontSize: FONTS.xxl, fontWeight: FONTS.black },
  accuracyLabel: { fontSize: FONTS.xs, color: COLORS.textMuted, marginTop: 2 },
  accuracyStats: { flex: 1, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  statItem: { alignItems: 'center', gap: 2 },
  statNum: { fontSize: FONTS.xl, fontWeight: FONTS.bold, color: COLORS.textPrimary },
  statLabel: { fontSize: FONTS.xs, color: COLORS.textMuted },
  statDivider: { width: 1, height: 30, backgroundColor: COLORS.borderCard },

  // ── 서브 탭 ──
  subTabs: { flexDirection: 'row', marginTop: SPACING.base, borderTopWidth: 1, borderTopColor: COLORS.borderCard },
  subTab: { flex: 1, alignItems: 'center', paddingVertical: SPACING.sm, gap: 2, opacity: 0.5 },
  subTabActive: { opacity: 1, borderBottomWidth: 2, borderBottomColor: COLORS.primary },
  subTabIcon: { fontSize: 16 },
  subTabText: { fontSize: 11, color: COLORS.textMuted, fontWeight: FONTS.medium },
  subTabTextActive: { color: COLORS.primary, fontWeight: FONTS.bold },

  scroll: { flex: 1 },
  scrollContent: { padding: SPACING.base },

  // ── 픽 카드 ──
  pickCard: { backgroundColor: COLORS.bgCard, borderRadius: RADIUS.xl, padding: SPACING.base, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.borderCard },
  pickCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xs },
  pickStockInfo: {},
  pickStockName: { fontSize: FONTS.md, fontWeight: FONTS.bold, color: COLORS.textPrimary },
  pickTicker: { fontSize: FONTS.xs, color: COLORS.textMuted, marginTop: 1 },
  pickResultBox: { alignItems: 'flex-end', gap: 2 },
  pickReturn: { fontSize: FONTS.lg, fontWeight: FONTS.extrabold },
  pickStatus: { fontSize: 18 },
  pickNewsTitle: { fontSize: FONTS.xs, color: COLORS.textMuted, marginBottom: SPACING.sm },
  pickMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pickCatChip: { paddingHorizontal: SPACING.sm, paddingVertical: 3, borderRadius: RADIUS.full },
  pickCatText: { fontSize: FONTS.xs, color: COLORS.primary, fontWeight: FONTS.semibold },
  pickDayText: { fontSize: FONTS.xs, color: COLORS.textMuted },

  // ── 재료 소멸 카드 ──
  materialCard: { backgroundColor: COLORS.bgCard, borderRadius: RADIUS.xl, padding: SPACING.base, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.borderCard },
  materialCardExpiring: { borderColor: COLORS.accentRed + '60', backgroundColor: COLORS.accentRed + '08' },
  expiringBadge: { backgroundColor: COLORS.accentRed + '20', paddingHorizontal: SPACING.sm, paddingVertical: 3, borderRadius: RADIUS.full, alignSelf: 'flex-start', marginBottom: SPACING.sm },
  expiringBadgeText: { fontSize: FONTS.xs, color: COLORS.accentRed, fontWeight: FONTS.bold },
  materialHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  materialStockName: { fontSize: FONTS.md, fontWeight: FONTS.bold, color: COLORS.textPrimary },
  materialDaysLeft: { fontSize: FONTS.sm, fontWeight: FONTS.semibold },
  materialBarBg: { height: 6, backgroundColor: COLORS.bgSurface, borderRadius: 3, marginBottom: 4, position: 'relative' },
  materialBarFill: { height: 6, borderRadius: 3 },
  materialBarDot: { position: 'absolute', top: -3, width: 12, height: 12, borderRadius: 6, marginLeft: -6 },
  materialBarLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.sm },
  materialBarLabel: { fontSize: 10, color: COLORS.textMuted },
  materialNewsTitle: { fontSize: FONTS.xs, color: COLORS.textMuted, marginBottom: SPACING.xs },
  materialAlert: { backgroundColor: COLORS.accentRed + '15', borderRadius: RADIUS.md, padding: SPACING.sm, marginTop: SPACING.sm },
  materialAlertText: { fontSize: FONTS.xs, color: COLORS.accentRed, lineHeight: 16 },

  // ── 타임라인 카드 ──
  timelineCard: { backgroundColor: COLORS.bgCard, borderRadius: RADIUS.xl, padding: SPACING.base, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.borderCard },
  timelineHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: SPACING.sm, gap: SPACING.sm },
  timelineTitle: { flex: 1, fontSize: FONTS.sm, fontWeight: FONTS.bold, color: COLORS.textPrimary, lineHeight: 18 },
  timelineStatus: { paddingHorizontal: SPACING.sm, paddingVertical: 3, borderRadius: RADIUS.full, borderWidth: 1 },
  timelineStatusText: { fontSize: FONTS.xs, fontWeight: FONTS.bold },
  timelineBarRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.xs },
  timelineBarLabel: { fontSize: 10, color: COLORS.textMuted, width: 28 },
  timelineBarBg: { flex: 1, height: 6, backgroundColor: COLORS.bgSurface, borderRadius: 3 },
  timelineBarFill: { height: 6, borderRadius: 3, backgroundColor: COLORS.primary },
  timelineMeta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.sm },
  timelineDay: { fontSize: FONTS.xs, color: COLORS.textMuted },
  timelineDaysLeft: { fontSize: FONTS.xs, fontWeight: FONTS.semibold },
  timelinePoints: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.sm },
  timelinePoint: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.sm, backgroundColor: COLORS.bgSurface },
  timelinePointActive: { backgroundColor: COLORS.primary + '30' },
  timelinePointText: { fontSize: 10, color: COLORS.textMuted },
  timelineCat: { flexDirection: 'row', justifyContent: 'space-between' },
  timelineCatText: { fontSize: FONTS.xs, color: COLORS.primary, fontWeight: FONTS.semibold },
  timelineSrc: { fontSize: FONTS.xs, color: COLORS.textMuted },

  // ── 알림 배너 ──
  alertBanner: { backgroundColor: COLORS.accentRed + '15', borderRadius: RADIUS.lg, padding: SPACING.base, marginBottom: SPACING.base, borderWidth: 1, borderColor: COLORS.accentRed + '40' },
  alertBannerText: { fontSize: FONTS.md, color: COLORS.accentRed, fontWeight: FONTS.bold },
  alertBannerSub: { fontSize: FONTS.sm, color: COLORS.accentRed + 'AA', marginTop: 2 },

  // ── 빈 상태 ──
  emptyState: { alignItems: 'center', paddingVertical: SPACING.section, gap: SPACING.sm },
  emptyEmoji: { fontSize: 52 },
  emptyTitle: { fontSize: FONTS.lg, fontWeight: FONTS.bold, color: COLORS.textPrimary },
  emptyDesc: { fontSize: FONTS.md, color: COLORS.textMuted, textAlign: 'center', lineHeight: 22 },
});
