"""
📁 backend/ai_analyzer.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Claude AI 뉴스 심층 분석 엔진

핵심 기능:
1. [필터링 법칙] 단순 시황 제외, 판도 변화 뉴스 선별
2. [나비효과 분석] 1차→2차→3차 파급효과 추론
3. [수혜주 매칭] 논리적 근거 + 관련 종목 도출
4. [리스크 쌍 도출] 진입 시 주의사항 반드시 병기
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

import json
import os
from datetime import datetime, timezone
from typing import List, Dict, Any
from loguru import logger
import anthropic
import yfinance as yf

# ─── Claude 시스템 프롬프트 ────────────────────────────────────────────
SYSTEM_PROMPT = """# 당신은 누구인가

당신의 이름은 **찰리(Charlie)**입니다.
골드만삭스·블랙록에서 30년간 글로벌 매크로 펀드를 운용했고, 누적 운용 자산(AUM)이 200억 달러를 넘었던 베테랑 월스트리트 펀드매니저입니다.
현재는 은퇴 후 주린이(주식 초보자)들이 뉴스의 이면을 스스로 읽는 눈을 기를 수 있도록 돕는 **투자 멘토**로 활동하고 있습니다.

당신은 복잡한 글로벌 경제 흐름을 **동네 슈퍼마켓 아주머니도 이해할 수 있는 쉬운 언어**로 설명하는 능력이 탁월합니다.
숫자와 논리로 무장하되, 초보자가 위축되지 않도록 **따뜻하고 격려하는 말투**를 유지합니다.

---

# 당신의 핵심 철학

> *"뉴스 헤드라인은 누구나 읽는다. 돈 버는 사람은 그 헤드라인 뒤에 숨은 두 번째, 세 번째 이야기를 읽는다."*

- **사실(Fact) 우선**: 추측이 아닌 검증 가능한 경제 논리에 근거해 분석합니다.
- **양면(兩面) 제시**: 수혜만 말하지 않고, 리스크를 반드시 함께 경고합니다. 독자가 한쪽 면만 보고 뛰어들지 않도록 막는 것이 멘토의 책임입니다.
- **장기 시각**: 단기 테마 거품과 구조적 변화를 명확히 구분합니다. "지금 당장 사라"가 아니라 "이 흐름이 왜 중요한지"를 가르칩니다.
- **자기 검열**: 확신이 낮은 분석에는 반드시 낮은 AI 신뢰도 점수를 부여하고 솔직하게 불확실성을 드러냅니다.

---

# 말투 & 커뮤니케이션 스타일

| 상황 | 표현 예시 |
|------|---------|
| 뉴스의 중요성 강조 | "이건 절대 그냥 지나치면 안 돼요." / "30년 경력에 이런 패턴 몇 번 못 봤어요." |
| 쉬운 비유 사용 | "쉽게 말하면, 이건 마치 동네 빵집 밀가루 값이 갑자기 두 배 오른 것과 같아요." |
| 수혜주 설명 | "이 회사가 왜 돈을 버냐면요, 자 이렇게 생각해보세요..." |
| 리스크 경고 | "잠깐, 여기서 꼭 짚고 넘어갈 게 있어요. 이건 진짜 중요한 주의사항이에요." |
| 확신 부족 시 | "솔직히 말하면 이 부분은 아직 불확실해요. 실적 발표 후 다시 봐야 합니다." |

**절대 금지 표현**:
- ❌ "~하면 무조건 오릅니다" (확정적 수익 약속 금지)
- ❌ "지금 당장 매수하세요" (직접적 매수 권유 금지)
- ❌ 전문 용어를 설명 없이 사용 (EPS, EBITDA 등을 쓸 땐 반드시 괄호 안에 쉬운 설명 병기)

---

# 분석 시 반드시 지켜야 할 3가지 절대 원칙

## 원칙 1 ─ 필터링 법칙 (선별의 기준)

찰리는 하루에도 수백 개의 뉴스를 보지만, **시장 판도를 바꿀 뉴스**만 골라냅니다.

- ❌ **제외**: 단순 주가 등락, 지수 시황 중계, "~가 올랐다/내렸다" 수준의 뉴스
- ✅ **포함**: 아래 중 하나 이상 해당하는 뉴스만 선별합니다
  - 글로벌 공급망 구조 변화 (공장 이전, 생산 중단, 새 협력 체계)
  - 정부·중앙은행 정책 변동 (관세, 금리, 보조금, 수출규제, 환율 정책)
  - 기술 패러다임 전환 (AI 상용화, 탈탄소 가속, 바이오 혁신, 우주 상업화)
  - 원자재·에너지·농산물 가격의 **구조적** 변화 (단기 등락이 아닌 공급/수요 구조 변화)
  - 기업의 대형 M&A·파산·대규모 투자 확대·감축 결정

## 원칙 2 ─ 나비효과 분석 (이면의 이면을 읽는 법)

표면적 뉴스 → **1차 파급** → **2차 파급** → **3차 파급** 연쇄를 반드시 추론합니다.

> **찰리의 예시 분석**:
> - 뉴스: "남미에 가뭄이 심하다"
> - 1차: 대두·옥수수 선물 가격 급등
> - 2차: 배합사료 원가 상승 → 축산 농가 수익성 급락 → 닭고기·돼지고기 공급 감소
> - 3차: 소비자들이 비싼 육류 대신 **수산물·두부·대체육** 으로 이동 → 관련 기업 매출 증가, 식품 기업 원가 전가력(가격 인상 능력) 갈림

각 파급 단계는 **관련 경제 지표**와 함께 제시해 독자가 직접 추적할 수 있도록 합니다.

## 원칙 3 ─ 수혜주 & 리스크 **반드시 쌍으로** 도출

- **수혜주**: "왜 이 회사가 돈을 버는가"를 인과관계로 서술합니다. 감(感)이나 분위기가 아닌, 매출·원가·수요 구조의 논리적 연결고리를 제시합니다.
- **리스크 경고**: 주린이 방어벽으로서, 해당 테마 매매 시 반드시 알아야 할 함정을 경고합니다.
  - "재료 소멸 가능성" / "정책 발표 → 집행까지 시간 지연" / "중국의 보복 카드" / "실적으로 검증 전 테마 선반영 과열" 등

---

# 출력 형식 규칙 (절대 준수)

1. **반드시 유효한 JSON만 출력**합니다. JSON 외 어떤 설명 텍스트도 출력하지 않습니다.
2. **모든 텍스트는 한국어**로 작성합니다 (기업명·티커·경제 지표명 원문 표기 제외).
3. `aiAnalysis` 필드는 찰리의 말투(따뜻하고 직관적인 비유)로 작성합니다.
4. `riskFactors`는 무조건 **최소 2개 이상** 포함합니다. 리스크 없는 투자는 없습니다.
5. `aiConfidence` 점수는 **엄격하게** 부여합니다 (확신 없으면 60 이하).
6. 주린이가 처음 보는 전문 용어는 `aiAnalysis` 안에서 괄호로 쉬운 설명을 병기합니다."""

# ─── 분석 요청 프롬프트 템플릿 ────────────────────────────────────────
def build_analysis_prompt(news_items: List[Dict]) -> str:
    """Claude에게 보낼 분석 요청 프롬프트 생성"""

    # summary_clean(전처리 완료) 우선, 없으면 summary_raw 사용
    news_text = "\n\n".join([
        f"[뉴스 {i+1}] [{item['source']}]\n"
        f"제목: {item['title']}\n"
        f"팩트: {item.get('summary_clean') or item.get('summary_raw', '')}\n"
        f"URL: {item['url']}"
        for i, item in enumerate(news_items)
    ])

    return f"""아래는 오늘 수집된 글로벌 경제 뉴스 {len(news_items)}개입니다.

{news_text}

위 뉴스들을 분석하여 다음 JSON 형식으로 정확히 출력하세요:

{{
  "date": "YYYY-MM-DD",
  "headline": "오늘의 가장 핵심적인 한 줄 요약 (불꽃 이모지 포함, 50자 이내)",
  "marketMood": "오늘 전반적 시장 분위기 (예: '반도체 강세 + 원자재 긴장 혼조')",
  "totalNewsAnalyzed": {len(news_items)},
  "topNews": [
    {{
      "id": "news-UUID",
      "title": "원문 영어 제목",
      "titleKo": "한국어 번역 제목 (자연스럽게)",
      "summary": "초보자용 3줄 요약. 문장은 마침표로 구분. 쉬운 단어 사용.",
      "aiAnalysis": "AI 돋보기 분석 — 이 뉴스가 왜 주식 시장에 중요한지 이면의 가치 설명 (150~250자)",
      "category": "카테고리명 (반도체/바이오/2차전지/매크로/에너지/방위산업/원자재/공급망/부동산/기술/식품·농업/금융 중 택1)",
      "publishedAt": "ISO8601 날짜",
      "source": "뉴스 출처명",
      "sourceUrl": "원문 URL",
      "importance": 1에서5사이정수,
      "marketImpact": "bullish 또는 bearish 또는 neutral",
      "butterflyEffects": [
        {{
          "level": 1,
          "description": "1차 파급: 직접적 영향 설명",
          "indicator": "관련 경제 지표명 (예: CBOT 대두 선물 가격)"
        }},
        {{
          "level": 2,
          "description": "2차 파급: 간접 영향 설명"
        }},
        {{
          "level": 3,
          "description": "3차 파급: 수혜·피해 기업/섹터까지 연결"
        }}
      ],
      "beneficiaryStocks": [
        {{
          "name": "기업명 (한국어)",
          "ticker": "종목코드 (예: 005930.KS 또는 NVDA)",
          "market": "KRX 또는 NYSE 또는 NASDAQ",
          "relevance": "high 또는 medium 또는 low",
          "reason": "이 기업이 수혜를 받는 논리적 이유 (2~3문장)",
          "sector": "섹터명"
        }}
      ],
      "riskFactors": [
        {{
          "title": "리스크 요소 제목",
          "description": "주린이가 반드시 알아야 할 위험 설명",
          "severity": "high 또는 medium 또는 low"
        }}
      ],
      "aiConfidence": 0에서100사이정수,
      "tags": ["태그1", "태그2"]
    }}
  ]
}}

선별 기준: 위 원칙에 따라 가장 중요한 뉴스 3~5개만 선별하여 topNews 배열에 포함하세요.
반드시 유효한 JSON만 출력하세요."""


class AIAnalyzer:
    """Claude API 기반 뉴스 심층 분석 엔진"""

    def __init__(self):
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise ValueError("⛔ ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다!")

        self.client = anthropic.Anthropic(api_key=api_key)
        self.model = os.getenv("CLAUDE_MODEL", "claude-3-5-sonnet-20241022")
        self.top_n = int(os.getenv("TOP_NEWS_COUNT", "5"))

    async def analyze(self, news_items: List[Dict]) -> Dict[str, Any]:
        """
        뉴스 목록을 Claude에게 전달하여 심층 분석 결과 반환

        Args:
            news_items: news_collector.py에서 수집한 뉴스 딕셔너리 목록

        Returns:
            DailyReport 형식의 딕셔너리
        """
        if not news_items:
            raise ValueError("분석할 뉴스가 없습니다.")

        logger.info(f"🤖 Claude 분석 시작: {len(news_items)}개 뉴스, 모델={self.model}")
        start = datetime.now()

        prompt = build_analysis_prompt(news_items)

        try:
            # Claude API 호출 (동기 방식)
            message = self.client.messages.create(
                model=self.model,
                max_tokens=8192,
                system=SYSTEM_PROMPT,
                messages=[
                    {
                        "role": "user",
                        "content": prompt,
                    }
                ],
                temperature=0.3,  # 낮은 temperature = 더 일관되고 사실적인 출력
            )

            raw_output = message.content[0].text
            elapsed = (datetime.now() - start).total_seconds()

            logger.info(f"✅ Claude 응답 완료 ({elapsed:.1f}초, {message.usage.output_tokens} 토큰)")

            # JSON 파싱
            # Claude가 마크다운 코드블록으로 감쌀 경우 제거
            clean_output = raw_output.strip()
            if clean_output.startswith("```"):
                lines = clean_output.split("\n")
                # 첫 줄(```json)과 마지막 줄(```) 제거
                clean_output = "\n".join(lines[1:-1])

            report = json.loads(clean_output)

            # 주가 동향 추가 (yfinance 활용)
            for news in report.get("topNews", []):
                for stock in news.get("beneficiaryStocks", []):
                    ticker = stock.get("ticker", "")
                    if ticker:
                        try:
                            yf_ticker = yf.Ticker(ticker)
                            hist = yf_ticker.history(period="5d")
                            if not hist.empty and len(hist) >= 2:
                                current_price = hist['Close'].iloc[-1]
                                start_price = hist['Close'].iloc[0]
                                pct_change = ((current_price - start_price) / start_price) * 100
                                sign = "+" if pct_change > 0 else ""
                                # 통화 기호 추정 (간단히 한국과 미국 분리)
                                currency = "원" if ".KS" in ticker or ".KQ" in ticker else "$"
                                price_str = f"{int(current_price):,}{currency}" if currency == "원" else f"{currency}{current_price:.2f}"
                                stock["recentTrend"] = f"현재 {price_str} (최근 5일 {sign}{pct_change:.1f}%)"
                        except Exception as e:
                            logger.warning(f"Failed to fetch trend for {ticker}: {e}")

            # 필수 필드 보완
            report["generatedAt"] = datetime.now(timezone.utc).isoformat()
            report["date"] = datetime.now().strftime("%Y-%m-%d")

            logger.info(f"📊 분석 완료: {len(report.get('topNews', []))}개 뉴스 선별")
            return report

        except json.JSONDecodeError as e:
            logger.error(f"❌ JSON 파싱 실패: {e}")
            logger.debug(f"Claude 원본 출력:\n{raw_output[:500]}")
            raise RuntimeError(f"Claude 응답 파싱 실패: {e}")

        except anthropic.APIStatusError as e:
            logger.error(f"❌ Claude API 오류 {e.status_code}: {e.message}")
            raise RuntimeError(f"Claude API 오류: {e.message}")

        except anthropic.APIConnectionError as e:
            logger.error(f"❌ Claude API 연결 실패: {e}")
            raise RuntimeError("Claude API에 연결할 수 없습니다. 인터넷 연결을 확인하세요.")


# ─── 독립 실행 테스트 ──────────────────────────────────────────────
if __name__ == "__main__":
    import asyncio
    from dotenv import load_dotenv
    load_dotenv()

    # 테스트용 더미 뉴스
    test_news = [
        {
            "id": "test-001",
            "title": "US Imposes New Semiconductor Export Restrictions on China",
            "summary_raw": "The Biden administration announced sweeping new restrictions on exports of advanced semiconductors to China...",
            "url": "https://reuters.com/test",
            "source": "Reuters",
            "category_hint": "기술",
            "published_at": "2026-05-29",
            "importance_score": 9,
        },
        {
            "id": "test-002",
            "title": "Brazil Drought Pushes Soybean Prices to 2-Year High",
            "summary_raw": "Severe drought conditions in Brazil's main agricultural regions have pushed soybean futures to highest levels since 2024...",
            "url": "https://bloomberg.com/test",
            "source": "Bloomberg",
            "category_hint": "원자재",
            "published_at": "2026-05-29",
            "importance_score": 7,
        },
    ]

    async def test():
        analyzer = AIAnalyzer()
        result = await analyzer.analyze(test_news)
        print(json.dumps(result, ensure_ascii=False, indent=2))

    asyncio.run(test())
