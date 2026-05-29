# 나만의 AI 글로벌 증시 뉴스 앱 — 개발 가이드

> **AI 기반 1인 전용 글로벌 증시 뉴스 & 숨은 수혜주 분석 모바일 앱**  
> Python (FastAPI) 백엔드 + React Native (Expo) 모바일 앱

---

## 🏗️ 프로젝트 구조

```
stock management/
├── backend/                    ← Python FastAPI 서버
│   ├── main.py                 ← API 서버 + 스케줄러
│   ├── news_collector.py       ← RSS 뉴스 수집기 (15개 글로벌 소스)
│   ├── ai_analyzer.py          ← Claude AI 심층 분석 엔진
│   ├── requirements.txt        ← Python 패키지 목록
│   ├── .env.example            ← 환경변수 템플릿
│   └── start_server.bat        ← 서버 실행 스크립트
│
└── mobile-app/                 ← React Native (Expo) 앱
    ├── app/
    │   ├── _layout.tsx         ← 루트 레이아웃 (알림 초기화)
    │   ├── (tabs)/
    │   │   ├── index.tsx       ← 대시보드 (오늘 브리핑)
    │   │   ├── saved.tsx       ← 저장된 뉴스
    │   │   └── settings.tsx    ← 설정 화면
    │   └── news/[id].tsx       ← 뉴스 상세 (AI 분석 + 수혜주)
    ├── components/
    │   ├── NewsCard.tsx         ← 뉴스 카드 컴포넌트
    │   └── ui/
    │       ├── ImportanceBadge.tsx  ← 불꽃 중요도 배지
    │       └── CategoryTag.tsx      ← 카테고리 태그
    ├── services/
    │   ├── api.ts              ← 백엔드 API 통신
    │   ├── storage.ts          ← 로컬 저장소 (AsyncStorage)
    │   └── notifications.ts    ← 로컬 푸시 알림
    ├── constants/theme.ts      ← 디자인 시스템
    ├── types/index.ts          ← TypeScript 타입 정의
    └── data/mockData.ts        ← 개발용 Mock 데이터
```

---

## 🚀 빠른 시작

### Step 1 — Python 백엔드 설정

```powershell
# 1. backend 폴더로 이동
cd "c:\stock management\backend"

# 2. 환경변수 파일 생성
copy .env.example .env

# 3. .env 파일을 열어 Claude API 키 입력
notepad .env
#  → ANTHROPIC_API_KEY=sk-ant-api03-xxxxx

# 4. 서버 실행 (자동으로 가상환경 + 패키지 설치)
start_server.bat
```

### Step 2 — 모바일 앱 설정

```powershell
# mobile-app 폴더로 이동
cd "c:\stock management\mobile-app"

# 패키지 설치
npm install

# Expo 개발 서버 시작
npx expo start
```

그 후:
- **Android**: 스마트폰에 **Expo Go** 앱 설치 → QR코드 스캔
- **iOS**: 카메라로 QR코드 스캔

---

## 📱 앱 화면 구성

| 화면 | 기능 |
|------|------|
| **대시보드** | 오늘의 AI 한 줄 요약 + 뉴스 카드 3~5개 |
| **뉴스 상세** | 3줄 요약 → AI 분석 탭 → 수혜주 탭 → 리스크 탭 |
| **저장됨** | 북마크한 뉴스 목록 |
| **설정** | 알림 시간 · 카테고리 필터 · API 주소 |

---

## 🤖 AI 분석 파이프라인

```
매일 오전 5:30 KST
      │
      ▼
📡 RSS 수집 (15개 소스, ~60개 뉴스, 비동기 병렬)
      │
      ▼
🔍 중요도 사전 필터링 (키워드 스코어링)
      │
      ▼
🤖 Claude API 호출 (3가지 절대 원칙 적용)
  ① 필터링 법칙 — 시황 제외, 판도 변화 뉴스만
  ② 나비효과 분석 — 1차→2차→3차 파급 추론
  ③ 수혜주 + 리스크 쌍 도출
      │
      ▼
💾 JSON 파일 저장 (backend/data/reports/)
      │
      ▼
📲 모바일 앱 GET /api/daily-report → 화면 표시
      │
      ▼
🔔 오전 8시 로컬 푸시 알림 (외부 서버 불필요)
```

---

## 🔔 로컬 푸시 알림 구조

외부 푸시 서버(FCM, APNs 백엔드) 없이, **스마트폰 자체 스케줄링**으로 구현합니다.

```typescript
// 매일 오전 8시 로컬 알림 등록
await NotificationService.scheduleDailyNotification(8, 0);
// → expo-notifications의 반복 트리거 사용
// → 앱이 백그라운드에 있어도 자동 발송
```

**알림 시간 변경**: 설정 화면에서 시간 프리셋 선택 → 즉시 재등록

---

## 💰 API 비용 추정

| 모델 | 1일 예상 토큰 | 월 비용 (예상) |
|------|--------------|---------------|
| claude-3-5-sonnet | 입력 ~15K + 출력 ~4K | **약 $4~6/월** |
| claude-opus | 입력 ~15K + 출력 ~4K | ~$30~45/월 |

> 💡 `claude-3-5-sonnet-20241022`를 추천합니다. 빠르고 정확하며 비용 효율적입니다.

---

## 🛠️ 스마트폰에서 백엔드 연결하기

스마트폰과 PC가 **같은 Wi-Fi**에 연결된 상태에서:

```powershell
# PC의 로컬 IP 확인
ipconfig
# → 예: 192.168.1.100

# 앱 설정 화면에서 API 주소를 입력:
# http://192.168.1.100:8000
```

---

## 📋 개발 로드맵

- [x] 뉴스 카드 대시보드 UI
- [x] AI 나비효과 상세 분석 화면
- [x] 수혜주 맵 & 리스크 경고
- [x] 로컬 푸시 알림 (외부 서버 불필요)
- [x] 관심 카테고리 필터
- [x] 뉴스 북마크 저장
- [ ] 위젯 지원 (iOS/Android)
- [ ] 다크/라이트 테마 전환
- [ ] 수혜주 가격 실시간 연동 (Yahoo Finance API)
- [ ] 과거 뉴스 → 실제 수혜주 성과 트래킹

---

## ⚠️ 중요 주의사항

> **이 앱은 정보 제공 목적으로만 사용하세요.**  
> AI 분석 결과는 투자 조언이 아니며, 모든 투자 결정의 책임은 본인에게 있습니다.  
> 특히 "주린이 방어벽" 섹션의 리스크 경고를 반드시 숙지하세요.
