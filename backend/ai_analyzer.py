"""
📁 backend/ai_analyzer.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AI 뉴스 분석기 v7.0 — OpenAI GPT-4o-mini
 - JSON Mode 로 100% 파싱 안정성 보장
 - yfinance 주가 조회 (6초 타임아웃)
 - 네이버 금융 자동 티커 해석
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

import json
import os
import re
import asyncio
import aiohttp
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from loguru import logger
import yfinance as yf

# ─── 모델 설정 ──────────────────────────────────────────
# gpt-4o-mini: 빠르고 저렴 ($0.15/1M input tokens), 한국어 품질 우수
DEFAULT_MODEL = "gpt-4o-mini"

# ─── 시스템 프롬프트 ─────────────────────────────────────
SYSTEM_PROMPT = """당신은 30년 경력의 월스트리트 프롭 트레이더 '찰리'입니다. 
한국 주식 시장 뉴스를 분석하여 투자 인사이트를 제공합니다.

절대 규칙:
1. 추천 종목은 반드시 한국 주식(KRX 상장 종목)만 제시. 미국/해외 주식 금지.
2. 각 뉴스에 1만5천원 이하 저가주를 최소 1개 포함.
3. 모든 텍스트는 한국어로. 완성된 문장으로 작성.
4. 응답은 반드시 올바른 JSON 형식으로만 출력. 설명 텍스트 없이.

응답 JSON 구조:
{
  "date": "YYYY-MM-DD",
  "headline": "오늘 증시 핵심 한줄 요약",
  "marketMood": "bullish|bearish|neutral",
  "totalNewsAnalyzed": 뉴스수(정수),
  "topNews": [
    {
      "title": "뉴스 제목",
      "source": "출처",
      "url": "링크",
      "category": "카테고리",
      "impact": "bullish|bearish|neutral",
      "aiSummary": "3문장 핵심 요약",
      "aiAnalysis": "투자 관점 심층 분석 3~4문장",
      "butterflyEffects": [
        {"level": 1, "description": "1차 파급효과", "indicator": "관련 지표"},
        {"level": 2, "description": "2차 파급효과", "indicator": "관련 지표"}
      ],
      "beneficiaryStocks": [
        {
          "name": "종목명",
          "ticker": "티커코드 (예: 005930.KS)",
          "reason": "추천 이유 2문장",
          "isLowPrice": true/false
        }
      ],
      "riskFactors": [
        {"description": "리스크 설명", "severity": "high|medium|low"}
      ],
      "aiConfidence": 85,
      "tags": ["태그1", "태그2"]
    }
  ]
}"""

# ─── 주요 종목 티커 맵 ──────────────────────────────────
TICKER_MAP = {
    "삼성전자": "005930.KS", "SK하이닉스": "000660.KS", "LG에너지솔루션": "373220.KS",
    "삼성바이오로직스": "207940.KS", "현대차": "005380.KS", "기아": "000270.KS",
    "셀트리온": "068270.KS", "POSCO홀딩스": "005490.KS", "NAVER": "035420.KS",
    "카카오": "035720.KS", "에코프로비엠": "247540.KQ", "에코프로": "086520.KQ",
    "포스코퓨처엠": "003670.KS", "LG화학": "051910.KS", "삼성SDI": "006400.KS",
    "현대모비스": "012330.KS", "삼성물산": "028260.KS", "KB금융": "105560.KS",
    "신한지주": "055550.KS", "하나금융지주": "086790.KS", "카카오뱅크": "323410.KS",
    "크래프톤": "259960.KS", "넷마블": "251270.KS", "펄어비스": "263750.KQ",
    "OCI": "010060.KS", "두산에너빌리티": "034020.KS", "한화에어로스페이스": "012450.KS",
}


def build_prompt(news_items: List[Dict]) -> str:
    today = datetime.now().strftime("%Y-%m-%d")
    items = []
    for i, item in enumerate(news_items):
        body = (item.get("summary_clean") or item.get("summary_raw", ""))[:200]
        items.append(
            f"[뉴스 {i+1}] 출처: {item['source']}\n"
            f"제목: {item['title']}\n"
            f"내용: {body}\n"
            f"URL: {item['url']}"
        )
    news_block = "\n\n---\n\n".join(items)
    return (
        f"오늘 날짜: {today}\n\n"
        f"아래 {len(news_items)}개 뉴스 중 한국 주식 시장에 가장 큰 영향을 미칠 "
        f"상위 3개를 선정하여 분석해 주세요.\n\n"
        f"{news_block}\n\n"
        f"반드시 JSON만 출력하세요."
    )


class AIAnalyzer:
    def __init__(self):
        self.api_key = os.getenv("OPENAI_API_KEY")
        if not self.api_key:
            raise ValueError("OPENAI_API_KEY 환경변수가 설정되지 않았습니다.")
        self.model = os.getenv("OPENAI_MODEL", DEFAULT_MODEL)
        self.max_retries = 3
        self.api_url = "https://api.openai.com/v1/chat/completions"
        logger.info(f"✅ AIAnalyzer v7.0 초기화 완료: model={self.model}")

    async def analyze(self, news_items: List[Dict]) -> Dict[str, Any]:
        if not news_items:
            raise ValueError("분석할 뉴스가 없습니다.")

        logger.info(f"🤖 OpenAI 분석 시작: {len(news_items)}개 뉴스, 모델={self.model}")
        start = datetime.now()
        prompt = build_prompt(news_items)

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            "response_format": {"type": "json_object"},  # JSON Mode: 항상 올바른 JSON 반환
            "temperature": 0.3,
            "max_tokens": 4096,
        }

        async with aiohttp.ClientSession() as session:
            for attempt in range(1, self.max_retries + 1):
                try:
                    async with session.post(
                        self.api_url,
                        headers=headers,
                        json=payload,
                        timeout=aiohttp.ClientTimeout(total=60),
                    ) as resp:
                        resp_json = await resp.json()

                        if resp.status != 200:
                            err = resp_json.get("error", {})
                            raise RuntimeError(f"OpenAI API 오류 {resp.status}: {err.get('message', '알 수 없는 오류')}")

                        content = resp_json["choices"][0]["message"]["content"]
                        report = json.loads(content)

                        elapsed = (datetime.now() - start).total_seconds()
                        logger.info(f"✅ OpenAI 분석 완료: {elapsed:.1f}초")
                        break

                except (RuntimeError, json.JSONDecodeError) as e:
                    logger.error(f"❌ 시도 {attempt}/{self.max_retries} 실패: {e}")
                    if attempt < self.max_retries:
                        await asyncio.sleep(3)
                    else:
                        raise RuntimeError(f"OpenAI API 최종 실패 ({self.max_retries}회 시도): {e}")
                except Exception as e:
                    logger.error(f"❌ 예상치 못한 오류 (시도 {attempt}): {e}")
                    if attempt < self.max_retries:
                        await asyncio.sleep(3)
                    else:
                        raise RuntimeError(f"분석 실패: {e}")

        # 메타 데이터 추가
        report["generatedAt"] = datetime.now(timezone.utc).isoformat()
        report["date"] = datetime.now().strftime("%Y-%m-%d")

        # 앱 타입과 필드명 일치시키기 (OpenAI 응답 정규화)
        _normalize_report(report)

        # 주가 데이터 보강
        await self._enrich_stocks(report)
        return report


    async def _resolve_ticker(self, name: str) -> str:
        """종목명으로 KRX 티커 코드 조회 (네이버 금융 자동 검색)"""
        import urllib.parse
        clean = re.sub(r"\(주\)|주식회사|\s+", "", name)

        # 1. 사전 매핑
        for key, val in TICKER_MAP.items():
            if key in clean or clean in key:
                return val

        # 2. 네이버 금융 자동완성 API
        url = (
            f"https://ac.finance.naver.com/ac"
            f"?q={urllib.parse.quote(clean)}&q_enc=utf-8&st=111&r_format=json&r_enc=utf-8"
        )
        try:
            async with aiohttp.ClientSession() as sess:
                async with sess.get(
                    url,
                    headers={"User-Agent": "Mozilla/5.0"},
                    timeout=aiohttp.ClientTimeout(total=5),
                ) as r:
                    if r.status == 200:
                        data = await r.json(content_type=None)
                        items = data.get("items", [[]])[0]
                        if items:
                            code = items[0][0]
                            market = items[0][2]
                            return f"{code}.KS" if market == "KOSPI" else f"{code}.KQ"
        except Exception:
            pass
        return ""

    async def _enrich_stocks(self, report: dict) -> None:
        """수혜주 리스트에 실시간 주가 데이터 추가"""

        async def enrich(stock: dict):
            try:
                name = stock.get("name", "")
                ticker = stock.get("ticker", "")

                # 티커 코드 검증 및 자동 탐색
                if not ticker or (not ticker.endswith(".KS") and not ticker.endswith(".KQ")):
                    resolved = await self._resolve_ticker(name)
                    if resolved:
                        stock["ticker"] = ticker = resolved

                if not ticker:
                    return

                # yfinance 주가 조회 (6초 타임아웃)
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

                result = await asyncio.wait_for(
                    asyncio.to_thread(get_price), timeout=6
                )
                if result:
                    stock.update(result)
                    if result["currentPrice"] <= 15000:
                        stock["isLowPrice"] = True

            except asyncio.TimeoutError:
                logger.warning(f"⏱ yfinance 타임아웃: {stock.get('name')}")
            except Exception as e:
                logger.warning(f"⚠ 주가 조회 실패 [{stock.get('name')}]: {e}")

        tasks = [
            enrich(s)
            for n in report.get("topNews", [])
            for s in n.get("beneficiaryStocks", [])
        ]
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

def _normalize_report(report: dict) -> None:
    import uuid
    for i, news in enumerate(report.get("topNews", [])):
        if not news.get("id"): news["id"] = f"news-{i+1:03d}-{uuid.uuid4().hex[:6]}"
        if "impact" in news and "marketImpact" not in news: news["marketImpact"] = news.pop("impact")
        if "marketImpact" not in news: news["marketImpact"] = "neutral"
        if "aiSummary" in news and not news.get("summary"): news["summary"] = news.pop("aiSummary")
        elif "aiSummary" in news: news.pop("aiSummary", None)
        if not news.get("titleKo"): news["titleKo"] = news.get("title", "")
        if not news.get("publishedAt"): news["publishedAt"] = datetime.now(timezone.utc).isoformat()
        if not news.get("sourceUrl"): news["sourceUrl"] = news.get("url", "")
        if not news.get("importance"): news["importance"] = 3
        for rf in news.get("riskFactors", []):
            if not rf.get("title"): rf["title"] = "리스크"
            if not rf.get("severity"): rf["severity"] = "medium"
        for be in news.get("butterflyEffects", []):
            if not be.get("indicator"): be["indicator"] = ""
        for stock in news.get("beneficiaryStocks", []):
            if not stock.get("market"): stock["market"] = "KRX"
            if not stock.get("relevance"): stock["relevance"] = "medium"
            if not stock.get("sector"): stock["sector"] = ""
