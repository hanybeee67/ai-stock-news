"""
📁 backend/ai_analyzer.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Gemini AI 뉴스 심층 분석 엔진 (v3.0)

핵심 기능:
1. [필터링 법칙] 단순 시황 제외, 판도 변화 뉴스 선별
2. [나비효과 분석] 1차→2차→3차 파급효과 추론
3. [수혜주 매칭] 논리적 근거 + 관련 종목 도출
4. [리스크 쌍 도출] 진입 시 주의사항 반드시 병기

변경사항 (v3.0):
- google-genai 패키지 기반 Gemini 1.5 Flash 모델로 교체
- Pydantic Native JSON Schema를 이용한 100% 안정적 파싱
- 클로드 의존성 및 복잡한 Regex 파싱 로직 제거
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

import json
import os
import asyncio
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from loguru import logger
import yfinance as yf
from pydantic import BaseModel, Field

# google-genai SDK
from google import genai
from google.genai import types

# ─── Pydantic 응답 스키마 정의 (Gemini Structured Outputs 용) ─────────────
class ButterflyEffect(BaseModel):
    level: int = Field(description="1, 2, 3 중 하나")
    description: str = Field(description="파급 효과를 완전한 한국어 문장으로 서술 ('~합니다' 또는 '~입니다'로 끝남)")
    indicator: str = Field(description="실존하는 경제 지표명 (KOSPI 반도체 지수 등)")

class BeneficiaryStock(BaseModel):
    name: str = Field(description="종목명 — 반드시 한국(KRX) 상장 종목만. 미국 주식 절대 불가.")
    ticker: str = Field(description="한국 코스피: 숫자6자리.KS / 코스닥: 숫자6자리.KQ. 불확실 시 빈 문자열")
    market: str = Field(description="KRX 고정")
    relevance: str = Field(description="high 또는 medium 또는 low")
    priceLevel: str = Field(description="high(15000원 초과) 또는 low(15000원 이하)")
    reason: str = Field(description="이 종목이 매수세를 자극하는 이유를 완결된 한국어 문장으로 서술")
    sector: str = Field(description="섹터명")

class RiskFactor(BaseModel):
    title: str = Field(description="핵심 리스크 간결한 제목")
    description: str = Field(description="손절 기준과 재료 소멸 시점 경고 (완결된 한국어 문장)")
    severity: str = Field(description="high, medium, low 중 하나")

class NewsAnalysis(BaseModel):
    id: str
    title: str = Field(description="원문 영어 제목")
    titleKo: str = Field(description="자연스러운 한국어 번역 제목")
    summary: str = Field(description="핵심 팩트 2문장 요약 (완결된 한국어 문장)")
    aiAnalysis: str = Field(description="단기, 중기, 장기 분석을 줄바꿈으로 구분해 작성 (완결된 한국어 문장)")
    category: str = Field(description="반도체/바이오/2차전지/매크로/에너지/방위산업/원자재/공급망/부동산/기술/식품·농업/금융 중 하나")
    publishedAt: str = Field(description="ISO8601 날짜")
    source: str = Field(description="뉴스 출처명")
    sourceUrl: str = Field(description="원문 URL")
    importance: int = Field(description="1~5")
    marketImpact: str = Field(description="bullish, bearish, neutral 중 하나")
    butterflyEffects: List[ButterflyEffect]
    beneficiaryStocks: List[BeneficiaryStock]
    riskFactors: List[RiskFactor]
    aiConfidence: int = Field(description="0~100")
    tags: List[str]

class DailyReportSchema(BaseModel):
    date: str
    headline: str = Field(description="오늘의 핵심 단타 뉴스 요약 (불꽃 이모지 포함, 50자 이내)")
    marketMood: str = Field(description="오늘 시장 분위기와 핵심 이유 1문장")
    totalNewsAnalyzed: int
    topNews: List[NewsAnalysis]

# ─── 시스템 프롬프트 ────────────────────────────────────────────
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

# 분석 시 반드시 지켜야 할 절대 원칙

## 원칙 1 ─ 필터링 법칙 (선별의 기준)
하루 수백 개의 뉴스 중 **'단기적 변동성'과 '재료의 신선도'가 가장 높은 뉴스**만 골라냅니다.
단순 시황 중계가 아닌, 오늘 당장 돈이 몰릴 곳을 찾습니다.

## 원칙 2 ─ 3단계 정밀 분석 (aiAnalysis 필드에 작성)
1. **단기 분석 (당일 ~ 5영업일 이내 - ★가장 중요★)**: 예상 주가 흐름과 주린이 단타 가이드(시초가 매매 시 주의점 등).
2. **중기 분석 (1개월 ~ 3개월 이내)**: 일회성 테마인지, 실적에 영향을 줄 플로우인지 판단.
3. **장기 분석 (6개월 이상)**: 패러다임 자체를 바꾸는 메가 트렌드인지 판단.

## 원칙 3 ─ 수혜주 & 단타 필수 리스크 경고
- **수혜주**: 재료 신선도와 핵심 단기 수혜 이유(왜 오늘 당장 매수세를 자극하는지)를 직관적으로 설명.
- **리스크 경고 (주린이 방어벽)**: "시초가 깨질 때 -3% 손절" 등 구체적인 손절 기준과 재료 소멸 시점 경고.

## 원칙 4 ─ 한국 주식 전용 + 저가주 필수 포함 (절대 원칙)
- **반드시 한국 주식(KRX)만 추천**합니다. 미국 NYSE·NASDAQ 종목은 절대 포함하지 마십시오.
- **각 뉴스의 수혜주 목록에는 반드시 현재 주가 15,000원 이하의 저가 한국 종목을 최소 1개 포함**해야 합니다. 이는 소액 투자자도 접근할 수 있는 기회를 제공하기 위한 필수 조건입니다.
- 저가주 예시 (15,000원 이하 코스피·코스닥 상장사): 한화시스템(272210.KS), 두산(000150.KS), 영원무역(111770.KS), 현대위아(011210.KS), GS(078930.KS), 한국항공우주(047810.KS), 대한항공(003490.KS) 등 해당 뉴스 주제와 연관된 저가 종목을 창의적으로 발굴하십시오.
- 저가주라도 뉴스 재료와의 연관성이 있어야 합니다. 단순히 가격이 싸다고 선정하지 말고, 해당 뉴스의 테마와 논리적으로 연결되는 종목을 선택하십시오.

---

# 출력 형식 규칙 (절대 준수)

1. 모든 텍스트는 한국어로 작성하며, JSON 필드 포맷(특히 Pydantic Schema)에 맞추어 생성합니다.
2. 각 필드의 문자열(description, reason 등)은 항상 주어와 서술어를 갖춘 완결된 한국어 문장이어야 하며, 불완전하게 끊기면 안 됩니다.
3. `beneficiaryStocks`의 티커는 확실하지 않으면 반드시 빈 문자열("")로 남겨두세요. 절대 추측하지 마세요.
"""

def build_analysis_prompt(news_items: List[Dict]) -> str:
    """Gemini에게 보낼 분석 요청 텍스트 생성"""
    news_text = "\n\n".join([
        f"[뉴스 {i+1}] [{item['source']}]\n"
        f"제목: {item['title']}\n"
        f"팩트: {item.get('summary_clean') or item.get('summary_raw', '')}\n"
        f"URL: {item['url']}"
        for i, item in enumerate(news_items)
    ])

    return f"""아래는 오늘 수집된 글로벌 경제 뉴스 {len(news_items)}개입니다.

{news_text}

위 뉴스들을 분석하여 정의된 JSON 스키마 형식으로 3~5개의 핵심 뉴스를 선별하여 출력하세요.
"""


class AIAnalyzer:
    """Gemini API 기반 뉴스 심층 분석 엔진 (비동기 v3.0)"""

    def __init__(self):
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            # 호환성을 위해 구환경 변수가 있으면 우선 사용 시도 (원칙은 GEMINI_API_KEY 사용)
            api_key = os.getenv("ANTHROPIC_API_KEY") 
            if not api_key:
                raise ValueError("⛔ GEMINI_API_KEY 환경변수가 설정되지 않았습니다!")

        self.client = genai.Client(api_key=api_key)
        self.model = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
        self.max_retries = 2

    async def analyze(self, news_items: List[Dict]) -> Dict[str, Any]:
        if not news_items:
            raise ValueError("분석할 뉴스가 없습니다.")

        logger.info(f"🤖 Gemini 분석 시작: {len(news_items)}개 뉴스, 모델={self.model}")
        start = datetime.now()

        prompt = build_analysis_prompt(news_items)
        raw_output = None

        last_error = None
        for attempt in range(1, self.max_retries + 1):
            try:
                logger.info(f"🔄 Gemini API 호출 (시도 {attempt}/{self.max_retries})")
                
                # google-genai 비동기 호출
                response = await self.client.aio.models.generate_content(
                    model=self.model,
                    contents=[SYSTEM_PROMPT, prompt],
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        response_schema=DailyReportSchema,
                        temperature=0.3,
                    )
                )

                raw_output = response.text
                elapsed = (datetime.now() - start).total_seconds()
                logger.info(f"✅ Gemini 응답 완료 ({elapsed:.1f}초)")

                # Native JSON Schema를 통해 반환되므로 바로 로드 가능
                report = json.loads(raw_output)
                break

            except json.JSONDecodeError as e:
                last_error = e
                logger.warning(f"⚠ 시도 {attempt} JSON 파싱 실패: {e}")
                if attempt < self.max_retries:
                    logger.info("🔁 재시도 중...")
                    continue
                else:
                    logger.error(f"❌ 최대 재시도 초과. 원본 출력:\n{raw_output[:500] if raw_output else 'None'}")
                    raise RuntimeError(f"Gemini 응답 파싱 최종 실패: {e}")
            except Exception as e:
                logger.error(f"❌ Gemini API 오류: {e}")
                if attempt < self.max_retries:
                    logger.info("🔁 재시도 중...")
                    continue
                raise RuntimeError(f"Gemini API 호출 실패: {e}")

        # ── 주가 동향 추가 및 티커 자동 보정 (yfinance & Naver) ──
        await self._enrich_stock_trends(report)

        # ── 필수 필드 보완 ──
        report["generatedAt"] = datetime.now(timezone.utc).isoformat()
        report["date"] = datetime.now().strftime("%Y-%m-%d")

        logger.info(f"📊 분석 완료: {len(report.get('topNews', []))}개 뉴스 선별")
        return report

    async def _resolve_korean_ticker(self, name: str) -> str:
        import aiohttp
        import urllib.parse
        import re

        clean_name = re.sub(r'\(주\)|주식회사|\s+', '', name)

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
                            code, market = items[0][0], items[0][2]
                            return f"{code}.KS" if market == 'KOSPI' else f"{code}.KQ"
        except Exception as e:
            logger.warning(f"Ticker resolution failed for {name}: {e}")
        return ""

    async def _enrich_stock_trends(self, report: dict) -> None:
        async def enrich_one(stock: dict) -> None:
            try:
                name = stock.get("name", "")
                ticker = stock.get("ticker", "")

                is_korean = any('\u3131' <= c <= '\u318E' or '\uAC00' <= c <= '\uD7A3' for c in name)
                if is_korean:
                    try:
                        real_ticker = await asyncio.wait_for(
                            self._resolve_korean_ticker(name), timeout=5
                        )
                        if real_ticker:
                            stock["ticker"] = real_ticker
                            ticker = real_ticker
                    except asyncio.TimeoutError:
                        logger.warning(f"[티커조회 타임아웃] {name}")
                    except Exception as e:
                        logger.warning(f"[티커조회 실패] {name}: {e}")

                if not ticker:
                    return

                def fetch_hist():
                    t = yf.Ticker(ticker)
                    return t.history(period="5d")

                hist = await asyncio.wait_for(
                    asyncio.to_thread(fetch_hist), timeout=8
                )

                if not hist.empty and len(hist) >= 2:
                    current_price = hist['Close'].iloc[-1]
                    start_price = hist['Close'].iloc[0]
                    pct_change = ((current_price - start_price) / start_price) * 100
                    sign = "+" if pct_change > 0 else ""
                    currency = "원" if (".KS" in ticker or ".KQ" in ticker) else "$"
                    price_str = f"{int(current_price):,}원" if currency == "원" else f"${current_price:.2f}"
                    stock["recentTrend"] = f"현재 {price_str} (최근 5일 {sign}{pct_change:.1f}%)"
                    stock["trendDirection"] = "up" if pct_change > 0 else "down" if pct_change < 0 else "flat"
                    stock["trendPercent"] = round(pct_change, 2)

            except asyncio.TimeoutError:
                logger.warning(f"[주가조회 타임아웃] {stock.get('ticker', stock.get('name', '?'))}")
            except Exception as e:
                logger.warning(f"[주가조회 실패] {stock.get('ticker', '?')}: {e}")

        all_stocks = [
            stock
            for news in report.get("topNews", [])
            for stock in news.get("beneficiaryStocks", [])
        ]

        if all_stocks:
            logger.info(f"📈 주가 동향 조회 시작: {len(all_stocks)}개 종목 (병렬)")
            await asyncio.gather(*[enrich_one(s) for s in all_stocks])
            logger.info(f"✅ 주가 동향 조회 완료")
