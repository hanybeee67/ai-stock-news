// 📁 services/api.ts
// 백엔드 API 연동 서비스 (Python FastAPI 서버 통신)
// v2.0: 환경변수화, 신규 엔드포인트 추가, 폴링 지원

import axios, { AxiosInstance } from 'axios';
import Constants from 'expo-constants';
import { ApiResponse, DailyReport, AppSettings } from '../types';
import { StorageService } from './storage';

// ─── Mock 데이터 (백엔드 없을 때 개발/데모용) ──────────────────────
import { MOCK_DAILY_REPORT } from '../data/mockData';

// ✅ 환경변수에서 URL 가져오기 (app.json extra.apiUrl → 하드코딩 폴백)
const BACKEND_URL: string =
  (Constants.expoConfig?.extra?.apiUrl as string) ||
  'https://ai-stock-news-f15l.onrender.com';

let _client: AxiosInstance | null = null;

async function getClient(): Promise<AxiosInstance> {
  if (_client) return _client;

  _client = axios.create({
    baseURL: BACKEND_URL,
    timeout: 60000,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  });

  // 요청 인터셉터 - 로깅
  _client.interceptors.request.use(req => {
    console.log(`[API] → ${req.method?.toUpperCase()} ${req.baseURL}${req.url}`);
    return req;
  });

  // 응답 인터셉터 - 에러 처리
  _client.interceptors.response.use(
    res => res,
    async err => {
      console.error('[API] ✗ Error:', err.message);
      throw err;
    }
  );

  return _client;
}

// ─── 서버 상태 타입 ─────────────────────────────────────────────────
export interface ServerStatus {
  serverVersion: string;
  analyzerReady: boolean;
  isAnalyzing: boolean;
  analysisProgress: string;
  analysisStartedAt: string | null;
  lastError: string | null;
  todayReportReady: boolean;
  todayReportGeneratedAt: string | null;
  nextScheduledAt: string | null;
  availableReportDates: string[];
  scheduledJobCount: number;
}

export interface StockDetail {
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  summary: string;
  marketCap: number;
  peRatio: number | null;
  currency: string;
  currentPrice: number;
  returns: {
    '1d': number;
    '1w': number;
    '1m': number;
    '1y': number;
  };
}

// ─── 히스토리 아이템 타입 ─────────────────────────────────────────────
export interface HistoryItem {
  date: string;
  headline: string;
  marketMood: string;
  newsCount: number;
  generatedAt: string;
  avgConfidence: number;
  topCategories: string[];
  dominantImpact: 'bullish' | 'bearish' | 'neutral';
}

export const ApiService = {

  resetClient() {
    _client = null;
  },

  getBackendUrl(): string {
    return BACKEND_URL;
  },

  // ─── 오늘 리포트 가져오기 ────────────────────────────────────────
  async fetchDailyReport(forceRefresh = false): Promise<DailyReport> {
    // 1. 서버에서 직접 가져오기 (오늘 브리핑은 항상 서버를 먼저 확인)
    try {
      const client = await getClient();
      const res = await client.get<ApiResponse<DailyReport>>('/api/daily-report');
      if (res.data.success && res.data.data) {
        const report = res.data.data;
        await StorageService.saveDailyReport(report);
        console.log('[API] ✓ 서버에서 새 리포트 수신:', report.date);
        return report;
      }
    } catch (err: any) {
      // 202: 분석 진행 중 (특별 처리)
      if (err?.response?.status === 202) {
        console.log('[API] ⏳ 분석 진행 중...');
        throw new Error('analyzing');
      }
      console.warn('[API] ⚠ 서버 연결 실패:', err?.message);
    }

    // 2. 서버 실패 시 로컈 캐시 폴백 (오프라인 대비)
    if (!forceRefresh) {
      const cached = await StorageService.getTodayReport();
      if (cached) {
        console.log('[API] ⚠ 서버 실패 → 컨캐시 폴백:', cached.date);
        return cached;
      }
    }

    // 3. Fallback: Mock 데이터 (컨캐시 오염 방지를 위해 저장하지 않음)
    const kstNow = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
    const todayKST = kstNow.toISOString().split('T')[0];
    const mockReport = { ...MOCK_DAILY_REPORT, date: todayKST };
    return mockReport;
  },

  // ─── 특정 날짜 리포트 ─────────────────────────────────────────────
  async fetchReportByDate(date: string): Promise<DailyReport | null> {
    // 1. 로컬 캐시 확인
    const cached = await StorageService.getReportByDate(date);
    if (cached) return cached;

    // 2. 서버에서 가져오기
    try {
      const client = await getClient();
      const res = await client.get<ApiResponse<DailyReport>>(`/api/daily-report/${date}`);
      if (res.data.success && res.data.data) {
        const report = res.data.data;
        await StorageService.saveDailyReport(report);
        return report;
      }
    } catch {
      return null;
    }
    return null;
  },

  // ─── 특정 종목 상세정보 ─────────────────────────────────────────────
  async fetchStockDetail(ticker: string): Promise<StockDetail | null> {
    try {
      const client = await getClient();
      const res = await client.get<ApiResponse<StockDetail>>(`/api/stock/${ticker}`);
      if (res.data.success && res.data.data) {
        return res.data.data;
      }
    } catch (err) {
      console.warn(`[API] ⚠ 종목 상세정보 조회 실패 (${ticker}):`, err);
    }
    return null;
  },

  // ─── 서버 헬스 체크 ──────────────────────────────────────────────
  async checkHealth(): Promise<boolean> {
    try {
      const client = await getClient();
      const res = await client.get('/health', { timeout: 5000 });
      return res.status === 200;
    } catch {
      return false;
    }
  },

  // ─── 상세 서버 상태 ──────────────────────────────────────────────
  async fetchStatus(): Promise<ServerStatus | null> {
    try {
      const client = await getClient();
      const res = await client.get<ApiResponse<ServerStatus>>('/api/status', { timeout: 8000 });
      return res.data.success ? res.data.data : null;
    } catch {
      return null;
    }
  },

  // ─── 수동 분석 트리거 ─────────────────────────────────────────────
  async triggerAnalysis(): Promise<{ success: boolean; message: string }> {
    try {
      const client = await getClient();
      const res = await client.post('/api/trigger-analysis');
      return res.data;
    } catch {
      return { success: false, message: '서버 연결 실패' };
    }
  },

  // ─── 히스토리 목록 ────────────────────────────────────────────────
  async fetchHistory(): Promise<HistoryItem[]> {
    try {
      const client = await getClient();
      const res = await client.get<ApiResponse<HistoryItem[]>>('/api/reports/history');
      if (res.data.success && res.data.data) {
        return res.data.data;
      }
    } catch {
      console.warn('[API] ⚠ 히스토리 조회 실패');
    }
    return [];
  },

  // ─── 분석 완료까지 폴링 ──────────────────────────────────────────
  async pollUntilReady(
    onProgress?: (msg: string) => void,
    maxWaitSeconds = 180,
    intervalSeconds = 5,
  ): Promise<DailyReport | null> {
    const start = Date.now();
    while ((Date.now() - start) / 1000 < maxWaitSeconds) {
      try {
        const status = await ApiService.fetchStatus();
        if (status?.analysisProgress) {
          onProgress?.(status.analysisProgress);
        }
        if (status?.todayReportReady) {
          return await ApiService.fetchDailyReport(true);
        }
      } catch {
        // 폴링 중 오류는 무시하고 계속
      }
      await new Promise(resolve => setTimeout(resolve, intervalSeconds * 1000));
    }
    return null;
  },

  // ─── 종목 상세 조회 (백엔드 캐시 활용) ──────────────────────────────
  async fetchStockDetail(ticker: string): Promise<any> {
    try {
      const client = await getClient();
      const res = await client.get(`/api/stock/${ticker}`);
      return res.data?.data ?? null;
    } catch (e) {
      console.warn(`[API] ⚠ 종목 상세 조회 실패: ${ticker}`);
      return null;
    }
  },
};
