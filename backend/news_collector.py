"""
📁 backend/news_collector.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
전 세계 경제 뉴스 RSS 피드 수집기

지원 소스:
- Reuters (Business, Technology)
- CNBC (Economy, Finance, Tech)
- MarketWatch (Top Stories, Market Pulse)
- Seeking Alpha
- Investing.com (종합, 원자재, 주식)
- Financial Times
- 연합뉴스, 매일경제, 한국경제

변경사항 (v2.0):
- 중요도 스코어링 고도화 (가중치 기반 + 신선도 보너스)
- RSS URL 최신화 (만료된 피드 대체)
- 에러 로그 디테일 강화
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

import asyncio
import aiohttp
import feedparser
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Optional
from loguru import logger
import os

from text_cleaner import clean_news_batch

# ─── RSS 피드 소스 목록 ────────────────────────────────────────────────
# 각 항목: (소스명, 피드 URL, 카테고리 힌트)
RSS_FEEDS: List[tuple] = [
    # 로이터 (2026 업데이트된 URL)
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

    # 한국 경제 뉴스
    ("연합뉴스", "https://www.yonhapnewstv.co.kr/browse/rss/economy", "경제"),
    ("매일경제", "https://rss.mk.co.kr/rss/30000001.xml", "경제"),
    ("한국경제", "https://rss.hankyung.com/economy.xml", "경제"),
]

# ─── 중요도 키워드 (가중치 포함) ─────────────────────────────────────
# (키워드, 가중치) — 제목에서 발견 시 ×2 배율 적용
WEIGHTED_KEYWORDS: List[tuple] = [
    # 핵심 정책·이벤트 (가중치 3)
    ("Fed", 3), ("FOMC", 3), ("interest rate", 3), ("금리", 3), ("연준", 3),
    ("export ban", 3), ("sanctions", 3), ("tariff", 3), ("관세", 3), ("수출규제", 3),

    # 기술·산업 (가중치 2)
    ("semiconductor", 2), ("chips", 2), ("AI", 2), ("battery", 2), ("electric vehicle", 2),
    ("반도체", 2), ("배터리", 2), ("전기차", 2), ("인공지능", 2),
    ("TSMC", 2), ("NVIDIA", 2), ("삼성전자", 2), ("SK하이닉스", 2),

    # 원자재·에너지 (가중치 2)
    ("oil", 2), ("crude", 2), ("copper", 2), ("lithium", 2), ("rare earth", 2),
    ("원유", 2), ("구리", 2), ("리튬", 2), ("희토류", 2),

    # 매크로 (가중치 2)
    ("inflation", 2), ("recession", 2), ("GDP", 2), ("CPI", 2),
    ("인플레이션", 2), ("경기침체", 2),

    # 공급망·기업 이벤트 (가중치 1)
    ("supply chain", 1), ("merger", 1), ("acquisition", 1), ("IPO", 1), ("bankruptcy", 1),
    ("공급망", 1), ("인수합병", 1), ("파산", 1),

    # 기타 (가중치 1)
    ("hydrogen", 1), ("수소", 1), ("subsidy", 1), ("보조금", 1),
    ("drought", 1), ("harvest", 1), ("가뭄", 1), ("수확", 1),
    ("recall", 1), ("plant closure", 1), ("공장폐쇄", 1),
]

# ─── 필터링 제외 키워드 (단순 시황) ────────────────────────────────
EXCLUDE_KEYWORDS = [
    "stock market today", "market wrap", "closing bell", "opening bell",
    "주가 오늘", "증시 마감", "오늘의 증시",
]


class NewsCollector:
    """비동기 RSS 뉴스 수집기 (v2.0 — 스코어링 고도화)"""

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
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=12)) as resp:
                if resp.status != 200:
                    logger.warning(f"[{source}] HTTP {resp.status}: {url[:70]}")
                    return []
                content = await resp.text()

            feed = feedparser.parse(content)

            if feed.bozo and not feed.entries:
                logger.warning(f"[{source}] ⚠ 피드 파싱 불량 (bozo=True, 항목 없음): {url[:70]}")
                return []

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
                    "summary_raw": summary[:2000] if summary else "",
                    "url": link,
                    "source": source,
                    "category_hint": category,
                    "published_at": published,
                    "importance_score": self._calc_importance(title, summary, published),
                }
                results.append(news_item)
                count += 1

            logger.info(f"[{source}] ✓ {len(results)}개 수집 ({url[:60]}...)")

        except asyncio.TimeoutError:
            logger.warning(f"[{source}] ⚠ 타임아웃 (12s): {url[:70]}")
        except aiohttp.ClientError as e:
            logger.error(f"[{source}] ✗ 네트워크 오류: {type(e).__name__}: {e}")
        except Exception as e:
            logger.error(f"[{source}] ✗ 예상치 못한 오류: {type(e).__name__}: {e}")

        return results

    def _calc_importance(self, title: str, summary: str, published: str) -> int:
        """
        가중치 기반 중요도 스코어링 (0~15).

        점수 구성:
        - 제목 키워드 매칭: 가중치 × 2
        - 본문 키워드 매칭: 가중치 × 1
        - 발행 신선도 보너스: 12시간 이내 +3점, 24시간 이내 +1점
        """
        title_lower = title.lower()
        summary_lower = summary.lower()
        score = 0

        for keyword, weight in WEIGHTED_KEYWORDS:
            kw_lower = keyword.lower()
            if kw_lower in title_lower:
                score += weight * 2  # 제목 발견 시 2배
            elif kw_lower in summary_lower:
                score += weight

        # ── 신선도 보너스 ──
        if published:
            try:
                import email.utils
                pub_dt = email.utils.parsedate_to_datetime(published)
                # timezone-aware 비교
                now = datetime.now(timezone.utc)
                if pub_dt.tzinfo is None:
                    pub_dt = pub_dt.replace(tzinfo=timezone.utc)
                age_hours = (now - pub_dt).total_seconds() / 3600
                if age_hours <= 12:
                    score += 3
                elif age_hours <= 24:
                    score += 1
            except Exception:
                pass

        return min(score, 15)

    async def collect_all(self) -> List[Dict]:
        """전체 RSS 피드 동시 수집 후 중요도 순 정렬"""
        logger.info(f"📡 뉴스 수집 시작 — {len(RSS_FEEDS)}개 피드")
        start = datetime.now()

        connector = aiohttp.TCPConnector(limit=20, ssl=False)
        headers = {
            "User-Agent": "Mozilla/5.0 (compatible; AIStockBot/2.0; +https://github.com/ai-stock-news)",
            "Accept": "application/rss+xml, application/xml, text/xml, */*",
            "Accept-Language": "en-US,en;q=0.9,ko;q=0.8",
        }

        all_news = []
        async with aiohttp.ClientSession(connector=connector, headers=headers) as session:
            tasks = [
                self.fetch_feed(session, source, url, cat)
                for source, url, cat in RSS_FEEDS
            ]
            results = await asyncio.gather(*tasks, return_exceptions=True)

        for i, result in enumerate(results):
            if isinstance(result, Exception):
                source_name = RSS_FEEDS[i][0] if i < len(RSS_FEEDS) else "unknown"
                logger.error(f"[{source_name}] ✗ 피드 수집 태스크 예외: {result}")
            elif isinstance(result, list):
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
        logger.info(
            f"✅ 수집 완료: {len(all_news)}개 수집 → "
            f"중복제거 {len(unique_news)}개 → "
            f"선별+전처리 {len(selected)}개 ({elapsed:.1f}초)"
        )

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
