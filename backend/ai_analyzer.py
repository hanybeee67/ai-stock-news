"""
Gemini AI News Analyzer v4.0
Speed-optimized: no response_schema, plain JSON parsing
"""

import json
import os
import re
import asyncio
from datetime import datetime, timezone
from typing import List, Dict, Any
from loguru import logger
import yfinance as yf

from google import genai
from google.genai import types


def _extract_json(text: str) -> dict:
    text = re.sub(r'```(?:json)?\s*', '', text).strip()
    text = re.sub(r'```\s*$', '', text).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    match = re.search(r'\{[\s\S]+\}', text)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass
    raise ValueError(f"JSON extraction failed. Response: {text[:300]}")


SYSTEM_PROMPT = """당신은 찰리(Charlie)입니다. 30년 경력의 월스트리트 프롭트레이더입니다.

[절대 원칙]
1. 반드시 한국 주식(KRX)만 추천. 미국 주식 절대 불가.
2. 각 뉴스 수혜주에 15,000원 이하 저가 한국 종목 최소 1개 포함.
3. 모든 텍스트는 완결된 한국어 문장으로 작성.
4. 아래 JSON 형식만 출력. 다른 텍스트 절대 불가.

[출력 JSON 형식]
{
  "date": "YYYY-MM-DD",
  "headline": "핵심 요약 이모지 포함 50자 이내",
  "marketMood": "시장 분위기 1문장",
  "totalNewsAnalyzed": 5,
  "topNews": [
    {
      "title": "뉴스 제목",
      "source": "출처",
      "url": "URL",
      "category": "카테고리",
      "impact": "bullish",
      "aiSummary": "2문장 요약",
      "aiAnalysis": "단기(당일~5일): 분석 / 중기(1~3개월): 분석 / 장기(6개월+): 분석",
      "butterflyEffects": [
        {"level": 1, "description": "파급효과", "indicator": "관련지표"},
        {"level": 2, "description": "2차효과", "indicator": "관련지표"}
      ],
      "beneficiaryStocks": [
        {"name": "종목명", "ticker": "000000.KS", "reason": "수혜이유", "isLowPrice": false}
      ],
      "riskFactors": [
        {"description": "리스크내용", "severity": "medium"}
      ],
      "aiConfidence": 80,
      "tags": ["태그1", "태그2"]
    }
  ]
}"""


def build_prompt(news_items: List[Dict]) -> str:
    today = datetime.now().strftime("%Y-%m-%d")
    items = []
    for i, item in enumerate(news_items):
        body = (item.get('summary_clean') or item.get('summary_raw', ''))[:150]
        items.append(f"[{i+1}] [{item['source']}] {item['title']}\n{body}\nURL: {item['url']}")
    news_block = "\n\n".join(items)
    return f"""Today is {today}. Analyze {len(news_items)} Korean market news items.
Select top 3 most impactful for short-term trading. Output valid JSON only.

{news_block}

Set date to "{today}". Korean KRX stocks only. Include 1 stock under 15000 KRW per news."""


TICKER_MAP = {
    "삼성전자": "005930.KS", "SK하이닉스": "000660.KS", "LG에너지솔루션": "373220.KS",
    "삼성바이오로직스": "207940.KS", "현대차": "005380.KS", "현대자동차": "005380.KS",
    "기아": "000270.KS", "기아차": "000270.KS", "셀트리온": "068270.KS",
    "POSCO홀딩스": "005490.KS", "포스코홀딩스": "005490.KS", "NAVER": "035420.KS",
    "네이버": "035420.KS", "카카오": "035720.KS", "LG화학": "051910.KS",
    "삼성SDI": "006400.KS", "현대모비스": "012330.KS", "KB금융": "105560.KS",
    "신한지주": "055550.KS", "하나금융지주": "086790.KS", "에코프로비엠": "247540.KQ",
    "에코프로": "086520.KQ", "포스코퓨처엠": "003670.KS", "알테오젠": "196170.KQ",
    "HLB": "028300.KQ", "GS건설": "006360.KS", "현대건설": "000720.KS",
    "한화에어로스페이스": "012450.KS", "한화시스템": "272210.KS", "두산": "000150.KS",
    "대한항공": "003490.KS", "한국항공우주": "047810.KS", "삼성물산": "028260.KS",
    "LG전자": "066570.KS", "SK텔레콤": "017670.KS", "KT": "030200.KS",
}


class AIAnalyzer:
    """Gemini AI News Analyzer v4.0 - Speed Optimized"""

    def __init__(self):
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY not set")
        self.client = genai.Client(api_key=api_key)
        self.model = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
        self.max_retries = 3
        logger.info(f"AIAnalyzer v4.0 initialized: model={self.model}")

    async def analyze(self, news_items: List[Dict]) -> Dict[str, Any]:
        if not news_items:
            raise ValueError("No news items to analyze")

        logger.info(f"Gemini analysis: {len(news_items)} items, model={self.model}")
        start = datetime.now()
        full_prompt = f"{SYSTEM_PROMPT}\n\n{build_prompt(news_items)}"

        for attempt in range(1, self.max_retries + 1):
            try:
                logger.info(f"Gemini API call attempt {attempt}/{self.max_retries}")
                response = await self.client.aio.models.generate_content(
                    model=self.model,
                    contents=full_prompt,
                    config=types.GenerateContentConfig(
                        temperature=0.2,
                        max_output_tokens=3000,
                    )
                )
                elapsed = (datetime.now() - start).total_seconds()
                logger.info(f"Gemini responded in {elapsed:.1f}s")
                report = _extract_json(response.text)
                break

            except (ValueError, json.JSONDecodeError) as e:
                logger.warning(f"Attempt {attempt} JSON parse failed: {e}")
                if attempt < self.max_retries:
                    await asyncio.sleep(3)
                    continue
                raise RuntimeError(f"JSON parse failed: {e}")

            except Exception as e:
                err = str(e)
                logger.error(f"Gemini API error attempt {attempt}: {e}")
                if '429' in err or 'RESOURCE_EXHAUSTED' in err:
                    wait = min(20 * attempt, 60)
                    logger.warning(f"Rate limited. Waiting {wait}s...")
                    await asyncio.sleep(wait)
                    if attempt < self.max_retries:
                        continue
                if attempt < self.max_retries:
                    await asyncio.sleep(5)
                    continue
                raise RuntimeError(f"Gemini API failed: {e}")

        report["generatedAt"] = datetime.now(timezone.utc).isoformat()
        report["date"] = datetime.now().strftime("%Y-%m-%d")
        for news in report.get("topNews", []):
            news.setdefault("butterflyEffects", [])
            news.setdefault("beneficiaryStocks", [])
            news.setdefault("riskFactors", [])
            news.setdefault("aiConfidence", 70)
            news.setdefault("tags", [])
            for s in news.get("beneficiaryStocks", []):
                s.setdefault("isLowPrice", False)

        await self._enrich_stocks(report)
        logger.info(f"Analysis complete: {len(report.get('topNews', []))} items")
        return report

    async def _resolve_ticker(self, name: str) -> str:
        import aiohttp, urllib.parse
        clean = re.sub(r'\(주\)|주식회사|\s+', '', name)
        for key, val in TICKER_MAP.items():
            if key in clean or clean in key:
                return val
        url = f"https://ac.finance.naver.com/ac?q={urllib.parse.quote(clean)}&q_enc=utf-8&st=111&r_format=json&r_enc=utf-8"
        try:
            async with aiohttp.ClientSession() as sess:
                async with sess.get(url, headers={"User-Agent": "Mozilla/5.0"},
                                    timeout=aiohttp.ClientTimeout(total=5)) as r:
                    if r.status == 200:
                        data = await r.json()
                        items = data.get('items', [[]])[0]
                        if items:
                            code, market = items[0][0], items[0][2]
                            return f"{code}.KS" if market == 'KOSPI' else f"{code}.KQ"
        except Exception as e:
            logger.warning(f"Ticker lookup failed for {name}: {e}")
        return ""

    async def _enrich_stocks(self, report: dict) -> None:
        async def enrich(stock: dict):
            try:
                name = stock.get("name", "")
                ticker = stock.get("ticker", "")
                if not ticker or (not ticker.endswith(".KS") and not ticker.endswith(".KQ")):
                    resolved = await self._resolve_ticker(name)
                    if resolved:
                        stock["ticker"] = resolved
                        ticker = resolved
                if not ticker:
                    return

                def get_price():
                    try:
                        h = yf.Ticker(ticker).history(period="5d")
                        if h.empty:
                            return None
                        price = float(h["Close"].iloc[-1])
                        prev = float(h["Close"].iloc[-2]) if len(h) > 1 else price
                        chg = round((price - prev) / prev * 100, 2) if prev else 0
                        return {"currentPrice": price, "changePercent": chg}
                    except Exception:
                        return None

                result = await asyncio.to_thread(get_price)
                if result:
                    stock.update(result)
                    if result["currentPrice"] <= 15000:
                        stock["isLowPrice"] = True
            except Exception as e:
                logger.warning(f"Stock enrich failed [{stock.get('name')}]: {e}")

        tasks = [enrich(s) for n in report.get("topNews", []) for s in n.get("beneficiaryStocks", [])]
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
