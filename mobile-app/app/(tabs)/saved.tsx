// 📁 app/(tabs)/saved.tsx
// 저장된 뉴스 화면 — v2.0: 삭제 UX (롱프레스), 카테고리 필터, 날짜 섹션 분리

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Platform,
  StatusBar,
  Alert,
  ScrollView,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { NewsItem } from '../../types';
import { StorageService } from '../../services/storage';
import { NewsCard } from '../../components/NewsCard';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

// 카테고리 필터 옵션 (동적으로 저장된 뉴스에서 추출)
function extractCategories(news: NewsItem[]): string[] {
  const cats = new Set(news.map(n => n.category).filter(Boolean));
  return ['전체', ...Array.from(cats)];
}

// 날짜 기준으로 섹션 분리
function groupByDate(news: NewsItem[]): { today: NewsItem[]; older: NewsItem[] } {
  const todayStr = new Date().toISOString().split('T')[0];
  const today: NewsItem[] = [];
  const older: NewsItem[] = [];

  for (const n of news) {
    const pub = n.publishedAt?.split('T')[0] ?? '';
    if (pub === todayStr) {
      today.push(n);
    } else {
      older.push(n);
    }
  }

  return { today, older };
}

export default function SavedScreen() {
  const [saved, setSaved] = useState<NewsItem[]>([]);
  const [selectedCat, setSelectedCat] = useState<string>('전체');

  useFocusEffect(
    useCallback(() => {
      StorageService.getSavedNews().then(setSaved);
    }, [])
  );

  const handlePress = (news: NewsItem) => {
    router.push({
      pathname: '/news/[id]',
      params: { id: news.id, data: JSON.stringify(news) },
    });
  };

  // ── 롱프레스로 삭제 ───────────────────────────────────────────────
  const handleLongPress = (news: NewsItem) => {
    Alert.alert(
      '북마크 삭제',
      `"${news.titleKo}"를 저장 목록에서 제거할까요?`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            await StorageService.removeSavedNews(news.id);
            setSaved(prev => prev.filter(n => n.id !== news.id));
          },
        },
      ]
    );
  };

  // ── 카테고리 필터링 ───────────────────────────────────────────────
  const categories = extractCategories(saved);
  const filtered = selectedCat === '전체'
    ? saved
    : saved.filter(n => n.category === selectedCat);

  const { today, older } = groupByDate(filtered);

  // ── 빈 상태 ──────────────────────────────────────────────────────
  if (saved.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <StatusBar barStyle="light-content" />
        <Text style={styles.emptyEmoji}>🔖</Text>
        <Text style={styles.emptyTitle}>저장된 뉴스가 없어요</Text>
        <Text style={styles.emptyDesc}>
          뉴스 상세 화면에서 핀 아이콘을 눌러{'\n'}중요한 뉴스를 저장하세요
        </Text>
        <Text style={styles.emptyHint}>💡 길게 누르면 삭제할 수 있어요</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* ── 헤더 ── */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>🔖 저장된 뉴스</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{filtered.length}개</Text>
          </View>
        </View>
        <Text style={styles.headerHint}>길게 눌러 삭제</Text>
      </View>

      {/* ── 카테고리 필터 ── */}
      {categories.length > 2 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.catFilter}
        >
          {categories.map(cat => (
            <TouchableOpacity
              key={cat}
              style={[styles.catChip, selectedCat === cat && styles.catChipActive]}
              onPress={() => setSelectedCat(cat)}
            >
              <Text style={[styles.catChipText, selectedCat === cat && styles.catChipTextActive]}>
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <FlatList
        data={[]} // FlatList는 헤더/섹션 렌더링용, 실제 데이터는 ListHeaderComponent에서
        keyExtractor={() => 'header'}
        renderItem={null}
        ListHeaderComponent={
          <>
            {/* ── 오늘 섹션 ── */}
            {today.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>🌅 오늘 저장</Text>
                  <Text style={styles.sectionCount}>{today.length}개</Text>
                </View>
                {today.map((news, idx) => (
                  <SavedNewsCard
                    key={news.id}
                    news={news}
                    index={idx}
                    onPress={handlePress}
                    onLongPress={handleLongPress}
                  />
                ))}
              </View>
            )}

            {/* ── 이전 섹션 ── */}
            {older.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>📂 이전 저장</Text>
                  <Text style={styles.sectionCount}>{older.length}개</Text>
                </View>
                {older.map((news, idx) => (
                  <SavedNewsCard
                    key={news.id}
                    news={news}
                    index={idx}
                    onPress={handlePress}
                    onLongPress={handleLongPress}
                  />
                ))}
              </View>
            )}

            {/* 필터 결과 없음 */}
            {filtered.length === 0 && (
              <View style={styles.emptyFilter}>
                <Text style={styles.emptyFilterText}>
                  "{selectedCat}" 카테고리에 저장된 뉴스가 없어요
                </Text>
                <TouchableOpacity onPress={() => setSelectedCat('전체')}>
                  <Text style={styles.clearFilterText}>전체 보기</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        }
        ListFooterComponent={<View style={{ height: SPACING.xxxl }} />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

// ── 저장 뉴스 카드 (롱프레스 지원) ─────────────────────────────────
function SavedNewsCard({
  news,
  index,
  onPress,
  onLongPress,
}: {
  news: NewsItem;
  index: number;
  onPress: (news: NewsItem) => void;
  onLongPress: (news: NewsItem) => void;
}) {
  return (
    <View style={savedCardStyles.wrapper}>
      <NewsCard news={news} index={index} onPress={onPress} />
      {/* 롱프레스 오버레이 */}
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        onPress={() => onPress(news)}
        onLongPress={() => onLongPress(news)}
        delayLongPress={500}
        activeOpacity={1}
      />
      {/* 삭제 힌트 뱃지 */}
      <View style={savedCardStyles.deleteBadge}>
        <Text style={savedCardStyles.deleteBadgeText}>꾹 눌러 삭제</Text>
      </View>
    </View>
  );
}

const savedCardStyles = StyleSheet.create({
  wrapper: { position: 'relative', marginBottom: SPACING.md },
  deleteBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: COLORS.bgSurface,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    opacity: 0.5,
  },
  deleteBadgeText: {
    fontSize: 9,
    color: COLORS.textMuted,
  },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgBase },

  // ── 헤더 ──────────────────────────────────────────────────────────
  header: {
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: SPACING.sm,
    paddingHorizontal: SPACING.base,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderCard,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: FONTS.xxl,
    fontWeight: FONTS.extrabold,
    color: COLORS.textPrimary,
  },
  countBadge: {
    backgroundColor: COLORS.primary + '20',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: 20,
  },
  countText: {
    fontSize: FONTS.sm,
    color: COLORS.primary,
    fontWeight: FONTS.bold,
  },
  headerHint: {
    fontSize: FONTS.xs,
    color: COLORS.textMuted,
    marginTop: 3,
  },

  // ── 카테고리 필터 ─────────────────────────────────────────────────
  catFilter: {
    paddingHorizontal: SPACING.base,
    paddingVertical: SPACING.sm,
    gap: SPACING.xs,
  },
  catChip: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.borderCard,
  },
  catChipActive: {
    backgroundColor: COLORS.primary + '20',
    borderColor: COLORS.primary + '60',
  },
  catChipText: { fontSize: FONTS.sm, color: COLORS.textMuted, fontWeight: FONTS.medium },
  catChipTextActive: { color: COLORS.primary, fontWeight: FONTS.bold },

  // ── 섹션 ──────────────────────────────────────────────────────────
  listContent: { paddingHorizontal: SPACING.base },
  section: { marginTop: SPACING.base },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  sectionTitle: {
    fontSize: FONTS.base,
    fontWeight: FONTS.bold,
    color: COLORS.textSecondary,
  },
  sectionCount: {
    fontSize: FONTS.sm,
    color: COLORS.textMuted,
  },

  // ── 필터 빈 상태 ──────────────────────────────────────────────────
  emptyFilter: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
    gap: SPACING.sm,
  },
  emptyFilterText: {
    fontSize: FONTS.sm,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  clearFilterText: {
    fontSize: FONTS.sm,
    color: COLORS.primary,
    fontWeight: FONTS.semibold,
    textDecorationLine: 'underline',
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
    marginBottom: SPACING.sm,
  },
  emptyHint: {
    fontSize: FONTS.sm,
    color: COLORS.textMuted,
    backgroundColor: COLORS.bgCard,
    paddingHorizontal: SPACING.base,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
  },
});
