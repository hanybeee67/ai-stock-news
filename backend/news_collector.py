"""
📁 backend/news_collector.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
전 세계 경제 뉴스 RSS 피드 수집기

지원 소스:
- Reuters (Business, Finance, Markets)
- Bloomberg Markets
- Financial Times
- CNBC Economy, Finance
- Investing.com
- MarketWatch
- Seeking Alpha
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

import asyncio
import aiohttp
import feedparser
from datetime import datetime, timezone
from typing import List, Dict, Optional
from loguru import logger
import os

from text_cleaner import clean_news_batch

# ─── RSS 피드 소스 목록 ────────────────────────────────────────────────
# 각 항목: (소스명, 피드 URL, 카테고리 힌트)
RSS_FEEDS: List[tuple] = [
    # 로이터
    ("Reuters", "https://feeds.reuters.com/reuters/businessNews", "경제/비즈니스"),
    ("Reuters", "https://feeds.reuters.com/reuters/technologyNews", "기술"),

    # CNBC
    ("CNBC", "https://www.cnbc.com/id/20910258/device/rss/rss.html", "경제/금융"),
    ("CNBC", "https://www.cnbc.com/id/19836768/device/rss/rss.html", "금융"),
    ("CNBC", "https://www.cnbc.com/id/100727362/device/rss/rss.html", "기술"),

    # MarketWatch
    ("MarketWatch", "https://feeds.marketwatch.com/marketwatch/topstories/", "종합"),
    ("MarketWatch", "https://feeds.marketwatch.com/marketwatch/marketpulse/", "시장"),

    # Seeking Alpha (에너지/반도체 특화)
    ("Seeking Alpha", "https://seekingalpha.com/feed.xml", "종합"),

    # Investing.com
    ("Investing.com", "https://www.investing.com/rss/news.rss", "종합"),
    ("Investing.com", "https://www.investing.com/rss/news_285.rss", "원자재"),
    ("Investing.com", "https://www.investing.com/rss/news_14.rss", "주식"),

    # Financial Times
    ("FT", "https://www.ft.com/rss/home/uk", "종합"),

    # 한국 경제 뉴스 (한투, 연합인포맥스 등)
    ("연합뉴스", "https://www.yonhapnewstv.co.kr/browse/rss/economy", "경제"),
    ("매일경제", "https://rss.mk.co.kr/rss/30000001.xml", "경제"),
    ("한국경제", "https://rss.hankyung.com/economy.xml", "경제"),
]

# ─── 키워드 필터 (중요 뉴스 우선 선별) ──────────────────────────────
IMPORTANT_KEYWORDS = [
    # 공급망/정책
    "supply chain", "sanctions", "tariff", "trade war", "export ban", "subsidy",
    "공급망", "제재", "관세", "보조금", "수출규제",
    # 기술/산업
    "semiconductor", "chips", "AI", "battery", "electric vehicle", "hydrogen",
    "반도체", "배터리", "전기차", "수소", "인공지능",
    # 원자재/에너지
    "oil", "crude", "copper", "lithium", "rare earth", "drought", "harvest",
    "원유", "구리", "리튬", "희토류", "가뭄", "수확",
    # 매크로
    "Fed", "interest rate", "inflation", "recession", "GDP", "CPI",
    "금리", "인플레이션", "경기침체", "연준",
    # 기업 이벤트
    "merger", "acquisition", "IPO", "bankruptcy", "recall", "plant closure",
    "인수합병", "파산", "공장폐쇄",
]

# ─── 필터링 제외 키워드 (단순 시황) ────────────────────────────────
EXCLUDE_KEYWORDS = [
    "stock market today", "market wrap", "closing bell", "opening bell",
    "주가 오늘", "증시 마감", "오늘의 증시",
]


class NewsCollector:
    """비동기 RSS 뉴스 수집기"""

    def __init__(self, max_per_feed: int = 10, max_total: int = 60):
        self.max_per_feed = int(os.getenv("MAX_NEWS_PER_FEED", max_per_feed))
        self.max_total = int(os.getenv("MAX_TOTAL_NEWS", max_total))

    async def fetch_feed(
        self,
        session: aiohttp.ClientSession,
        source: str,
        url: str,
        category: str,
    ) -> List[Dict]:
        """단일 RSS 피드 비동기 수집"""
        results = []
        try:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                if resp.status != 200:
                    logger.warning(f"[{source}] HTTP {resp.status}: {url}")
                    return []
                content = await resp.text()

            feed = feedparser.parse(content)
            count = 0
            for entry in feed.entries:
                if count >= self.max_per_feed:
                    break

                title = entry.get("title", "").strip()
                summary = entry.get("summary", entry.get("description", "")).strip()
                link = entry.get("link", "")
                published = entry.get("published", entry.get("updated", ""))

                # 빈 항목 스킵
                if not title or not link:
                    continue

                # 단순 시황 제외
                if any(kw.lower() in title.lower() for kw in EXCLUDE_KEYWORDS):
                    continue

                news_item = {
                    "id": f"{source}-{abs(hash(link))}",
                    "title": title,
                    "summary_raw": summary[:2000] if summary else "",  # 전처리 전 원문은 넉넉히 보관
                    "url": link,
                    "source": source,
                    "category_hint": category,
                    "published_at": published,
                    "importance_score": self._calc_importance(title + " " + summary),
                }
                results.append(news_item)
                count += 1

            logger.info(f"[{source}] ✓ {len(results)}개 수집 ({url[:60]}...)")

        except asyncio.TimeoutError:
            logger.warning(f"[{source}] ⚠ 타임아웃: {url}")
        except Exception as e:
            logger.error(f"[{source}] ✗ 오류: {e}")

        return results

    def _calc_importance(self, text: str) -> int:
        """키워드 기반 중요도 사전 스코어링 (0~10)"""
        text_lower = text.lower()
        score = 0
        for kw in IMPORTANT_KEYWORDS:
            if kw.lower() in text_lower:
                score += 1
        return min(score, 10)

    async def collect_all(self) -> List[Dict]:
        """전체 RSS 피드 동시 수집 후 중요도 순 정렬"""
        logger.info(f"📡 뉴스 수집 시작 — {len(RSS_FEEDS)}개 피드")
        start = datetime.now()

        connector = aiohttp.TCPConnector(limit=20, ssl=False)
        headers = {
            "User-Agent": "Mozilla/5.0 (compatible; AIStockBot/1.0)",
            "Accept": "application/rss+xml, application/xml, text/xml, */*",
        }

        all_news = []
        async with aiohttp.ClientSession(connector=connector, headers=headers) as session:
            tasks = [
                self.fetch_feed(session, source, url, cat)
                for source, url, cat in RSS_FEEDS
            ]
            results = await asyncio.gather(*tasks, return_exceptions=True)

        for result in results:
            if isinstance(result, list):
                all_news.extend(result)

        # 중복 제거 (URL 기준)
        seen_urls = set()
        unique_news = []
        for item in all_news:
            if item["url"] not in seen_urls:
                seen_urls.add(item["url"])
                unique_news.append(item)

        # 중요도 순 정렬 후 상위 N개만
        unique_news.sort(key=lambda x: x["importance_score"], reverse=True)
        selected = unique_news[:self.max_total]

        # ── 텍스트 전처리: 노이즈 제거 & 경제 팩트 압축 ──────────────
        selected = clean_news_batch(selected)

        elapsed = (datetime.now() - start).total_seconds()
        logger.info(f"✅ 수집 완료: {len(all_news)}개 → 중복제거 {len(unique_news)}개 → 선별+전처리 {len(selected)}개 ({elapsed:.1f}초)")

        return selected


# ─── 독립 실행 테스트 ──────────────────────────────────────────────
if __name__ == "__main__":
    async def test():
        collector = NewsCollector(max_per_feed=3, max_total=15)
        news = await collector.collect_all()
        print(f"\n{'='*60}")
        print(f"총 {len(news)}개 뉴스 수집됨")
        for n in news[:5]:
            print(f"\n[{n['source']}] 🔥{n['importance_score']}")
            print(f"  제목: {n['title'][:80]}")
            print(f"  URL:  {n['url'][:60]}")

    asyncio.run(test())
