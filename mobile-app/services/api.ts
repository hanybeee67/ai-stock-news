// 📁 services/api.ts
// 백엔드 API 연동 서비스 (Python FastAPI 서버 통신)

import axios, { AxiosInstance } from 'axios';
import { ApiResponse, DailyReport, AppSettings } from '../types';
import { StorageService } from './storage';

// ─── Mock 데이터 (백엔드 없을 때 개발/데모용) ──────────────────────
import { MOCK_DAILY_REPORT } from '../data/mockData';

let _client: AxiosInstance | null = null;

async function getClient(): Promise<AxiosInstance> {
  if (_client) return _client;
  const settings = await StorageService.getSettings();
  _client = axios.create({
    baseURL: settings.apiEndpoint,
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  });

  // 요청 인터셉터 - 로깅
  _client.interceptors.request.use(req => {
    console.log(`[API] → ${req.method?.toUpperCase()} ${req.url}`);
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

export const ApiService = {

  /** API 클라이언트 재초기화 (엔드포인트 변경 시) */
  resetClient() {
    _client = null;
  },

  /**
   * 오늘의 AI 분석 리포트 가져오기
   * - 먼저 로컬 캐시 확인
   * - 없거나 오래됐으면 서버에서 새로 가져옴
   * - 서버 불가 시 Mock 데이터 반환
   */
  async fetchDailyReport(forceRefresh = false): Promise<DailyReport> {
    const today = new Date().toISOString().split('T')[0];

    // 1. 캐시 확인
    if (!forceRefresh) {
      const cached = await StorageService.getTodayReport();
      if (cached) {
        console.log('[API] ✓ 캐시된 리포트 사용:', cached.date);
        return cached;
      }
    }

    // 2. 서버에서 가져오기 시도
    try {
      const client = await getClient();
      const res = await client.get<ApiResponse<DailyReport>>('/api/daily-report');
      if (res.data.success && res.data.data) {
        const report = res.data.data;
        await StorageService.saveDailyReport(report);
        console.log('[API] ✓ 서버에서 새 리포트 수신:', report.date);
        return report;
      }
    } catch (err) {
      console.warn('[API] ⚠ 서버 연결 실패, Mock 데이터 사용');
    }

    // 3. Fallback: Mock 데이터
    const mockReport = { ...MOCK_DAILY_REPORT, date: today };
    await StorageService.saveDailyReport(mockReport);
    return mockReport;
  },

  /** 서버 헬스 체크 */
  async checkHealth(): Promise<boolean> {
    try {
      const client = await getClient();
      const res = await client.get('/health', { timeout: 5000 });
      return res.status === 200;
    } catch {
      return false;
    }
  },

  /** 수동으로 AI 분석 트리거 (서버에 분석 요청) */
  async triggerAnalysis(): Promise<boolean> {
    try {
      const client = await getClient();
      await client.post('/api/trigger-analysis');
      return true;
    } catch {
      return false;
    }
  },
};
