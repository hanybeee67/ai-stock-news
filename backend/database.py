"""
📁 backend/database.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Supabase 영구 저장소 연동 모듈

역할:
  - 일일 리포트를 Supabase PostgreSQL에 저장/조회
  - Supabase 미설정 시 로컬 파일 폴백 자동 전환
  - Render 컨테이너 재시작 후에도 데이터 영구 유지

환경변수:
  SUPABASE_URL         → 프로젝트 URL (필수)
  SUPABASE_SERVICE_KEY → Service Role Key (필수)

테이블 스키마 (Supabase SQL Editor에서 실행):
  CREATE TABLE daily_reports (
    id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    date         DATE UNIQUE NOT NULL,
    data         JSONB NOT NULL,
    generated_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE INDEX idx_daily_reports_date ON daily_reports (date DESC);
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, List, Dict, Any
from loguru import logger

# Supabase 클라이언트 (선택적 임포트 — 미설치 시 파일 폴백)
try:
    from supabase import create_client, Client as SupabaseClient
    _SUPABASE_AVAILABLE = True
except ImportError:
    _SUPABASE_AVAILABLE = False
    logger.warning("⚠ supabase 패키지 미설치 — 로컬 파일 모드로 동작합니다.")

# 로컬 파일 폴백 디렉토리
_FILE_DIR = Path("./data/reports")
_FILE_DIR.mkdir(parents=True, exist_ok=True)

# ─── Supabase 클라이언트 싱글톤 ─────────────────────────────────────
_supabase: Optional[Any] = None

def _get_supabase() -> Optional[Any]:
    """Supabase 클라이언트 반환 (미설정 시 None)"""
    global _supabase
    if _supabase is not None:
        return _supabase

    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_SERVICE_KEY", "").strip()

    if not url or not key:
        logger.info("📂 SUPABASE_URL/KEY 미설정 — 로컬 파일 모드")
        return None

    if not _SUPABASE_AVAILABLE:
        logger.warning("⚠ supabase 패키지 없음 — 로컬 파일 모드")
        return None

    try:
        _supabase = create_client(url, key)
        logger.info(f"✅ Supabase 연결 성공: {url[:40]}...")
        return _supabase
    except Exception as e:
        logger.error(f"❌ Supabase 연결 실패: {e}")
        return None


def is_supabase_enabled() -> bool:
    """Supabase 사용 가능 여부"""
    return _get_supabase() is not None


# ─── 리포트 저장 ─────────────────────────────────────────────────────
async def save_report(report: Dict[str, Any]) -> bool:
    """
    리포트를 Supabase에 저장 (없으면 로컬 파일에 저장).
    같은 날짜 리포트는 upsert (덮어쓰기).

    Returns:
        True = 저장 성공, False = 실패
    """
    date_str: str = report.get("date", datetime.now().strftime("%Y-%m-%d"))
    generated_at: str = report.get("generatedAt", datetime.now(timezone.utc).isoformat())

    # ── Supabase 저장 시도 ──────────────────────────────────────────
    client = _get_supabase()
    if client:
        try:
            result = client.table("daily_reports").upsert(
                {
                    "date": date_str,
                    "data": report,
                    "generated_at": generated_at,
                },
                on_conflict="date",  # 같은 날짜면 덮어쓰기
            ).execute()
            logger.info(f"✅ Supabase 저장 완료: {date_str}")
            # 로컬에도 백업 저장
            _save_file_backup(report, date_str)
            return True
        except Exception as e:
            logger.error(f"❌ Supabase 저장 실패: {e} — 로컬 파일로 폴백")

    # ── 로컬 파일 폴백 ──────────────────────────────────────────────
    return _save_file_backup(report, date_str)


def _save_file_backup(report: Dict, date_str: str) -> bool:
    """로컬 JSON 파일 저장 (폴백 + 백업)"""
    try:
        path = _FILE_DIR / f"report_{date_str}.json"
        with open(path, "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)
        logger.info(f"💾 로컬 파일 저장: {path}")
        return True
    except Exception as e:
        logger.error(f"❌ 로컬 파일 저장 실패: {e}")
        return False


# ─── 리포트 조회 ─────────────────────────────────────────────────────
def load_report(date_str: str) -> Optional[Dict[str, Any]]:
    """
    특정 날짜의 리포트 조회.
    Supabase → 로컬 파일 순으로 시도.
    """
    # ── Supabase 조회 ──────────────────────────────────────────────
    client = _get_supabase()
    if client:
        try:
            result = client.table("daily_reports") \
                .select("data") \
                .eq("date", date_str) \
                .maybe_single() \
                .execute()

            if result.data:
                logger.debug(f"✅ Supabase에서 로드: {date_str}")
                return result.data["data"]
        except Exception as e:
            logger.warning(f"⚠ Supabase 조회 실패: {e} — 로컬 파일 시도")

    # ── 로컬 파일 폴백 ──────────────────────────────────────────────
    return _load_file(date_str)


def _load_file(date_str: str) -> Optional[Dict]:
    """로컬 JSON 파일에서 리포트 로드"""
    path = _FILE_DIR / f"report_{date_str}.json"
    if path.exists():
        try:
            with open(path, encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"❌ 파일 읽기 오류 {path}: {e}")
    return None


def load_today_report() -> Optional[Dict[str, Any]]:
    """오늘 날짜(KST) 리포트 조회"""
    from datetime import timezone as tz
    kst_now = datetime.now(tz.utc).astimezone(
        __import__("zoneinfo", fromlist=["ZoneInfo"]).ZoneInfo("Asia/Seoul")
        if hasattr(__import__("zoneinfo"), "ZoneInfo") else tz.utc
    )
    today = kst_now.strftime("%Y-%m-%d")
    return load_report(today)


# ─── 히스토리 목록 ──────────────────────────────────────────────────
def load_history(limit: int = 7) -> List[Dict[str, Any]]:
    """
    최근 N일 리포트 요약 목록 반환.
    Supabase → 로컬 파일 순으로 시도.
    """
    # ── Supabase 조회 ──────────────────────────────────────────────
    client = _get_supabase()
    if client:
        try:
            result = client.table("daily_reports") \
                .select("date, data, generated_at") \
                .order("date", desc=True) \
                .limit(limit) \
                .execute()

            if result.data:
                logger.debug(f"✅ Supabase 히스토리 {len(result.data)}건 로드")
                return [_summarize_report(row["data"]) for row in result.data]
        except Exception as e:
            logger.warning(f"⚠ Supabase 히스토리 조회 실패: {e} — 로컬 파일 시도")

    # ── 로컬 파일 폴백 ──────────────────────────────────────────────
    return _load_history_from_files(limit)


def _load_history_from_files(limit: int) -> List[Dict]:
    """로컬 파일에서 히스토리 목록 구성"""
    reports = []
    for path in sorted(_FILE_DIR.glob("report_*.json"), reverse=True)[:limit]:
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
            reports.append(_summarize_report(data))
        except Exception as e:
            logger.warning(f"파일 읽기 실패 {path}: {e}")
    return reports


def _summarize_report(data: Dict) -> Dict:
    """리포트 전체 데이터에서 히스토리 카드용 요약 추출"""
    from collections import Counter
    top_news = data.get("topNews", [])
    confidences = [n.get("aiConfidence", 0) for n in top_news if n.get("aiConfidence")]
    avg_confidence = round(sum(confidences) / len(confidences), 1) if confidences else 0
    category_counts = Counter(n.get("category", "") for n in top_news if n.get("category"))
    top_categories = [cat for cat, _ in category_counts.most_common(3)]
    impacts = [n.get("marketImpact", "neutral") for n in top_news]
    impact_counter = Counter(impacts)
    dominant_impact = impact_counter.most_common(1)[0][0] if impact_counter else "neutral"

    return {
        "date": data.get("date"),
        "headline": data.get("headline", ""),
        "marketMood": data.get("marketMood", ""),
        "newsCount": len(top_news),
        "generatedAt": data.get("generatedAt"),
        "avgConfidence": avg_confidence,
        "topCategories": top_categories,
        "dominantImpact": dominant_impact,
    }


# ─── 스토리지 상태 확인 ────────────────────────────────────────────
def get_storage_info() -> Dict[str, Any]:
    """현재 스토리지 모드와 저장된 날짜 목록 반환"""
    mode = "supabase" if is_supabase_enabled() else "local_file"
    dates = []

    client = _get_supabase()
    if client:
        try:
            result = client.table("daily_reports") \
                .select("date") \
                .order("date", desc=True) \
                .limit(30) \
                .execute()
            dates = [row["date"] for row in result.data] if result.data else []
        except Exception:
            pass
    else:
        dates = sorted(
            [p.stem.replace("report_", "") for p in _FILE_DIR.glob("report_*.json")],
            reverse=True
        )[:30]

    return {"mode": mode, "availableDates": dates, "count": len(dates)}
