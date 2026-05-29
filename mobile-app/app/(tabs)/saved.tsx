// 📁 app/(tabs)/saved.tsx
// 저장된 뉴스 화면

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Platform,
  StatusBar,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { NewsItem } from '../../types';
import { StorageService } from '../../services/storage';
import { NewsCard } from '../../components/NewsCard';
import { COLORS, FONTS, SPACING } from '../../constants/theme';

export default function SavedScreen() {
  const [saved, setSaved] = useState<NewsItem[]>([]);

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

  if (saved.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <StatusBar barStyle="light-content" />
        <Text style={styles.emptyEmoji}>🔖</Text>
        <Text style={styles.emptyTitle}>저장된 뉴스가 없어요</Text>
        <Text style={styles.emptyDesc}>
          뉴스 상세 화면에서 핀 아이콘을 눌러{'\n'}중요한 뉴스를 저장하세요
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🔖 저장된 뉴스</Text>
        <Text style={styles.headerCount}>{saved.length}개</Text>
      </View>
      <FlatList
        data={saved}
        keyExtractor={item => item.id}
        renderItem={({ item, index }) => (
          <NewsCard news={item} index={index} onPress={handlePress} />
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgBase },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: SPACING.base,
    paddingHorizontal: SPACING.base,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderCard,
  },
  headerTitle: {
    fontSize: FONTS.xxl,
    fontWeight: FONTS.extrabold,
    color: COLORS.textPrimary,
  },
  headerCount: {
    fontSize: FONTS.sm,
    color: COLORS.primary,
    fontWeight: FONTS.bold,
    backgroundColor: COLORS.primary + '20',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: 20,
  },
  list: {
    padding: SPACING.base,
    paddingBottom: SPACING.xxxl,
  },
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
