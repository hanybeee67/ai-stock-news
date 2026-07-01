// 📁 data/mockData.ts
// 서버 연결 실패 시 임시 표시용 데이터
// ⚠️ 이 데이터는 서버가 오프라인일 때만 표시됩니다.
// 날짜는 항상 오늘 KST 기준으로 동적 생성됩니다.

import { DailyReport } from '../types';

function getTodayKST(): string {
  const kst = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().split('T')[0];
}

// 서버 오프라인 시 표시할 임시 Mock 데이터 생성 함수
export function createMockReport(): DailyReport {
  const todayKST = getTodayKST();
  const now = new Date();

  return {
    date: todayKST,
    headline: '⚠️ 서버 연결 실패 — 실시간 AI 분석을 불러올 수 없습니다',
    marketMood: '서버 오프라인 — 당겨서 새로고침하거나 설정에서 서버 주소를 확인하세요',
    generatedAt: now.toISOString(),
    totalNewsAnalyzed: 0,
    topNews: [],
  };
}

// 하위 호환성을 위해 유지 (사용 금지 권장)
export const MOCK_DAILY_REPORT: DailyReport = createMockReport();
