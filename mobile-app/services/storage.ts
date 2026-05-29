// 📁 services/storage.ts
// 로컬 디바이스 스토리지 서비스 (AsyncStorage 기반)
// SQLite 수준의 구조화된 데이터 관리를 AsyncStorage로 구현

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppSettings, DailyReport, NewsItem } from '../types';

// ─── Storage Keys ─────────────────────────────────────────────────
const KEYS = {
  SETTINGS: '@aistocknews:settings',
  DAILY_REPORT: (date: string) => `@aistocknews:report:${date}`,
  REPORT_INDEX: '@aistocknews:report_index',
  CACHED_NEWS: '@aistocknews:news_cache',
  SAVED_NEWS: '@aistocknews:saved_news',
} as const;

// ─── 기본 앱 설정값 ────────────────────────────────────────────────
export const DEFAULT_SETTINGS: AppSettings = {
  notificationTime: '08:00',
  notificationsEnabled: true,
  selectedCategories: ['반도체', '바이오', '2차전지', '매크로', '에너지'],
  apiEndpoint: 'http://localhost:8000',
  lastFetchedAt: null,
  onboardingCompleted: false,
  themeMode: 'dark',
};

// ─── Settings 관련 ─────────────────────────────────────────────────
export const StorageService = {

  /** 설정 불러오기 */
  async getSettings(): Promise<AppSettings> {
    try {
      const raw = await AsyncStorage.getItem(KEYS.SETTINGS);
      if (!raw) return DEFAULT_SETTINGS;
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {
      return DEFAULT_SETTINGS;
    }
  },

  /** 설정 저장 (부분 업데이트 지원) */
  async saveSettings(partial: Partial<AppSettings>): Promise<void> {
    const current = await StorageService.getSettings();
    const merged = { ...current, ...partial };
    await AsyncStorage.setItem(KEYS.SETTINGS, JSON.stringify(merged));
  },

  /** 특정 날짜의 데일리 리포트 저장 */
  async saveDailyReport(report: DailyReport): Promise<void> {
    const key = KEYS.DAILY_REPORT(report.date);
    await AsyncStorage.setItem(key, JSON.stringify(report));

    // 인덱스에도 날짜 기록 (최근 7일치 유지)
    const index = await StorageService.getReportIndex();
    const updated = [report.date, ...index.filter(d => d !== report.date)].slice(0, 7);
    await AsyncStorage.setItem(KEYS.REPORT_INDEX, JSON.stringify(updated));

    // 마지막 갱신 시각 업데이트
    await StorageService.saveSettings({ lastFetchedAt: new Date().toISOString() });
  },

  /** 오늘의 리포트 불러오기 */
  async getTodayReport(): Promise<DailyReport | null> {
    const today = new Date().toISOString().split('T')[0];
    return StorageService.getReportByDate(today);
  },

  /** 특정 날짜 리포트 불러오기 */
  async getReportByDate(date: string): Promise<DailyReport | null> {
    try {
      const raw = await AsyncStorage.getItem(KEYS.DAILY_REPORT(date));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  /** 저장된 날짜 목록 (최근 7일) */
  async getReportIndex(): Promise<string[]> {
    try {
      const raw = await AsyncStorage.getItem(KEYS.REPORT_INDEX);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  /** 뉴스 북마크 저장 */
  async saveNewsItem(news: NewsItem): Promise<void> {
    const saved = await StorageService.getSavedNews();
    const exists = saved.find(n => n.id === news.id);
    if (!exists) {
      saved.unshift(news);
      await AsyncStorage.setItem(KEYS.SAVED_NEWS, JSON.stringify(saved.slice(0, 50)));
    }
  },

  /** 북마크된 뉴스 불러오기 */
  async getSavedNews(): Promise<NewsItem[]> {
    try {
      const raw = await AsyncStorage.getItem(KEYS.SAVED_NEWS);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  /** 북마크 삭제 */
  async removeSavedNews(newsId: string): Promise<void> {
    const saved = await StorageService.getSavedNews();
    const filtered = saved.filter(n => n.id !== newsId);
    await AsyncStorage.setItem(KEYS.SAVED_NEWS, JSON.stringify(filtered));
  },

  /** 모든 데이터 초기화 (개발/디버그용) */
  async clearAll(): Promise<void> {
    const keys = await AsyncStorage.getAllKeys();
    const appKeys = keys.filter(k => k.startsWith('@aistocknews:'));
    await AsyncStorage.multiRemove(appKeys);
  },
};
