"""
📁 backend/main.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FastAPI 서버 — REST API + 자동 분석 스케줄러

API 엔드포인트:
  GET  /health              → 서버 상태 확인
  GET  /api/status          → 상세 서버 상태 (분석 진행률, 다음 실행 시각 등)
  GET  /api/daily-report    → 오늘 AI 분석 리포트 반환
  POST /api/trigger-analysis → 즉시 분석 실행 (수동)
  GET  /api/reports/history  → 최근 7일 리포트 목록 (강화됨)

스케줄:
  매일 오전 5시 30분 (KST) 자동 뉴스 수집 + AI 분석

변경사항 (v2.0):
- 분석 파이프라인 타임아웃 300초 추가
- /api/status 엔드포인트 신설
- /api/reports/history 응답 필드 강화
- 에러 메시지 추적 기능 추가
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

import asyncio
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from contextlib import asynccontextmanager
from typing import Optional, List

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from dotenv import load_dotenv
from loguru import logger

from news_collector import NewsCollector
from ai_analyzer import AIAnalyzer

# ─── 환경변수 로드 ─────────────────────────────────────────────────
load_dotenv()

# ─── 데이터 저장 디렉토리 ────────────────────────────────────────────
DATA_DIR = Path("./data/reports")
DATA_DIR.mkdir(parents=True, exist_ok=True)

# ─── 싱글톤 인스턴스 ─────────────────────────────────────────────────
collector = NewsCollector()
analyzer: Optional[AIAnalyzer] = None
scheduler = AsyncIOScheduler(timezone="Asia/Seoul")
_analysis_lock = asyncio.Lock()
_is_analyzing = False
_analysis_progress: str = ""   # 현재 분석 단계 메시지
_last_error: Optional[str] = None  # 최근 에러 메시지
_analysis_started_at: Optional[str] = None  # 분석 시작 시각


# ─── 분석 파이프라인 ─────────────────────────────────────────────────
async def run_daily_pipeline() -> dict:
    """
    전체 분석 파이프라인 실행:
    1. RSS 뉴스 수집
    2. Claude AI 심층 분석
    3. 결과를 JSON 파일로 저장
    (타임아웃: 300초)
    """
    global _is_analyzing, _analysis_progress, _last_error, _analysis_started_at

    if _is_analyzing:
        logger.warning("⚠ 이미 분석이 진행 중입니다. 중복 실행 방지.")
        return {"status": "already_running"}

    async with _analysis_lock:
        _is_analyzing = True
        _analysis_started_at = datetime.now(timezone.utc).isoformat()
        _last_error = None

        try:
            logger.info("=" * 60)
            logger.info("🚀 일일 AI 분석 파이프라인 시작")
            logger.info(f"⏰ 실행 시각: {datetime.now().strftime('%Y-%m-%d %H:%M:%S KST')}")

            # ── Step 1: 뉴스 수집 ──────────────────────────────────────
            _analysis_progress = "📡 글로벌 뉴스 수집 중..."
            logger.info(f"📡 Step 1: {_analysis_progress}")

            try:
                news_items = await asyncio.wait_for(
                    collector.collect_all(),
                    timeout=120  # 뉴스 수집 최대 2분
                )
            except asyncio.TimeoutError:
                raise RuntimeError("뉴스 수집 타임아웃 (120초 초과)")

            if not news_items:
                raise RuntimeError("수집된 뉴스가 없습니다.")

            logger.info(f"✅ {len(news_items)}개 뉴스 수집 완료")

            # ── Step 2: Claude AI 분석 ─────────────────────────────────
            _analysis_progress = f"🤖 Claude AI 심층 분석 중... ({len(news_items)}개 뉴스)"
            logger.info(f"🤖 Step 2: {_analysis_progress}")

            try:
                report = await asyncio.wait_for(
                    analyzer.analyze(news_items),
                    timeout=240  # AI 분석 최대 4분
                )
            except asyncio.TimeoutError:
                raise RuntimeError("AI 분석 타임아웃 (240초 초과)")

            # ── Step 3: 로컬 JSON 저장 ─────────────────────────────────
            _analysis_progress = "💾 리포트 저장 중..."
            today = datetime.now().strftime("%Y-%m-%d")
            report_path = DATA_DIR / f"report_{today}.json"
            with open(report_path, "w", encoding="utf-8") as f:
                json.dump(report, f, ensure_ascii=False, indent=2)

            _analysis_progress = "✅ 분석 완료!"
            logger.info(f"💾 리포트 저장 완료: {report_path}")
            logger.info("=" * 60)
            return report

        except Exception as e:
            _last_error = str(e)
            _analysis_progress = f"❌ 오류 발생: {str(e)[:100]}"
            logger.error(f"❌ 파이프라인 실패: {e}")
            raise
        finally:
            _is_analyzing = False


def load_today_report() -> Optional[dict]:
    """오늘 날짜의 리포트 파일 로드"""
    today = datetime.now().strftime("%Y-%m-%d")
    path = DATA_DIR / f"report_{today}.json"
    if path.exists():
        try:
            with open(path, encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"리포트 파일 읽기 실패: {e}")
    return None


def load_report_by_date(date: str) -> Optional[dict]:
    """특정 날짜의 리포트 파일 로드"""
    path = DATA_DIR / f"report_{date}.json"
    if path.exists():
        try:
            with open(path, encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return None


# ─── FastAPI 앱 생성 ────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """앱 시작/종료 라이프사이클"""
    global analyzer

    logger.info("🌅 AI 증시 브리핑 백엔드 v2.0 시작 중...")

    # AIAnalyzer 초기화
    try:
        analyzer = AIAnalyzer()
        logger.info("✅ Claude AI 엔진 초기화 완료")
    except Exception as e:
        logger.error(f"❌ AIAnalyzer 초기화 실패: {e}")

    # 스케줄러 등록 (매일 KST 5:30)
    analysis_hour = int(os.getenv("ANALYSIS_HOUR", "5"))
    analysis_minute = int(os.getenv("ANALYSIS_MINUTE", "30"))
    scheduler.add_job(
        run_daily_pipeline,
        trigger=CronTrigger(hour=analysis_hour, minute=analysis_minute, timezone="Asia/Seoul"),
        id="daily_analysis",
        replace_existing=True,
    )
    scheduler.start()
    logger.info(f"📅 스케줄러 등록: 매일 {analysis_hour:02d}:{analysis_minute:02d} KST 자동 분석")

    # 오늘 리포트가 없으면 즉시 실행
    if not load_today_report() and analyzer:
        logger.info("📌 오늘 리포트가 없습니다. 즉시 분석을 시작합니다...")
        asyncio.create_task(run_daily_pipeline())

    yield  # 앱 실행

    # 종료 시 정리
    scheduler.shutdown(wait=False)
    logger.info("👋 서버 종료")


app = FastAPI(
    title="AI 증시 브리핑 API",
    description="Claude AI 기반 글로벌 증시 뉴스 분석 서버 v2.0",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS 설정 (모바일 앱에서 접근 허용)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── API 엔드포인트 ─────────────────────────────────────────────────

@app.get("/health")
async def health_check():
    """서버 기본 상태 확인"""
    today_report = load_today_report()
    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "analyzer_ready": analyzer is not None,
        "today_report_ready": today_report is not None,
        "is_analyzing": _is_analyzing,
        "scheduled_jobs": len(scheduler.get_jobs()),
    }


@app.get("/api/status")
async def get_status():
    """
    상세 서버 상태 — 모바일 설정 화면용
    분석 진행률, 다음 스케줄 실행 시각, 최근 에러 등 포함
    """
    # 다음 스케줄 실행 시각
    next_run_time = None
    jobs = scheduler.get_jobs()
    if jobs:
        job = jobs[0]
        next_fire = job.next_run_time
        if next_fire:
            next_run_time = next_fire.isoformat()

    # 저장된 리포트 날짜 목록
    report_dates = sorted(
        [p.stem.replace("report_", "") for p in DATA_DIR.glob("report_*.json")],
        reverse=True
    )[:7]

    today_report = load_today_report()

    return JSONResponse(content={
        "success": True,
        "data": {
            "serverVersion": "2.0.0",
            "analyzerReady": analyzer is not None,
            "isAnalyzing": _is_analyzing,
            "analysisProgress": _analysis_progress,
            "analysisStartedAt": _analysis_started_at,
            "lastError": _last_error,
            "todayReportReady": today_report is not None,
            "todayReportGeneratedAt": today_report.get("generatedAt") if today_report else None,
            "nextScheduledAt": next_run_time,
            "availableReportDates": report_dates,
            "scheduledJobCount": len(jobs),
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })


@app.get("/api/daily-report")
async def get_daily_report():
    """
    오늘의 AI 분석 리포트 반환

    - 오늘 리포트가 있으면 즉시 반환
    - 없으면 즉시 생성 후 반환
    """
    report = load_today_report()

    if not report:
        if not analyzer:
            raise HTTPException(
                status_code=503,
                detail="AI 엔진이 초기화되지 않았습니다. ANTHROPIC_API_KEY를 확인하세요."
            )
        if _is_analyzing:
            raise HTTPException(
                status_code=202,
                detail={
                    "message": "분석이 진행 중입니다. 잠시 후 다시 시도해주세요.",
                    "progress": _analysis_progress,
                }
            )
        # 즉시 생성
        try:
            report = await run_daily_pipeline()
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"분석 실패: {str(e)}")

    return JSONResponse(content={
        "success": True,
        "data": report,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })


@app.get("/api/daily-report/{date}")
async def get_report_by_date(date: str):
    """
    특정 날짜의 AI 분석 리포트 반환 (YYYY-MM-DD 형식)
    히스토리 화면에서 날짜 선택 시 사용
    """
    report = load_report_by_date(date)
    if not report:
        raise HTTPException(status_code=404, detail=f"{date} 날짜의 리포트가 없습니다.")

    return JSONResponse(content={
        "success": True,
        "data": report,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })


@app.post("/api/trigger-analysis")
async def trigger_analysis(background_tasks: BackgroundTasks):
    """
    수동으로 즉시 분석 실행 (백그라운드)
    분석 완료까지 기다리지 않고 즉시 응답 반환
    """
    if _is_analyzing:
        return {
            "success": False,
            "message": "이미 분석이 진행 중입니다.",
            "progress": _analysis_progress,
        }

    if not analyzer:
        raise HTTPException(status_code=503, detail="AI 엔진이 초기화되지 않았습니다.")

    background_tasks.add_task(run_daily_pipeline)
    return {
        "success": True,
        "message": "분석이 백그라운드에서 시작됐습니다. 약 1~3분 후 /api/daily-report에서 결과를 확인하세요.",
    }


@app.get("/api/reports/history")
async def get_report_history():
    """
    최근 7일 분석 리포트 목록 (강화됨)
    marketMood, avgConfidence, topCategories 추가 반환
    """
    reports = []
    for path in sorted(DATA_DIR.glob("report_*.json"), reverse=True)[:7]:
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)

            top_news = data.get("topNews", [])

            # 평균 AI 신뢰도
            confidences = [n.get("aiConfidence", 0) for n in top_news if n.get("aiConfidence")]
            avg_confidence = round(sum(confidences) / len(confidences), 1) if confidences else 0

            # 상위 카테고리
            from collections import Counter
            category_counts = Counter(n.get("category", "") for n in top_news if n.get("category"))
            top_categories = [cat for cat, _ in category_counts.most_common(3)]

            # 시장 분위기 요약 (bullish/bearish/neutral 비율)
            impacts = [n.get("marketImpact", "neutral") for n in top_news]
            impact_counter = Counter(impacts)
            dominant_impact = impact_counter.most_common(1)[0][0] if impact_counter else "neutral"

            reports.append({
                "date": data.get("date"),
                "headline": data.get("headline"),
                "marketMood": data.get("marketMood", ""),
                "newsCount": len(top_news),
                "generatedAt": data.get("generatedAt"),
                "avgConfidence": avg_confidence,
                "topCategories": top_categories,
                "dominantImpact": dominant_impact,
            })
        except Exception as e:
            logger.warning(f"히스토리 파일 읽기 실패 {path}: {e}")

    return JSONResponse(content={
        "success": True,
        "data": reports,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })


# ─── 서버 실행 ────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "8000")),
        log_level=os.getenv("LOG_LEVEL", "info"),
        reload=False,
    )
