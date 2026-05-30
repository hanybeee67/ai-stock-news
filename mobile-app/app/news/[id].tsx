// 📁 app/news/[id].tsx — v2.0: marketImpact 컬러 토글, AI 신뢰도 별점, 나비효과 인디케이터

import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, Linking, Platform, Share, Animated,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { NewsItem, BeneficiaryStock, ButterflyEffect, RiskFactor } from '../../types';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS, CATEGORY_CONFIG } from '../../constants/theme';
import { ImportanceBadge } from '../../components/ui/ImportanceBadge';
import { CategoryTag } from '../../components/ui/CategoryTag';
import { StorageService } from '../../services/storage';

// marketImpact 별 헤더 그라디언트 색상
const IMPACT_GRADIENTS: Record<string, [string, string]> = {
  bullish:  ['#0a2a1a', '#060914'],
  bearish:  ['#2a0a0a', '#060914'],
  neutral:  ['#0D1240', '#060914'],
};

// AI 신뢰도 → 별점 변환
function ConfidenceStars({ score }: { score: number }) {
  const stars = Math.round(score / 20); // 0~100 → 0~5
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      {[1,2,3,4,5].map(i => (
        <Text key={i} style={{ fontSize: 12, color: i <= stars ? COLORS.accentGold : COLORS.bgSurface }}>★</Text>
      ))}
      <Text style={{ fontSize: 11, color: COLORS.textMuted, marginLeft: 4 }}>{score}%</Text>
    </View>
  );
}

export default function NewsDetailScreen() {
  const { data } = useLocalSearchParams<{ data: string }>();
  const news: NewsItem = JSON.parse(data ?? '{}');
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<'analysis' | 'stocks' | 'risks'>('analysis');

  const catConfig = CATEGORY_CONFIG[news.category] || { emoji: '📌', color: COLORS.primary };
  const gradientColors = IMPACT_GRADIENTS[news.marketImpact] ?? IMPACT_GRADIENTS.neutral;

  useEffect(() => {
    StorageService.isNewsSaved(news.id).then(setSaved);
  }, [news.id]);

  const handleSave = async () => {
    if (saved) {
      await StorageService.removeSavedNews(news.id);
    } else {
      await StorageService.saveNewsItem(news);
    }
    setSaved(!saved);
  };

  const handleShare = async () => {
    await Share.share({
      title: news.titleKo,
      message: `📊 AI 증시 브리핑\n\n${news.titleKo}\n\n${news.summary.split('.')[0]}.\n\n출처: ${news.source}`,
    });
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── 헤더 (marketImpact 컬러 토글) ── */}
        <LinearGradient colors={gradientColors} style={styles.headerGradient}>
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
              <Text style={styles.backIcon}>←</Text>
              <Text style={styles.backText}>뒤로</Text>
            </TouchableOpacity>
            <View style={styles.topActions}>
              <TouchableOpacity style={styles.iconBtn} onPress={handleShare}>
                <Text style={styles.iconBtnText}>↗</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.iconBtn, saved && styles.iconBtnActive]}
                onPress={handleSave}
              >
                <Text style={styles.iconBtnText}>{saved ? '🔖' : '📌'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* 카테고리 & 중요도 */}
          <View style={styles.badgeRow}>
            <CategoryTag category={news.category} />
            <ImportanceBadge level={news.importance} />
            <View style={styles.sourceBadge}>
              <Text style={styles.sourceText}>{news.source}</Text>
            </View>
            {/* marketImpact 뱃지 */}
            <View style={[styles.impactBadge, {
              backgroundColor: news.marketImpact === 'bullish' ? COLORS.accentGreen + '25'
                : news.marketImpact === 'bearish' ? COLORS.accentRed + '25'
                : COLORS.accentGold + '25'
            }]}>
              <Text style={[styles.impactBadgeText, {
                color: news.marketImpact === 'bullish' ? COLORS.accentGreen
                  : news.marketImpact === 'bearish' ? COLORS.accentRed
                  : COLORS.accentGold
              }]}>
                {news.marketImpact === 'bullish' ? '▲ 긍정' : news.marketImpact === 'bearish' ? '▼ 부정' : '◆ 중립'}
              </Text>
            </View>
          </View>

          <Text style={styles.title}>{news.titleKo}</Text>
          <Text style={styles.originalTitle}>{news.title}</Text>

          {/* 시간 + AI 신뢰도 별점 */}
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>
              {new Date(news.publishedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
            </Text>
            <View style={styles.confidencePill}>
              <Text style={styles.confidenceLabel}>🤖 AI 신뢰도 </Text>
              <ConfidenceStars score={news.aiConfidence} />
            </View>
          </View>
        </LinearGradient>

        {/* ── 3줄 요약 ── */}
        <View style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>📝 3줄 요약 (초보자용)</Text>
          {news.summary.split('.').filter(s => s.trim()).slice(0, 3).map((sentence, i) => (
            <View key={i} style={styles.summaryRow}>
              <Text style={styles.summaryBullet}>{['1️⃣','2️⃣','3️⃣'][i]}</Text>
              <Text style={styles.summaryText}>{sentence.trim()}.</Text>
            </View>
          ))}
          <TouchableOpacity style={styles.readMoreBtn} onPress={() => Linking.openURL(news.sourceUrl)}>
            <Text style={styles.readMoreText}>원문 읽기 →</Text>
          </TouchableOpacity>
        </View>

        {/* ── 탭 메뉴 ── */}
        <View style={styles.tabBar}>
          {[
            { key: 'analysis', label: '🔍 AI 분석' },
            { key: 'stocks',   label: '📈 수혜주' },
            { key: 'risks',    label: '⚠️ 리스크' },
          ].map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabItem, activeTab === tab.key && styles.tabItemActive]}
              onPress={() => setActiveTab(tab.key as any)}
            >
              <Text style={[styles.tabLabel, activeTab === tab.key && styles.tabLabelActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.scrollContent}>

          {/* ── AI 분석 탭 ── */}
          {activeTab === 'analysis' && (
            <View style={styles.tabContent}>
              <View style={styles.analysisCard}>
                <View style={styles.analysisHeader}>
                  <Text style={styles.analysisIcon}>🔍</Text>
                  <Text style={styles.analysisTitle}>AI의 돋보기 분석</Text>
                </View>
                <Text style={styles.analysisBody}>{news.aiAnalysis}</Text>
              </View>

              <Text style={styles.sectionTitle}>🦋 나비효과 분석</Text>
              <Text style={styles.sectionSubtitle}>이 뉴스가 만들어낼 2차·3차 파급효과</Text>

              {news.butterflyEffects?.map((effect, i) => (
                <ButterflyEffectCard
                  key={i}
                  effect={effect}
                  isLast={i === news.butterflyEffects.length - 1}
                />
              ))}
            </View>
          )}

          {/* ── 수혜주 탭 ── */}
          {activeTab === 'stocks' && (
            <View style={styles.tabContent}>
              <Text style={styles.sectionTitle}>📈 관련 수혜주 맵</Text>
              <Text style={styles.sectionSubtitle}>AI가 연관성과 근거를 분석한 종목 (클릭하여 상세 정보 보기)</Text>
              {news.beneficiaryStocks?.map((stock, i) => (
                <StockCard 
                  key={i} 
                  stock={stock} 
                  onPress={(ticker) => router.push(`/stock/${ticker}`)}
                />
              ))}
            </View>
          )}

          {/* ── 리스크 탭 ── */}
          {activeTab === 'risks' && (
            <View style={styles.tabContent}>
              <View style={styles.riskHeader}>
                <Text style={styles.riskHeaderEmoji}>🛡️</Text>
                <View>
                  <Text style={styles.riskHeaderTitle}>주린이 방어벽</Text>
                  <Text style={styles.riskHeaderSub}>반드시 확인하세요</Text>
                </View>
              </View>
              {news.riskFactors?.map((risk, i) => (
                <RiskCard key={i} risk={risk} />
              ))}
            </View>
          )}

          <View style={{ height: SPACING.xxxl }} />
        </View>
      </ScrollView>
    </View>
  );
}

// ── 나비효과 카드 (인디케이터 바 포함) ─────────────────────────────
function ButterflyEffectCard({ effect, isLast }: { effect: ButterflyEffect; isLast: boolean }) {
  const LEVEL_COLORS = [COLORS.primary, COLORS.accentGold, COLORS.accentGreen];
  const color = LEVEL_COLORS[effect.level - 1] || COLORS.textSecondary;
  const BAR_WIDTHS = ['85%', '65%', '45%']; // 레벨별 강도 바

  return (
    <View style={styles.effectRow}>
      <View style={styles.effectLine}>
        <View style={[styles.effectDot, { backgroundColor: color }]} />
        {!isLast && <View style={[styles.effectConnector, { backgroundColor: color + '40' }]} />}
      </View>
      <View style={[styles.effectCard, { borderColor: color + '30' }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xs }}>
          <View style={[styles.effectLevelBadge, { backgroundColor: color + '20' }]}>
            <Text style={[styles.effectLevelText, { color }]}>{effect.level}차 파급</Text>
          </View>
          {/* 강도 인디케이터 바 */}
          <View style={styles.intensityTrack}>
            <View style={[styles.intensityFill, { width: BAR_WIDTHS[effect.level-1] as any, backgroundColor: color }]} />
          </View>
        </View>
        <Text style={styles.effectDesc}>{effect.description}</Text>
        {effect.indicator && (
          <View style={styles.indicatorChip}>
            <Text style={styles.indicatorText}>📡 {effect.indicator}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ── 수혜주 카드 ──────────────────────────────────────────────────────
function StockCard({ stock, onPress }: { stock: BeneficiaryStock; onPress: (ticker: string) => void }) {
  const relevanceConfig = {
    high:   { label: '연관 높음', color: COLORS.accentGreen, bg: COLORS.accentGreenDim },
    medium: { label: '연관 보통', color: COLORS.accentGold,  bg: COLORS.accentGoldDim },
    low:    { label: '연관 낮음', color: COLORS.textMuted,   bg: COLORS.bgSurface },
  };
  const rel = relevanceConfig[stock.relevance] ?? relevanceConfig.low;
  const marketFlags: Record<string, string> = { KRX:'🇰🇷', NYSE:'🇺🇸', NASDAQ:'🇺🇸', TSE:'🇯🇵' };

  // 추세 색상
  const trendColor = stock.trendDirection === 'up' ? COLORS.accentGreen
    : stock.trendDirection === 'down' ? COLORS.accentRed
    : COLORS.accentGold;

  return (
    <TouchableOpacity 
      style={styles.stockCard} 
      activeOpacity={0.7}
      onPress={() => onPress(stock.ticker)}
    >
      <View style={styles.stockCardHeader}>
        <View style={styles.stockNameRow}>
          <Text style={styles.stockFlag}>{marketFlags[stock.market] ?? '🌐'}</Text>
          <View>
            <Text style={styles.stockName}>{stock.name}</Text>
            <Text style={styles.stockTicker}>{stock.ticker} · {stock.market}</Text>
          </View>
        </View>
        <View style={[styles.relevanceBadge, { backgroundColor: rel.bg }]}>
          <Text style={[styles.relevanceText, { color: rel.color }]}>{rel.label}</Text>
        </View>
      </View>
      <Text style={styles.stockSector}>🏭 {stock.sector}</Text>
      <Text style={styles.stockReason}>{stock.reason}</Text>
      {stock.recentTrend && (
        <View style={[styles.trendChip, { borderColor: trendColor + '40' }]}>
          <Text style={[styles.trendText, { color: trendColor }]}>
            {stock.trendDirection === 'up' ? '▲' : stock.trendDirection === 'down' ? '▼' : '◆'} {stock.recentTrend}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── 리스크 카드 ──────────────────────────────────────────────────────
function RiskCard({ risk }: { risk: RiskFactor }) {
  const sevConfig = {
    high:   { label:'높은 위험', color:COLORS.accentRed,    bg:COLORS.accentRedDim,    icon:'🔴' },
    medium: { label:'중간 위험', color:COLORS.accentOrange,  bg:COLORS.accentOrangeDim, icon:'🟡' },
    low:    { label:'낮은 위험', color:COLORS.accentGreen,   bg:COLORS.accentGreenDim,  icon:'🟢' },
  };
  const sev = sevConfig[risk.severity] ?? sevConfig.medium;
  return (
    <View style={[styles.riskCard, { borderColor: sev.color + '50', backgroundColor: sev.bg }]}>
      <View style={styles.riskCardHeader}>
        <Text style={styles.riskSeverityIcon}>{sev.icon}</Text>
        <View style={styles.riskTitleBlock}>
          <Text style={[styles.riskTitle, { color: sev.color }]}>{risk.title}</Text>
          <Text style={[styles.riskSeverityLabel, { color: sev.color + 'CC' }]}>{sev.label}</Text>
        </View>
      </View>
      <Text style={styles.riskDescription}>{risk.description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgBase },
  headerGradient: {
    paddingTop: Platform.OS === 'ios' ? 55 : 35,
    paddingBottom: SPACING.base,
    paddingHorizontal: SPACING.base,
  },
  topBar: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom: SPACING.base },
  backBtn: { flexDirection:'row', alignItems:'center', gap: SPACING.xs, padding: SPACING.xs },
  backIcon: { color: COLORS.primary, fontSize: FONTS.lg, fontWeight: FONTS.bold },
  backText: { color: COLORS.primary, fontSize: FONTS.md, fontWeight: FONTS.semibold },
  topActions: { flexDirection:'row', gap: SPACING.sm },
  iconBtn: { width:36, height:36, borderRadius:18, backgroundColor: COLORS.bgSurface, alignItems:'center', justifyContent:'center', borderWidth:1, borderColor: COLORS.borderCard },
  iconBtnActive: { backgroundColor: COLORS.primary + '30', borderColor: COLORS.primary + '60' },
  iconBtnText: { fontSize:16 },

  badgeRow: { flexDirection:'row', flexWrap:'wrap', gap: SPACING.sm, marginBottom: SPACING.sm },
  sourceBadge: { backgroundColor: COLORS.bgSurface, paddingHorizontal: SPACING.sm, paddingVertical:4, borderRadius: RADIUS.full, borderWidth:1, borderColor: COLORS.borderCard },
  sourceText: { fontSize: FONTS.xs, color: COLORS.textMuted, fontWeight: FONTS.semibold },
  impactBadge: { paddingHorizontal: SPACING.sm, paddingVertical:4, borderRadius: RADIUS.full },
  impactBadgeText: { fontSize: FONTS.xs, fontWeight: FONTS.bold },

  title: { fontSize: FONTS.xl, fontWeight: FONTS.extrabold, color: COLORS.textPrimary, lineHeight:28, marginBottom: SPACING.xs },
  originalTitle: { fontSize: FONTS.xs, color: COLORS.textMuted, lineHeight:16, marginBottom: SPACING.sm, fontStyle:'italic' },
  metaRow: { flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
  metaText: { fontSize: FONTS.xs, color: COLORS.textMuted },
  confidencePill: { flexDirection:'row', alignItems:'center', backgroundColor: COLORS.primary + '20', paddingHorizontal: SPACING.sm, paddingVertical:3, borderRadius: RADIUS.full, borderWidth:1, borderColor: COLORS.primary + '40', gap:2 },
  confidenceLabel: { fontSize:11, color: COLORS.primary, fontWeight: FONTS.semibold },

  summaryBox: { backgroundColor: COLORS.bgCard, margin: SPACING.base, marginTop:0, padding: SPACING.base, borderRadius: RADIUS.lg, borderWidth:1, borderColor: COLORS.borderCard },
  summaryLabel: { fontSize: FONTS.sm, color: COLORS.textMuted, fontWeight: FONTS.bold, marginBottom: SPACING.sm, letterSpacing:0.3 },
  summaryRow: { flexDirection:'row', gap: SPACING.sm, marginBottom: SPACING.xs, alignItems:'flex-start' },
  summaryBullet: { fontSize:14, lineHeight:20 },
  summaryText: { flex:1, fontSize: FONTS.md, color: COLORS.textSecondary, lineHeight:20 },
  readMoreBtn: { marginTop: SPACING.sm, alignSelf:'flex-end' },
  readMoreText: { fontSize: FONTS.sm, color: COLORS.primary, fontWeight: FONTS.semibold },

  tabBar: { flexDirection:'row', backgroundColor: COLORS.bgCard, marginHorizontal: SPACING.base, marginBottom: SPACING.sm, borderRadius: RADIUS.lg, padding:4, borderWidth:1, borderColor: COLORS.borderCard },
  tabItem: { flex:1, paddingVertical: SPACING.sm, alignItems:'center', borderRadius: RADIUS.md },
  tabItemActive: { backgroundColor: COLORS.primary },
  tabLabel: { fontSize: FONTS.sm, color: COLORS.textMuted, fontWeight: FONTS.semibold },
  tabLabelActive: { color: COLORS.white, fontWeight: FONTS.bold },

  scroll: { flex:1 },
  scrollContent: { paddingHorizontal: SPACING.base },
  tabContent: { paddingTop: SPACING.xs },

  sectionTitle: { fontSize: FONTS.lg, fontWeight: FONTS.bold, color: COLORS.textPrimary, marginBottom: SPACING.xs },
  sectionSubtitle: { fontSize: FONTS.sm, color: COLORS.textMuted, marginBottom: SPACING.base },

  analysisCard: { backgroundColor:'rgba(79,110,247,0.08)', borderRadius: RADIUS.lg, padding: SPACING.base, marginBottom: SPACING.xl, borderWidth:1, borderColor: COLORS.primary + '25' },
  analysisHeader: { flexDirection:'row', alignItems:'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  analysisIcon: { fontSize:20 },
  analysisTitle: { fontSize: FONTS.base, fontWeight: FONTS.bold, color: COLORS.primary },
  analysisBody: { fontSize: FONTS.md, color: COLORS.textSecondary, lineHeight:22 },

  effectRow: { flexDirection:'row', marginBottom: SPACING.sm },
  effectLine: { width:24, alignItems:'center', marginRight: SPACING.sm },
  effectDot: { width:12, height:12, borderRadius:6, marginTop:14 },
  effectConnector: { width:2, flex:1, marginTop:4 },
  effectCard: { flex:1, backgroundColor: COLORS.bgCard, borderRadius: RADIUS.md, padding: SPACING.sm, borderWidth:1 },
  effectLevelBadge: { alignSelf:'flex-start', paddingHorizontal: SPACING.sm, paddingVertical:2, borderRadius: RADIUS.full },
  effectLevelText: { fontSize:10, fontWeight: FONTS.bold },
  intensityTrack: { flex:1, height:4, backgroundColor: COLORS.bgSurface, borderRadius:2, overflow:'hidden', marginLeft: SPACING.sm },
  intensityFill: { height:'100%', borderRadius:2 },
  effectDesc: { fontSize: FONTS.sm, color: COLORS.textSecondary, lineHeight:18, marginBottom: SPACING.xs },
  indicatorChip: { backgroundColor: COLORS.bgSurface, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.sm, paddingVertical:3, alignSelf:'flex-start' },
  indicatorText: { fontSize:10, color: COLORS.textMuted },

  stockCard: { backgroundColor: COLORS.bgCard, borderRadius: RADIUS.lg, padding: SPACING.base, marginBottom: SPACING.sm, borderWidth:1, borderColor: COLORS.borderCard },
  stockCardHeader: { flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start', marginBottom: SPACING.sm },
  stockNameRow: { flexDirection:'row', alignItems:'center', gap: SPACING.sm, flex:1 },
  stockFlag: { fontSize:20 },
  stockName: { fontSize: FONTS.base, fontWeight: FONTS.bold, color: COLORS.textPrimary },
  stockTicker: { fontSize: FONTS.xs, color: COLORS.textMuted, marginTop:1 },
  relevanceBadge: { paddingHorizontal: SPACING.sm, paddingVertical:4, borderRadius: RADIUS.full },
  relevanceText: { fontSize:11, fontWeight: FONTS.bold },
  stockSector: { fontSize: FONTS.xs, color: COLORS.primary, marginBottom: SPACING.xs, fontWeight: FONTS.medium },
  stockReason: { fontSize: FONTS.sm, color: COLORS.textSecondary, lineHeight:18 },
  trendChip: { marginTop: SPACING.sm, alignSelf:'flex-start', paddingHorizontal: SPACING.sm, paddingVertical:4, borderRadius: RADIUS.sm, borderWidth:1, backgroundColor: COLORS.bgSurface },
  trendText: { fontSize:11, fontWeight: FONTS.semibold },

  riskHeader: { flexDirection:'row', alignItems:'center', gap: SPACING.base, backgroundColor: COLORS.dangerBg, borderRadius: RADIUS.lg, padding: SPACING.base, marginBottom: SPACING.base, borderWidth:1, borderColor: COLORS.danger + '40' },
  riskHeaderEmoji: { fontSize:28 },
  riskHeaderTitle: { fontSize: FONTS.lg, fontWeight: FONTS.extrabold, color: COLORS.danger },
  riskHeaderSub: { fontSize: FONTS.sm, color: COLORS.danger + 'CC' },
  riskCard: { borderRadius: RADIUS.lg, padding: SPACING.base, marginBottom: SPACING.sm, borderWidth:1 },
  riskCardHeader: { flexDirection:'row', alignItems:'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  riskSeverityIcon: { fontSize:18 },
  riskTitleBlock: { flex:1 },
  riskTitle: { fontSize: FONTS.base, fontWeight: FONTS.bold, marginBottom:2 },
  riskSeverityLabel: { fontSize: FONTS.xs, fontWeight: FONTS.medium },
  riskDescription: { fontSize: FONTS.sm, color: COLORS.textSecondary, lineHeight:18 },
});
