"""
📁 backend/ai_analyzer.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Claude AI 뉴스 심층 분석 엔진

핵심 기능:
1. [필터링 법칙] 단순 시황 제외, 판도 변화 뉴스 선별
2. [나비효과 분석] 1차→2차→3차 파급효과 추론
3. [수혜주 매칭] 논리적 근거 + 관련 종목 도출
4. [리스크 쌍 도출] 진입 시 주의사항 반드시 병기

변경사항 (v2.0):
- AsyncAnthropic 으로 교체 → event loop 블로킹 제거
- JSON 파싱 3단계 내성 강화 (정규식 재추출 + fallback)
- 분석 재시도 로직 추가 (최대 2회)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

import json
import os
import re
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from loguru import logger
import anthropic
import yfinance as yf

# ─── Claude 시스템 프롬프트 ────────────────────────────────────────────
SYSTEM_PROMPT = """# 당신은 누구인가

당신의 이름은 **찰리(Charlie)**입니다.
30년 경력의 베테랑 월스트리트 프롭트레이더(단기 전문 자금 운용역)이자, 단타 매매를 막 시작한 초보자를 위한 친절한 리스크 관리자입니다.

당신은 복잡한 글로벌 뉴스를 분석하여, 향후 '단기적 변동성'과 '재료의 신선도'가 가장 높은 유망 종목을 포착하는 전문가입니다.
사용자의 투자 성향은 [초기 단계의 단기 단타 위주]입니다. 따라서 당신의 모든 분석 결과의 무게중심은 철저히 **'단기적 관점(당일~1주일 내)'의 대응 전략**에 맞춰져야 합니다.

---

# 당신의 핵심 철학

> *"단타는 수익보다 살아남는 게 먼저다. 뉴스는 재료일 뿐, 언제 팔고 나갈지가 전부다."*

- **단기 변동성 중심**: 오늘 당장 주가에 불을 붙일 수 있는 '핵심 팩트' 위주로 분석합니다.
- **철저한 리스크 관리**: 진입 시 반드시 지켜야 할 손절 기준과 재료 소멸 시점을 명확하게 경고합니다.
- **기간별 정밀 분석**: 단기(당일~5일)에 초점을 맞추되, 이 재료가 중기(1~3개월), 장기(6개월 이상)로 이어질 메가 트렌드인지도 함께 판단합니다.

---

# 분석 시 반드시 지켜야 할 3가지 절대 원칙

## 원칙 1 ─ 필터링 법칙 (선별의 기준)
하루 수백 개의 뉴스 중 **'단기적 변동성'과 '재료의 신선도'가 가장 높은 뉴스**만 골라냅니다.
단순 시황 중계가 아닌, 오늘 당장 돈이 몰릴 곳을 찾습니다.

## 원칙 2 ─ 3단계 정밀 분석 (aiAnalysis 필드에 작성)
1. **단기 분석 (당일 ~ 5영업일 이내 - ★가장 중요★)**: 예상 주가 흐름(예: "장 초반 갭상승 후 눌림목 형성 예상")과 주린이 단타 가이드(시초가 매매 시 주의점 등).
2. **중기 분석 (1개월 ~ 3개월 이내)**: 일회성 테마인지, 실적에 영향을 줄 플로우인지 판단.
3. **장기 분석 (6개월 이상)**: 패러다임 자체를 바꾸는 메가 트렌드인지 딱 한 줄로만 담백하게 평할 것.

## 원칙 3 ─ 수혜주 & 단타 필수 리스크 경고
- **수혜주**: 재료 신선도(최상/상/보통)와 핵심 단기 수혜 이유(왜 오늘 당장 매수세를 자극하는지)를 직관적으로 설명.
- **리스크 경고 (주린이 방어벽)**: "시초가 깨질 때 -3% 손절" 등 구체적인 손절 기준과 재료 소멸 시점 경고.

---

# 출력 형식 규칙 (절대 준수)

1. **반드시 유효한 JSON만 출력**합니다. JSON 외 어떤 설명 텍스트도 출력하지 않습니다.
2. **모든 텍스트는 한국어**로 작성합니다.
3. `aiConfidence` 점수는 엄격하게 부여합니다.
4. 모든 분석은 프롭트레이더의 직관적이고 단호한 말투를 사용합니다."""

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
  "headline": "오늘의 핵심 단타 뉴스 요약 (불꽃 이모지 포함, 50자 이내, 완결된 문장으로 작성)",
  "marketMood": "오늘 시장의 분위기를 '강세', '약세', '혼조' 등 간결한 단어로 표현한 뒤, 핵심 이유를 한 문장으로 덧붙일 것. 예: '혼조 – 미중 관세 갈등 재점화로 불확실성 고조'",
  "totalNewsAnalyzed": {len(news_items)},
  "topNews": [
    {{
      "id": "news-001",
      "title": "원문 영어 제목 (원문 그대로)",
      "titleKo": "자연스러운 한국어 번역 제목 (완전한 문장 형태, 직역 금지)",
      "summary": "주린이도 30초 만에 이해할 수 있도록, 오늘 장 시작 직후 주가에 즉각적인 영향을 줄 핵심 팩트 2문장으로 요약. 각 문장은 '~입니다', '~습니다'로 끝나는 완결된 문장이어야 하며 단어가 중간에 끊기거나 생략되어서는 안 됩니다.",
      "aiAnalysis": "■ 투자 기간별 3단계 정밀 분석\\n1. 단기(당일~5영업일 ★가장 중요★): 예상 주가 흐름과 단타 대응 가이드를 구체적으로 서술. 예: '장 초반 갭상승 후 눌림목 형성 가능성이 높습니다. 시초가가 전일 종가 대비 2% 이상 상승 출발 시 추격 매수는 금물이며, 눌림목에서의 분할 매수를 권장합니다.'\\n2. 중기(1~3개월): 일회성 테마인지, 실적 개선으로 이어질 구조적 변화인지 판단하여 완전한 문장으로 서술.\\n3. 장기(6개월 이상): 패러다임 변화 여부를 한 문장으로 담백하게 평가. 예: '미중 반도체 디커플링이 장기적으로 국내 소부장 업체의 수혜로 이어질 가능성이 있습니다.'",
      "category": "카테고리명 (반도체/바이오/2차전지/매크로/에너지/방위산업/원자재/공급망/부동산/기술/식품·농업/금융 중 반드시 하나만 선택)",
      "publishedAt": "ISO8601 날짜",
      "source": "뉴스 출처명",
      "sourceUrl": "원문 URL",
      "importance": 1에서5사이정수,
      "marketImpact": "bullish 또는 bearish 또는 neutral",
      "butterflyEffects": [
        {{
          "level": 1,
          "description": "1차 파급 효과를 완전한 한국어 문장으로 서술. 주어와 서술어를 갖춘 완결된 문장이어야 하며, 반드시 '~합니다' 또는 '~입니다'로 끝나야 합니다. 예: '미국 수출 규제 강화로 국내 메모리 반도체 기업들의 단기 매출 감소가 우려됩니다.'",
          "indicator": "실제 경제 지표명만 작성. 예: 'KOSPI 반도체 지수', 'S&P500', 'WTI 원유', '달러인덱스(DXY)', '10년물 미국채 금리'. 임의로 만든 이름이나 불확실한 지표는 절대 작성하지 마세요."
        }},
        {{
          "level": 2,
          "description": "2차 파급 효과를 완전한 한국어 문장으로 서술. 주어와 서술어를 갖춘 완결된 문장이어야 하며, 반드시 '~합니다' 또는 '~입니다'로 끝나야 합니다. 예: '중국 보복 조치로 인해 애플·테슬라 등 중국 의존도가 높은 미국 기업들의 주가 하락 압력이 커질 수 있습니다.'"
        }},
        {{
          "level": 3,
          "description": "3차 파급 효과를 완전한 한국어 문장으로 서술. 주어와 서술어를 갖춘 완결된 문장이어야 하며, 반드시 '~합니다' 또는 '~입니다'로 끝나야 합니다. 예: '안전자산 선호 심리가 강화되며 금과 달러가 동반 강세를 보이고, 신흥국 통화 약세가 심화될 가능성이 있습니다.'"
        }}
      ],
      "beneficiaryStocks": [
        {{
          "name": "종목명 (반드시 실제로 주식 시장에 상장된 회사명만 사용. 한국 또는 미국 기업 중 1~2개 선별)",
          "ticker": "정확한 종목코드. 한국 종목: 숫자 6자리 뒤에 .KS(코스피) 또는 .KQ(코스닥) 부여. 미국 종목: 알파벳 티커 그대로. 확실하지 않으면 반드시 빈 문자열로 남겨둘 것. 절대 추측으로 작성하지 말 것.",
          "market": "KRX 또는 NYSE 또는 NASDAQ",
          "relevance": "high 또는 medium 또는 low",
          "reason": "이 뉴스가 오늘 당장 왜 이 종목의 매수세를 자극하는지 완전한 문장으로 설명. 재료 신선도(최상/상/보통)와 핵심 수혜 근거를 포함. 예: '[재료 신선도: 최상] 미국 정부의 반도체 보조금 직접 수혜 기업으로 지정되어 단기 강한 매수세가 유입될 가능성이 높습니다.'",
          "sector": "섹터명"
        }}
      ],
      "riskFactors": [
        {{
          "title": "🚨 핵심 리스크 (간결한 제목)",
          "description": "명확한 손절 기준과 재료 소멸 시점을 완전한 문장으로 경고. 예: '시초가 기준 -3% 이탈 시 즉시 손절하세요. 미중 협상이 재개될 경우 이 재료는 하루 만에 소멸될 수 있습니다.'",
          "severity": "high 또는 medium 또는 low"
        }}
      ],
      "aiConfidence": 0에서100사이정수,
      "tags": ["태그1", "태그2"]
    }}
  ]
}}

⚠️ 출력 품질 절대 원칙:
1. 모든 description, summary, aiAnalysis, reason 필드는 반드시 완결된 한국어 문장으로 작성하세요. 단어가 중간에 끊기거나 문장이 불완전하면 안 됩니다.
2. indicator 필드에는 반드시 실존하는 경제 지표명만 사용하세요. 존재하지 않는 지표명을 임의로 만들어 쓰지 마세요.
3. ticker 필드는 확실하지 않으면 반드시 빈 문자열("")로 작성하고, 절대 추측으로 채우지 마세요.
4. 선별 기준: 위 원칙에 따라 가장 중요한 뉴스 3~5개만 선별하여 topNews 배열에 포함하세요.
5. 반드시 유효한 JSON만 출력하세요. JSON 앞뒤에 어떠한 텍스트도 붙이지 마세요."""


def _extract_json_robust(raw_output: str) -> Optional[dict]:
    """
    Claude 응답에서 JSON을 강건하게 추출하는 3단계 시도.

    1단계: 마크다운 코드블록 제거 후 직접 파싱
    2단계: 정규식으로 { ... } 블록 추출 후 파싱
    3단계: 중첩된 JSON 구조 브루트포스 탐색
    """
    # ── 1단계: 코드블록 벗기기 ──
    clean = raw_output.strip()
    if clean.startswith("```"):
        lines = clean.split("\n")
        # 첫 줄(```json 또는 ```) 과 마지막 줄(```) 제거
        inner = lines[1:-1] if lines[-1].strip() == "```" else lines[1:]
        clean = "\n".join(inner).strip()

    try:
        return json.loads(clean)
    except json.JSONDecodeError:
        pass

    # ── 2단계: 정규식으로 JSON 오브젝트 블록 추출 ──
    json_pattern = re.compile(r'\{[\s\S]*\}', re.DOTALL)
    match = json_pattern.search(raw_output)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass

    # ── 3단계: 중괄호 균형 맞춰 추출 ──
    start_idx = raw_output.find('{')
    if start_idx != -1:
        depth = 0
        for i, ch in enumerate(raw_output[start_idx:], start=start_idx):
            if ch == '{':
                depth += 1
            elif ch == '}':
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(raw_output[start_idx:i+1])
                    except json.JSONDecodeError:
                        break

    return None


class AIAnalyzer:
    """Claude API 기반 뉴스 심층 분석 엔진 (비동기 v2.0)"""

    def __init__(self):
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise ValueError("⛔ ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다!")

        # ✅ AsyncAnthropic 사용 — event loop 블로킹 방지
        self.client = anthropic.AsyncAnthropic(api_key=api_key)
        self.model = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-5")
        self.top_n = int(os.getenv("TOP_NEWS_COUNT", "5"))
        self.max_retries = 2

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
        raw_output = None

        # ── 재시도 루프 ──
        last_error = None
        for attempt in range(1, self.max_retries + 1):
            try:
                logger.info(f"🔄 Claude API 호출 (시도 {attempt}/{self.max_retries})")
                # ✅ await 비동기 호출
                message = await self.client.messages.create(
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

                # ── 강건한 JSON 파싱 ──
                report = _extract_json_robust(raw_output)
                if report is None:
                    raise RuntimeError("JSON 추출 실패: 3단계 파싱 모두 실패")

                break  # 성공 시 루프 탈출

            except (json.JSONDecodeError, RuntimeError) as e:
                last_error = e
                logger.warning(f"⚠ 시도 {attempt} 파싱 실패: {e}")
                if attempt < self.max_retries:
                    logger.info("🔁 재시도 중...")
                    continue
                else:
                    logger.error(f"❌ 최대 재시도 초과. 원본 출력 (앞 500자):\n{raw_output[:500] if raw_output else 'None'}")
                    raise RuntimeError(f"Claude 응답 파싱 최종 실패: {e}")

            except anthropic.APIStatusError as e:
                logger.error(f"❌ Claude API 오류 {e.status_code}: {e.message}")
                raise RuntimeError(f"Claude API 오류: {e.message}")

            except anthropic.APIConnectionError as e:
                logger.error(f"❌ Claude API 연결 실패: {e}")
                raise RuntimeError("Claude API에 연결할 수 없습니다. 인터넷 연결을 확인하세요.")

        # ── 주가 동향 추가 및 티커 자동 보정 (yfinance & Naver) ──
        await self._enrich_stock_trends(report)

        # ── 필수 필드 보완 ──
        report["generatedAt"] = datetime.now(timezone.utc).isoformat()
        report["date"] = datetime.now().strftime("%Y-%m-%d")

        logger.info(f"📊 분석 완료: {len(report.get('topNews', []))}개 뉴스 선별")
        return report

    async def _resolve_korean_ticker(self, name: str) -> str:
        """네이버 금융 검색 API를 통해 한국 종목의 정확한 6자리 티커(+ .KS/.KQ)를 반환"""
        import aiohttp
        import urllib.parse
        import re

        # 1. 불필요한 접미사 제거
        clean_name = re.sub(r'\(주\)|주식회사|\s+', '', name)

        # 2. 하드코딩 사전 폴백 (주요 AI 환각 및 인기 종목)
        fallback_dict = {
            "삼성전자": "005930.KS",
            "SK하이닉스": "000660.KS",
            "한미반도체": "042700.KS",
            "동진쎄미켐": "005290.KQ",
            "HMM": "011200.KS",
            "현대차": "005380.KS",
            "기아": "000270.KS",
            "LG에너지솔루션": "373220.KS",
            "셀트리온": "068270.KS",
            "POSCO홀딩스": "005490.KS",
            "NAVER": "035420.KS",
            "카카오": "035720.KS",
            "삼성SDI": "006400.KS",
            "LG화학": "051910.KS",
            "삼성물산": "028260.KS",
            "KB금융": "105560.KS",
            "신한지주": "055550.KS",
            "포스코퓨처엠": "003670.KS",
            "에코프로비엠": "247540.KQ",
            "에코프로": "086520.KQ",
            "엔켐": "348370.KQ",
            "알테오젠": "196170.KQ",
            "HLB": "028300.KQ",
            "GS건설": "006360.KS",
            "현대건설": "000720.KS",
        }
        
        for key, val in fallback_dict.items():
            if key in clean_name or clean_name in key:
                return val

        url = f"https://ac.finance.naver.com/ac?q={urllib.parse.quote(clean_name)}&q_enc=utf-8&st=111&r_format=json&r_enc=utf-8"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, headers=headers, timeout=5) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        items = data.get('items', [[]])[0]
                        if items:
                            for item in items:
                                if len(item) >= 3 and (item[1] == clean_name or item[1] == name):
                                    code, _, market = item[0], item[1], item[2]
                                    return f"{code}.KS" if market == 'KOSPI' else f"{code}.KQ"
                            # 정확히 일치하는 이름이 없으면 첫번째 결과 반환
                            code, market = items[0][0], items[0][2]
                            return f"{code}.KS" if market == 'KOSPI' else f"{code}.KQ"
        except Exception as e:
            logger.warning(f"Ticker resolution failed for {name}: {e}")
        return ""

    async def _enrich_stock_trends(self, report: dict) -> None:
        """수혜주에 최근 주가 동향 추가 (yfinance, 실패해도 무시)"""
        for news in report.get("topNews", []):
            for stock in news.get("beneficiaryStocks", []):
                ticker = stock.get("ticker", "")
                name = stock.get("name", "")
                
                # 한국 종목인 경우 네이버 검색으로 정확한 티커 보정
                is_korean = any("\u3131" <= c <= "\u318E" or "\uAC00" <= c <= "\uD7A3" for c in name)
                if is_korean:
                    real_ticker = await self._resolve_korean_ticker(name)
                    if real_ticker:
                        stock["ticker"] = real_ticker
                        ticker = real_ticker

                if not ticker:
                    continue
                try:
                    yf_ticker = yf.Ticker(ticker)
                    hist = yf_ticker.history(period="5d")
                    if not hist.empty and len(hist) >= 2:
                        current_price = hist['Close'].iloc[-1]
                        start_price = hist['Close'].iloc[0]
                        pct_change = ((current_price - start_price) / start_price) * 100
                        sign = "+" if pct_change > 0 else ""
                        currency = "원" if (".KS" in ticker or ".KQ" in ticker) else "$"
                        if currency == "원":
                            price_str = f"{int(current_price):,}원"
                        else:
                            price_str = f"${current_price:.2f}"
                        stock["recentTrend"] = f"현재 {price_str} (최근 5일 {sign}{pct_change:.1f}%)"
                        # 등락 방향도 저장
                        stock["trendDirection"] = "up" if pct_change > 0 else "down" if pct_change < 0 else "flat"
                        stock["trendPercent"] = round(pct_change, 2)
                except Exception as e:
                    logger.warning(f"Failed to fetch trend for {ticker}: {e}")


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
            "published_at": "2026-05-30",
            "importance_score": 9,
        },
        {
            "id": "test-002",
            "title": "Brazil Drought Pushes Soybean Prices to 2-Year High",
            "summary_raw": "Severe drought conditions in Brazil's main agricultural regions have pushed soybean futures to highest levels since 2024...",
            "url": "https://bloomberg.com/test",
            "source": "Bloomberg",
            "category_hint": "원자재",
            "published_at": "2026-05-30",
            "importance_score": 7,
        },
    ]

    async def test():
        analyzer = AIAnalyzer()
        result = await analyzer.analyze(test_news)
        print(json.dumps(result, ensure_ascii=False, indent=2))

    asyncio.run(test())
