"""
Gemini AI News Analyzer v6.0 (REST API Bypass)
- Bypasses google-genai SDK to fix 404 / 429 limit:0 errors
- Uses raw aiohttp REST API calls to v1beta endpoint
- Forced to gemini-1.5-flash
"""

import json
import os
import re
import asyncio
import aiohttp
from datetime import datetime, timezone
from typing import List, Dict, Any
from loguru import logger
import yfinance as yf

# ─── Raw JSON Schema Definition ───
RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "date": {"type": "STRING"},
        "headline": {"type": "STRING"},
        "marketMood": {"type": "STRING"},
        "totalNewsAnalyzed": {"type": "INTEGER"},
        "topNews": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "title": {"type": "STRING"},
                    "source": {"type": "STRING"},
                    "url": {"type": "STRING"},
                    "category": {"type": "STRING"},
                    "impact": {"type": "STRING", "description": "bullish, bearish, or neutral"},
                    "aiSummary": {"type": "STRING"},
                    "aiAnalysis": {"type": "STRING"},
                    "butterflyEffects": {
                        "type": "ARRAY",
                        "items": {
                            "type": "OBJECT",
                            "properties": {
                                "level": {"type": "INTEGER", "description": "1 or 2"},
                                "description": {"type": "STRING"},
                                "indicator": {"type": "STRING"}
                            },
                            "required": ["level", "description", "indicator"]
                        }
                    },
                    "beneficiaryStocks": {
                        "type": "ARRAY",
                        "items": {
                            "type": "OBJECT",
                            "properties": {
                                "name": {"type": "STRING", "description": "Korean stock name"},
                                "ticker": {"type": "STRING", "description": "Stock code, e.g., 005930.KS"},
                                "reason": {"type": "STRING"},
                                "isLowPrice": {"type": "BOOLEAN"}
                            },
                            "required": ["name", "ticker", "reason"]
                        }
                    },
                    "riskFactors": {
                        "type": "ARRAY",
                        "items": {
                            "type": "OBJECT",
                            "properties": {
                                "description": {"type": "STRING"},
                                "severity": {"type": "STRING", "description": "high, medium, or low"}
                            },
                            "required": ["description", "severity"]
                        }
                    },
                    "aiConfidence": {"type": "INTEGER"},
                    "tags": {
                        "type": "ARRAY",
                        "items": {"type": "STRING"}
                    }
                },
                "required": ["title", "source", "url", "category", "impact", "aiSummary", "aiAnalysis", "butterflyEffects", "beneficiaryStocks", "riskFactors", "aiConfidence", "tags"]
            }
        }
    },
    "required": ["date", "headline", "marketMood", "totalNewsAnalyzed", "topNews"]
}

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
        self.api_key = os.getenv("GEMINI_API_KEY")
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY not set")
        
        env_model = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
        self.model = "gemini-1.5-flash" if "lite" in env_model else env_model
        
        # Hard fallback if it's 2.0 (since 2.0 gives limit:0)
        if "2.0" in self.model:
            self.model = "gemini-1.5-flash"

        self.max_retries = 3
        logger.info(f"AIAnalyzer v6.0 (REST API bypass) initialized: model={self.model}")

    async def analyze(self, news_items: List[Dict]) -> Dict[str, Any]:
        if not news_items:
            raise ValueError("No news items to analyze")
        logger.info(f"REST API analysis start: {len(news_items)} items, model={self.model}")
        start = datetime.now()
        prompt = build_prompt(news_items)
        
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent?key={self.api_key}"
        
        payload = {
            "system_instruction": {
                "parts": [{"text": SYSTEM_PROMPT}]
            },
            "contents": [
                {"role": "user", "parts": [{"text": prompt}]}
            ],
            "generationConfig": {
                "temperature": 0.2,
                "responseMimeType": "application/json",
                "responseSchema": RESPONSE_SCHEMA
            }
        }

        async with aiohttp.ClientSession() as session:
            for attempt in range(1, self.max_retries + 1):
                try:
                    async with session.post(url, json=payload, timeout=45) as resp:
                        resp_json = await resp.json()
                        
                        if resp.status != 200:
                            err_msg = resp_json.get("error", {}).get("message", "Unknown error")
                            raise RuntimeError(f"HTTP {resp.status}: {err_msg}")
                            
                        candidates = resp_json.get("candidates", [])
                        if not candidates:
                            raise RuntimeError("No candidates returned from API")
                            
                        text_content = candidates[0]["content"]["parts"][0]["text"]
                        report = json.loads(text_content)
                        
                        elapsed = (datetime.now() - start).total_seconds()
                        logger.info(f"REST API responded with valid JSON in {elapsed:.1f}s")
                        break
                except Exception as e:
                    logger.error(f"Attempt {attempt} failed: {e}")
                    if attempt < self.max_retries:
                        await asyncio.sleep(5)
                        continue
                    raise RuntimeError(f"REST API failed after {self.max_retries} attempts: {e}")

        report["generatedAt"] = datetime.now(timezone.utc).isoformat()
        report["date"] = datetime.now().strftime("%Y-%m-%d")
        await self._enrich_stocks(report)
        return report

    async def _resolve_ticker(self, name: str) -> str:
        import urllib.parse
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
