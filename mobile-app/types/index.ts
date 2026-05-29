// 📁 types/index.ts
// 앱 전체 공통 TypeScript 타입 정의

export interface BeneficiaryStock {
  name: string;           // 기업명 (예: "삼성SDI")
  ticker: string;         // 티커 (예: "006400.KS")
  market: 'KRX' | 'NYSE' | 'NASDAQ' | 'TSE'; // 상장 시장
  relevance: 'high' | 'medium' | 'low';       // 연관성 등급
  reason: string;         // 핵심 수혜 이유 (2~3줄)
  sector: string;         // 섹터 분류
  recentTrend?: string;   // 최근 주가 동향 (예: 현재가 $120 (최근 5일 +3.2%))
}

export interface RiskFactor {
  title: string;          // 위험 요소 제목
  description: string;    // 상세 설명
  severity: 'high' | 'medium' | 'low';
}

export interface ButterflyEffect {
  level: number;          // 1차, 2차, 3차 파급
  description: string;    // 해당 단계 파급 설명
  indicator?: string;     // 관련 경제 지표
}

export interface NewsItem {
  id: string;
  title: string;                    // 원문 뉴스 제목
  titleKo: string;                  // 한국어 번역 제목
  summary: string;                  // 3줄 요약 (초보자용)
  aiAnalysis: string;               // AI 돋보기 분석 (숨은 의미)
  category: string;                 // 카테고리 태그
  publishedAt: string;              // 원문 발행 시각 (ISO8601)
  source: string;                   // 출처 (Reuters, Bloomberg 등)
  sourceUrl: string;                // 원문 URL
  importance: 1 | 2 | 3 | 4 | 5;   // 중요도 (불꽃 아이콘 수)
  marketImpact: 'bullish' | 'bearish' | 'neutral'; // 시장 방향성
  butterflyEffects: ButterflyEffect[]; // 나비효과 단계별 분석
  beneficiaryStocks: BeneficiaryStock[]; // 수혜주 목록
  riskFactors: RiskFactor[];           // 리스크 팩터 목록
  aiConfidence: number;                // AI 분석 신뢰도 (0~100)
  tags: string[];                      // 검색/필터용 추가 태그
}

export interface DailyReport {
  date: string;           // YYYY-MM-DD
  headline: string;       // 오늘의 한 줄 핵심 요약 키워드
  marketMood: string;     // 전반적 시장 분위기 (예: "리스크 오프 국면")
  topNews: NewsItem[];    // 선별된 3~5개 뉴스
  generatedAt: string;    // AI 분석 완료 시각 (ISO8601)
  totalNewsAnalyzed: number; // 분석한 전체 뉴스 수
}

export interface AppSettings {
  notificationTime: string;    // "HH:MM" 형식 (기본 "08:00")
  notificationsEnabled: boolean;
  selectedCategories: string[]; // 관심 카테고리 목록
  apiEndpoint: string;          // 백엔드 API 주소
  lastFetchedAt: string | null; // 마지막 데이터 갱신 시각
  onboardingCompleted: boolean;
  themeMode: 'dark' | 'light';  // 현재는 dark만 지원
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  timestamp: string;
}
