"""
Gemini AI News Analyzer v5.0
- Google GenAI Structured Outputs (Pydantic) for 100% JSON reliability
- yfinance timeout applied (6s)
- Optimized for gemini-2.0-flash
"""

import json
import os
import re
import asyncio
from datetime import datetime, timezone
from typing import List, Dict, Any
from loguru import logger
import yfinance as yf
from pydantic import BaseModel, Field

from google import genai
from google.genai import types

# ─── Pydantic Schemas for Gemini Structured Output ───
class ButterflyEffect(BaseModel):
    level: int = Field(description="1 or 2")
    description: str
    indicator: str

class BeneficiaryStock(BaseModel):
    name: str = Field(description="Korean stock name")
    ticker: str = Field(description="Stock code, e.g., 005930.KS")
    reason: str
    isLowPrice: bool = Field(description="Set to true if price is under 15000 KRW")

class RiskFactor(BaseModel):
    description: str
    severity: str = Field(description="high, medium, or low")

class NewsAnalysis(BaseModel):
    title: str
    source: str
    url: str
    category: str
    impact: str = Field(description="bullish, bearish, or neutral")
    aiSummary: str
    aiAnalysis: str
    butterflyEffects: List[ButterflyEffect]
    beneficiaryStocks: List[BeneficiaryStock]
    riskFactors: List[RiskFactor]
    aiConfidence: int
    tags: List[str]

class DailyReportSchema(BaseModel):
    date: str
    headline: str
    marketMood: str
    totalNewsAnalyzed: int
    topNews: List[NewsAnalysis]

SYSTEM_PROMPT = """You are Charlie, a 30-year veteran Wall Street prop trader. Analyze Korean stock market news.
ABSOLUTE RULES:
1. Only recommend Korean stocks (KRX listed). NO US/foreign stocks.
2. Each news must include at least 1 stock priced 15,000 KRW or below.
3. All text must be in Korean. Complete sentences only.
"""

def build_prompt(news_items: List[Dict]) -> str:
    today = datetime.now().strftime("%Y-%m-%d")
    items = []
    for i, item in enumerate(news_items):
        body = (item.get('summary_clean') or item.get('summary_raw', ''))[:150]
        items.append(f"[{i+1}] [{item['source']}] {item['title']}\n{body}\nURL: {item['url']}")
    news_block = "\n\n".join(items)
    return f"""Today is {today}. Analyze these {len(news_items)} Korean market news items.
Select the 3 most impactful for short-term stock trading.

{news_block}

Remember: Korean KRX stocks only, include 1 stock under 15000 KRW per news."""

TICKER_MAP = {
    "삼성전자": "005930.KS", "SK하이닉스": "000660.KS", "LG에너지솔루션": "373220.KS",
    "삼성바이오로직스": "207940.KS", "현대차": "005380.KS", "기아": "000270.KS",
    "셀트리온": "068270.KS", "POSCO홀딩스": "005490.KS", "NAVER": "035420.KS",
    "카카오": "035720.KS", "에코프로비엠": "247540.KQ", "에코프로": "086520.KQ",
}

class AIAnalyzer:
    def __init__(self):
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY not set")
        self.client = genai.Client(api_key=api_key)
        env_model = os.getenv("GEMINI_MODEL", "gemini-1.5-flash-8b")
        self.model = "gemini-1.5-flash-8b" if "lite" in env_model else env_model
        self.max_retries = 3
        logger.info(f"AIAnalyzer v5.0 initialized: model={self.model}")

    async def analyze(self, news_items: List[Dict]) -> Dict[str, Any]:
        if not news_items:
            raise ValueError("No news items to analyze")
        logger.info(f"Gemini analysis start: {len(news_items)} items, model={self.model}")
        start = datetime.now()
        prompt = build_prompt(news_items)
        
        for attempt in range(1, self.max_retries + 1):
            try:
                response = await self.client.aio.models.generate_content(
                    model=self.model,
                    contents=[SYSTEM_PROMPT, prompt],
                    config=types.GenerateContentConfig(
                        temperature=0.2,
                        response_mime_type="application/json",
                        response_schema=DailyReportSchema,
                    )
                )
                report = json.loads(response.text)
                elapsed = (datetime.now() - start).total_seconds()
                logger.info(f"Gemini API responded with valid JSON in {elapsed:.1f}s")
                break
            except Exception as e:
                logger.error(f"Attempt {attempt} failed: {e}")
                if attempt < self.max_retries:
                    await asyncio.sleep(5)
                    continue
                raise RuntimeError(f"Gemini API failed after {self.max_retries} attempts: {e}")

        report["generatedAt"] = datetime.now(timezone.utc).isoformat()
        report["date"] = datetime.now().strftime("%Y-%m-%d")
        await self._enrich_stocks(report)
        return report

    async def _resolve_ticker(self, name: str) -> str:
        import aiohttp, urllib.parse
        clean = re.sub(r'\(주\)|주식회사|\s+', '', name)
        for key, val in TICKER_MAP.items():
            if key in clean or clean in key: return val
        url = f"https://ac.finance.naver.com/ac?q={urllib.parse.quote(clean)}&q_enc=utf-8&st=111&r_format=json&r_enc=utf-8"
        try:
            async with aiohttp.ClientSession() as sess:
                async with sess.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=5) as r:
                    if r.status == 200:
                        data = await r.json()
                        items = data.get('items', [[]])[0]
                        if items:
                            code, market = items[0][0], items[0][2]
                            return f"{code}.KS" if market == 'KOSPI' else f"{code}.KQ"
        except: pass
        return ""

    async def _enrich_stocks(self, report: dict) -> None:
        async def enrich(stock: dict):
            try:
                name, ticker = stock.get("name", ""), stock.get("ticker", "")
                if not ticker or (not ticker.endswith(".KS") and not ticker.endswith(".KQ")):
                    resolved = await self._resolve_ticker(name)
                    if resolved: stock["ticker"] = ticker = resolved
                if not ticker: return
                
                def get_price():
                    try:
                        h = yf.Ticker(ticker).history(period="5d")
                        if h.empty: return None
                        price = float(h["Close"].iloc[-1])
                        prev = float(h["Close"].iloc[-2]) if len(h) > 1 else price
                        chg = round((price - prev) / prev * 100, 2) if prev else 0
                        return {"currentPrice": price, "changePercent": chg}
                    except: return None
                
                try:
                    result = await asyncio.wait_for(asyncio.to_thread(get_price), timeout=6)
                    if result:
                        stock.update(result)
                        if result["currentPrice"] <= 15000: stock["isLowPrice"] = True
                except asyncio.TimeoutError:
                    logger.warning(f"yfinance timeout for {name}")
            except Exception as e:
                logger.warning(f"Stock enrich failed for {stock.get('name')}: {e}")

        tasks = [enrich(s) for n in report.get("topNews", []) for s in n.get("beneficiaryStocks", [])]
        if tasks: await asyncio.gather(*tasks, return_exceptions=True)
