"""
📁 backend/text_cleaner.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
뉴스 원문 전처리 모듈

역할: Claude에게 넘기기 전에 노이즈를 제거하고
      순수 경제 팩트만 압축하여 토큰 낭비를 막는다.

처리 파이프라인:
  원문 텍스트
    → ① HTML 태그 제거
    → ② 광고·클릭베이트 문장 제거
    → ③ 인사말·구독 유도·법적 고지 제거
    → ④ 중복 공백·특수문자 정규화
    → ⑤ 중복 문장 제거
    → ⑥ 경제 팩트 문장만 추출 (숫자/기업명/지표 포함)
    → ⑦ 최대 토큰 길이 초과 시 앞부분 우선 트리밍
    → 압축된 팩트 텍스트 반환
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

import re
import html
from typing import List, Dict
from loguru import logger


# ══════════════════════════════════════════════════════════
# ① 제거 대상 패턴 사전
# ══════════════════════════════════════════════════════════

# 광고·클릭베이트 문장 패턴 (대소문자 무시)
_AD_PATTERNS: List[str] = [
    # 구독 유도
    r"subscribe\s*(now|today|here|free|to\s+our)",
    r"sign\s*up\s*(for|to)\s*(our|free|newsletter)",
    r"click\s+here\s+to\s+(read|see|learn|get)",
    r"read\s+more(\s+at|\s+on|\s+about)?",
    r"(follow|like)\s+us\s+on\s+(twitter|facebook|instagram|linkedin)",
    r"share\s+this\s+(article|story|post)",
    r"(more|related)\s+stories?",
    r"also\s+read[:\s]",
    r"don['']t\s+miss",
    r"you\s+may\s+also\s+(like|be\s+interested)",
    # 뉴스레터·알림
    r"get\s+the\s+(latest|best|top)\s+(news|updates|stories)",
    r"(weekly|daily|morning|evening)\s+(newsletter|briefing|digest|roundup)",
    r"enable\s+(notifications?|alerts?)",
    r"push\s+notifications?",
    # 쿠키·개인정보
    r"we\s+use\s+cookies",
    r"privacy\s+policy",
    r"terms\s+(of\s+)?(use|service)",
    r"cookie\s+(policy|consent|settings?)",
    r"gdpr",
    # 저작권·면책
    r"all\s+rights?\s+reserved",
    r"©\s*\d{4}",
    r"copyright\s+\d{4}",
    r"this\s+article\s+(first\s+appeared|was\s+originally\s+published)",
    r"reprints?\s+and\s+permissions?",
    r"reproduction\s+(in\s+whole|without\s+permission)",
    # 투자 면책
    r"this\s+is\s+not\s+(financial|investment|legal)\s+advice",
    r"not\s+responsible\s+for\s+(any\s+)?(loss|damage|investment)",
    r"(past|previous)\s+performance\s+(is\s+)?(not|no)\s+(guarantee|indicator)",
    r"invest(ors?|ing)?\s+should\s+consult",
    # 소셜·광고
    r"sponsored\s+(content|post|by)",
    r"advertisement",
    r"paid\s+(content|partnership|promotion)",
    r"affiliate\s+(link|disclosure)",
    r"\[?(ad|advertisement|sponsored)\]?",
]

# 인사말·boilerplate 문장 패턴
_BOILERPLATE_PATTERNS: List[str] = [
    r"^(good\s+)?(morning|afternoon|evening|day)[,\s!]*",
    r"^(dear\s+)?(readers?|subscribers?|investors?|friends?)[,\s]",
    r"^(welcome\s+to|thank\s+you\s+for\s+reading)",
    r"^(here[''']?s?\s+(what|everything)\s+you\s+need\s+to\s+know)",
    r"^(today[''']?s?\s+(top|main|key)\s+(stories?|headlines?|news))",
    r"^(let[''']?s?\s+(dive\s+in|get\s+started|take\s+a\s+look))",
    r"(in\s+this\s+(article|piece|post|newsletter)[\s,].*?(we|i)\s+will)",
    r"^(if\s+you\s+(enjoyed|liked|found)\s+this)",
    r"^(for\s+more\s+(news|updates|stories|information)[,\s])",
    r"^(questions?|comments?|feedback)[?\s]",
    r"^(to\s+unsubscribe|manage\s+your\s+(preferences?|subscription))",
    # 한국어 boilerplate
    r"^(안녕하세요|반갑습니다|구독해\s*주셔서\s*감사합니다)",
    r"(뉴스레터를\s*구독)",
    r"(광고\s*문의|제보\s*하기|구독\s*신청)",
    r"(저작권자\s*©|무단\s*전재\s*.*?재배포\s*금지)",
    r"(본\s*기사는\s*(투자|금융)\s*참고용)",
]

# 기자 바이라인 패턴
_BYLINE_PATTERNS: List[str] = [
    r"^by\s+[A-Z][a-z]+(\s+[A-Z][a-z]+){1,3}$",
    r"^[A-Z][a-z]+(\s+[A-Z][a-z]+){1,3}\s*[|/]\s*(reuters|bloomberg|ap|ft|cnbc)",
    r"(reporting|writing|editing)\s+by\s+[A-Z]",
    r"(기자|특파원|편집자)\s*[=|]\s*\S+",
]

# 경제 팩트 포함 문장 판별 기준 — 이 중 하나라도 매칭되면 '팩트 문장'으로 분류
_FACT_INDICATORS: List[str] = [
    # 숫자·퍼센트·통화
    r"\d+\.?\d*\s*(%|percent|bp|basis\s*points?|bps)",
    r"(\$|€|£|¥|₩)\s*\d+",
    r"\d+\s*(billion|million|trillion|bn|mn|tn|조|억|만)",
    r"\d{4}년|\d+분기|Q[1-4]\s*\d{4}",
    # 경제 지표 키워드
    r"\b(GDP|CPI|PPI|PMI|PCE|NFP|FOMC|ECB|BOJ|Fed|금리|인플레이션|실업률|무역적자|경상수지)\b",
    # 기업·시장 행동
    r"\b(인수|합병|M&A|IPO|파산|구조조정|감원|증설|투자|수출|수입|생산|출하|재고)\b",
    r"\b(acquisition|merger|bankruptcy|layoff|expansion|output|shipment|inventory)\b",
    # 원자재·에너지
    r"\b(oil|crude|WTI|Brent|LNG|natural\s+gas|copper|lithium|cobalt|nickel|wheat|soybean|corn)\b",
    r"\b(원유|천연가스|구리|리튬|코발트|니켈|밀|대두|옥수수|희토류|팔라듐|우라늄)\b",
    # 정책·규제
    r"\b(tariff|sanction|subsidy|ban|regulation|legislation|bill|act|policy|treaty)\b",
    r"\b(관세|제재|보조금|규제|법안|정책|협약|조약|수출규제|인허가)\b",
    # 기업명 (대문자 약어 또는 유명 기업)
    r"\b(TSMC|NVIDIA|Samsung|Tesla|Apple|ASML|Intel|Qualcomm|CATL|BYD|삼성|SK하이닉스|현대|LG)\b",
    # 시장 방향
    r"\b(surged?|plunged?|soared?|tumbled?|rallied?|slumped?|collapsed?|spiked?)\b",
    r"\b(급등|급락|폭등|폭락|상승|하락|반등|조정)\b",
]


# ══════════════════════════════════════════════════════════
# ② 컴파일된 정규식 캐시
# ══════════════════════════════════════════════════════════

_re_html_tag    = re.compile(r"<[^>]+>")
_re_html_entity = re.compile(r"&[a-zA-Z]{2,6};|&#\d+;")
_re_url         = re.compile(r"https?://\S+|www\.\S+")
_re_whitespace  = re.compile(r"[ \t]{2,}")
_re_blank_lines = re.compile(r"\n{3,}")
_re_bullet      = re.compile(r"^[\s]*[-•·▸▶→*]+\s+", re.MULTILINE)

_re_ad          = re.compile("|".join(_AD_PATTERNS), re.IGNORECASE)
_re_boilerplate = re.compile("|".join(_BOILERPLATE_PATTERNS), re.IGNORECASE | re.MULTILINE)
_re_byline      = re.compile("|".join(_BYLINE_PATTERNS), re.IGNORECASE | re.MULTILINE)
_re_fact        = re.compile("|".join(_FACT_INDICATORS), re.IGNORECASE)

# 문장 분리 (마침표/느낌표/물음표 뒤 공백 기준)
_re_sentence_split = re.compile(r"(?<=[.!?])\s+")


# ══════════════════════════════════════════════════════════
# ③ 단계별 클리닝 함수
# ══════════════════════════════════════════════════════════

def _strip_html(text: str) -> str:
    """HTML 태그 및 엔티티 제거"""
    text = _re_html_tag.sub(" ", text)
    text = html.unescape(text)
    text = _re_html_entity.sub(" ", text)
    return text


def _strip_urls(text: str) -> str:
    """URL 제거"""
    return _re_url.sub("", text)


def _strip_ads(text: str) -> str:
    """광고·클릭베이트 문구 제거 (문장 단위)"""
    sentences = _re_sentence_split.split(text)
    cleaned = [s for s in sentences if not _re_ad.search(s)]
    return " ".join(cleaned)


def _strip_boilerplate(text: str) -> str:
    """인사말·구독 유도·저작권 고지 제거"""
    text = _re_boilerplate.sub("", text)
    text = _re_byline.sub("", text)
    return text


def _normalize_whitespace(text: str) -> str:
    """공백 정규화"""
    text = _re_bullet.sub("", text)       # 글머리 기호 제거
    text = _re_whitespace.sub(" ", text)   # 연속 공백 → 단일 공백
    text = _re_blank_lines.sub("\n\n", text)  # 과도한 빈 줄 압축
    return text.strip()


def _deduplicate_sentences(text: str) -> str:
    """중복 문장 제거 (순서 유지)"""
    sentences = _re_sentence_split.split(text)
    seen: set = set()
    unique: List[str] = []
    for s in sentences:
        key = re.sub(r"\s+", "", s.lower())  # 공백 무시 비교
        if key and key not in seen:
            seen.add(key)
            unique.append(s.strip())
    return " ".join(unique)


def _extract_fact_sentences(text: str, min_length: int = 20) -> str:
    """
    경제 팩트 지표(숫자/기업명/경제 키워드)를 포함한 문장만 추출.
    지표가 없는 문장은 제거하여 Claude 입력 품질을 높임.

    Args:
        text:       전처리된 텍스트
        min_length: 이 글자 수 미만 문장은 무조건 제거
    """
    sentences = _re_sentence_split.split(text)
    facts: List[str] = []
    for s in sentences:
        s = s.strip()
        if len(s) < min_length:
            continue
        if _re_fact.search(s):
            facts.append(s)
    # 팩트 문장이 너무 적으면(3개 미만) 원문 문장도 일부 포함
    if len(facts) < 3:
        non_facts = [
            s.strip() for s in sentences
            if s.strip() and len(s.strip()) >= min_length and s.strip() not in facts
        ]
        facts.extend(non_facts[:5])
    return " ".join(facts)


def _trim_to_token_budget(text: str, max_chars: int = 800) -> str:
    """
    Claude 토큰 예산에 맞게 텍스트 트리밍.
    앞부분(핵심 팩트)을 우선 보존하고 뒷부분을 잘라낸다.

    Args:
        text:      처리된 텍스트
        max_chars: 최대 문자 수 (기본 800 ≒ ~200 토큰)
    """
    if len(text) <= max_chars:
        return text
    # 문장 단위로 잘라서 한도 내 최대한 포함
    sentences = _re_sentence_split.split(text)
    result: List[str] = []
    total = 0
    for s in sentences:
        if total + len(s) + 1 > max_chars:
            break
        result.append(s)
        total += len(s) + 1
    return " ".join(result) + ("…" if len(result) < len(sentences) else "")


# ══════════════════════════════════════════════════════════
# ④ 공개 인터페이스
# ══════════════════════════════════════════════════════════

def clean_news_text(raw: str, max_chars: int = 800) -> str:
    """
    단일 뉴스 본문 텍스트를 순수 경제 팩트로 압축.

    Pipeline:
        HTML 제거 → URL 제거 → 광고 제거 → Boilerplate 제거
        → 공백 정규화 → 중복 제거 → 팩트 문장 추출 → 트리밍

    Args:
        raw:       RSS summary 또는 크롤링된 원문
        max_chars: Claude에 전달할 최대 문자 수

    Returns:
        압축된 경제 팩트 문자열 (빈 문자열이면 원문 제목 사용 권장)
    """
    if not raw or not raw.strip():
        return ""

    text = _strip_html(raw)
    text = _strip_urls(text)
    text = _strip_ads(text)
    text = _strip_boilerplate(text)
    text = _normalize_whitespace(text)
    text = _deduplicate_sentences(text)
    text = _extract_fact_sentences(text)
    text = _trim_to_token_budget(text, max_chars)
    return text


def clean_news_batch(news_items: list, max_chars: int = 800) -> list:
    """
    뉴스 딕셔너리 리스트 전체를 일괄 전처리.
    `summary_raw` 필드를 정제하여 `summary_clean` 필드로 추가.

    Args:
        news_items: news_collector.collect_all()의 반환값
        max_chars:  뉴스 1건당 최대 문자 수

    Returns:
        `summary_clean` 필드가 추가된 뉴스 딕셔너리 리스트
    """
    total_raw   = 0
    total_clean = 0
    results = []

    for item in news_items:
        raw = item.get("summary_raw", "")
        cleaned = clean_news_text(raw, max_chars=max_chars)

        # 전처리 후 빈 문자열이 되면 제목을 fallback으로 사용
        if not cleaned:
            cleaned = item.get("title", "")
            logger.debug(f"[TextCleaner] fallback to title: {cleaned[:50]}")

        total_raw   += len(raw)
        total_clean += len(cleaned)

        results.append({**item, "summary_clean": cleaned})

    # 압축률 로깅
    if total_raw > 0:
        ratio = (1 - total_clean / total_raw) * 100
        logger.info(
            f"[TextCleaner] ✅ {len(news_items)}건 전처리 완료 | "
            f"원문 {total_raw:,}자 → 압축 {total_clean:,}자 ({ratio:.1f}% 절감)"
        )

    return results


def preview_cleaning(raw: str) -> None:
    """
    개발·디버깅용: 전처리 전/후 비교 출력

    Usage:
        from text_cleaner import preview_cleaning
        preview_cleaning(some_raw_text)
    """
    cleaned = clean_news_text(raw)
    bar = "─" * 60
    print(f"\n{bar}")
    print(f"[원문] {len(raw):,}자")
    print(raw[:400])
    print(f"\n{bar}")
    print(f"[압축] {len(cleaned):,}자  ({(1 - len(cleaned)/max(len(raw),1))*100:.1f}% 절감)")
    print(cleaned)
    print(bar)


# ══════════════════════════════════════════════════════════
# ⑤ 독립 실행 테스트
# ══════════════════════════════════════════════════════════

if __name__ == "__main__":
    SAMPLE = """
    <p>Good morning, dear readers! Subscribe to our daily newsletter for the latest updates.</p>
    By John Smith | Reuters
    Click here to read more about today's top market stories.

    The U.S. Federal Reserve signaled it may raise interest rates by 25bp at its next FOMC meeting,
    citing persistent CPI inflation running at 3.4% year-over-year. The decision follows weaker-than-
    expected NFP data showing only 120,000 jobs added in April.

    NVIDIA Corp (NVDA) surged 8.2% after reporting Q1 2026 revenue of $26.1 billion, beating
    analyst estimates of $24.6 billion. The company cited explosive demand for AI data center chips.

    Meanwhile, TSMC raised its 2026 capital expenditure guidance to $38 billion, up from prior
    estimates of $32 billion, to expand advanced packaging capacity for HBM3E memory chips.

    Don't miss our premium analysis. Sign up now for free!
    © 2026 Reuters. All rights reserved. This article is not financial advice.
    We use cookies to improve your experience. Privacy Policy | Terms of Use.
    Follow us on Twitter and LinkedIn for more updates.
    """

    preview_cleaning(SAMPLE)
