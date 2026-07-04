// 📁 app/stock/[ticker].tsx
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, StatusBar, Platform } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ApiService, StockDetail } from '../../services/api';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

export default function StockDetailScreen() {
  const { ticker, name } = useLocalSearchParams<{ ticker: string; name?: string }>();
  const [loading, setLoading] = useState(true);
  const [stock, setStock] = useState<StockDetail | null>(null);

  useEffect(() => {
    if (ticker) {
      ApiService.fetchStockDetail(ticker, name).then(data => {
        setStock(data);
        setLoading(false);
      });
    }
  }, [ticker, name]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>{ticker} 데이터 분석 중...</Text>
      </View>
    );
  }

  if (!stock) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>종목 정보를 불러올 수 없습니다.</Text>
        <TouchableOpacity style={styles.backBtnAlt} onPress={() => router.back()}>
          <Text style={styles.backBtnAltText}>돌아가기</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // 통화 기호
  const currencySymbol = stock.currency === 'KRW' ? '₩' : stock.currency === 'USD' ? '$' : stock.currency;
  
  // 시가총액 포맷팅 (조/억 또는 B/M)
  const formatMarketCap = (val: number, cur: string) => {
    if (!val) return '정보 없음';
    if (cur === 'KRW') {
      const trillion = val / 1000000000000;
      if (trillion >= 1) return `${trillion.toFixed(1)}조 원`;
      const billion = val / 100000000;
      return `${billion.toFixed(0)}억 원`;
    } else {
      const billion = val / 1000000000;
      if (billion >= 1) return `$${billion.toFixed(1)}B`;
      const million = val / 1000000;
      return `$${million.toFixed(1)}M`;
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
        
        {/* 헤더 배경 */}
        <LinearGradient colors={['#1a1f3c', '#060914']} style={styles.headerArea}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backIcon}>✕</Text>
          </TouchableOpacity>

          <View style={styles.headerContent}>
            <View style={styles.tickerBadge}>
              <Text style={styles.tickerBadgeText}>{stock.ticker}</Text>
            </View>
            <Text style={styles.stockName}>{stock.name}</Text>
            <Text style={styles.sectorText}>{stock.sector} • {stock.industry}</Text>
            
            <View style={styles.priceRow}>
              <Text style={styles.priceSymbol}>{currencySymbol}</Text>
              <Text style={styles.priceValue}>{stock.currentPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</Text>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.content}>
          
          {/* 기간별 수익률 카드 */}
          <Text style={styles.sectionTitle}>📈 기간별 추이</Text>
          <View style={styles.returnsGrid}>
            <ReturnCard label="1일" value={stock.returns['1d']} />
            <ReturnCard label="1주" value={stock.returns['1w']} />
            <ReturnCard label="1개월" value={stock.returns['1m']} />
            <ReturnCard label="1년" value={stock.returns['1y']} />
          </View>

          {/* 주요 지표 */}
          <Text style={styles.sectionTitle}>📊 주요 지표</Text>
          <View style={styles.metricsBox}>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>시가총액</Text>
              <Text style={styles.metricValue}>{formatMarketCap(stock.marketCap, stock.currency)}</Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>P/E Ratio (PER)</Text>
              <Text style={styles.metricValue}>{stock.peRatio ? stock.peRatio.toFixed(2) : 'N/A'}</Text>
            </View>
          </View>

          {/* 비즈니스 요약 */}
          <Text style={styles.sectionTitle}>🏢 기업 개요</Text>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryText}>{stock.summary}</Text>
          </View>

          <View style={{ height: SPACING.xxxl }} />
        </View>
      </ScrollView>
    </View>
  );
}

function ReturnCard({ label, value }: { label: string, value: number }) {
  if (value === undefined || value === null || isNaN(value)) {
    return (
      <View style={styles.returnCard}>
        <Text style={styles.returnLabel}>{label}</Text>
        <Text style={[styles.returnValue, { color: COLORS.textMuted }]}>-</Text>
      </View>
    );
  }

  const isUp = value > 0;
  const isDown = value < 0;
  const color = isUp ? COLORS.accentGreen : isDown ? COLORS.accentRed : COLORS.textMuted;
  const prefix = isUp ? '▲' : isDown ? '▼' : '-';

  return (
    <View style={[styles.returnCard, { backgroundColor: color + '15', borderColor: color + '30' }]}>
      <Text style={styles.returnLabel}>{label}</Text>
      <Text style={[styles.returnValue, { color }]}>
        {prefix} {Math.abs(value).toFixed(2)}%
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgBase },
  loadingContainer: { flex: 1, backgroundColor: COLORS.bgBase, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: SPACING.base, color: COLORS.primary, fontSize: FONTS.md, fontWeight: FONTS.semibold },
  errorText: { color: COLORS.textMuted, fontSize: FONTS.md, marginBottom: SPACING.base },
  backBtnAlt: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, backgroundColor: COLORS.bgSurface, borderRadius: RADIUS.md },
  backBtnAltText: { color: COLORS.white, fontWeight: FONTS.bold },

  headerArea: {
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: SPACING.base,
    paddingBottom: SPACING.xl,
    borderBottomLeftRadius: RADIUS.xl,
    borderBottomRightRadius: RADIUS.xl,
  },
  backBtn: {
    alignSelf: 'flex-end',
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center', alignItems: 'center',
  },
  backIcon: { color: COLORS.white, fontSize: 18, fontWeight: 'bold' },
  headerContent: { marginTop: SPACING.sm },
  tickerBadge: { alignSelf: 'flex-start', backgroundColor: COLORS.primary + '30', paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: RADIUS.sm, marginBottom: SPACING.sm },
  tickerBadgeText: { color: COLORS.primary, fontWeight: FONTS.bold, fontSize: FONTS.sm },
  stockName: { color: COLORS.white, fontSize: 28, fontWeight: FONTS.extrabold, marginBottom: 4 },
  sectorText: { color: COLORS.textMuted, fontSize: FONTS.sm, marginBottom: SPACING.base },
  
  priceRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  priceSymbol: { color: COLORS.textSecondary, fontSize: FONTS.lg, marginBottom: 4 },
  priceValue: { color: COLORS.white, fontSize: 36, fontWeight: FONTS.extrabold },

  content: { padding: SPACING.base },
  sectionTitle: { color: COLORS.textPrimary, fontSize: FONTS.lg, fontWeight: FONTS.bold, marginTop: SPACING.lg, marginBottom: SPACING.sm },
  
  returnsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  returnCard: { flex: 1, minWidth: '45%', padding: SPACING.base, borderRadius: RADIUS.lg, borderWidth: 1, alignItems: 'center' },
  returnLabel: { color: COLORS.textMuted, fontSize: FONTS.xs, marginBottom: 4 },
  returnValue: { fontSize: FONTS.lg, fontWeight: FONTS.bold },

  metricsBox: { backgroundColor: COLORS.bgCard, borderRadius: RADIUS.lg, padding: SPACING.base, borderWidth: 1, borderColor: COLORS.borderCard },
  metricRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: SPACING.xs },
  metricLabel: { color: COLORS.textMuted, fontSize: FONTS.sm },
  metricValue: { color: COLORS.textSecondary, fontSize: FONTS.sm, fontWeight: FONTS.bold },

  summaryBox: { backgroundColor: COLORS.bgCard, borderRadius: RADIUS.lg, padding: SPACING.base, borderWidth: 1, borderColor: COLORS.borderCard },
  summaryText: { color: COLORS.textSecondary, fontSize: FONTS.sm, lineHeight: 22 },
});
