"""
📁 backend/main.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FastAPI 서버 — REST API + 자동 분석 스케줄러

API 엔드포인트:
  GET  /health              → 서버 상태 확인
  GET  /api/daily-report    → 오늘 AI 분석 리포트 반환
  POST /api/trigger-analysis → 즉시 분석 실행 (수동)
  GET  /api/reports/history  → 최근 7일 리포트 목록

스케줄:
  매일 오전 5시 30분 (KST) 자동 뉴스 수집 + AI 분석
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

import asyncio
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from contextlib import asynccontextmanager
from typing import Optional

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


# ─── 분석 파이프라인 ─────────────────────────────────────────────────
async def run_daily_pipeline() -> dict:
    """
    전체 분석 파이프라인 실행:
    1. RSS 뉴스 수집
    2. Claude AI 심층 분석
    3. 결과를 JSON 파일로 저장
    """
    global _is_analyzing
    if _is_analyzing:
        logger.warning("⚠ 이미 분석이 진행 중입니다. 중복 실행 방지.")
        return {"status": "already_running"}

    async with _analysis_lock:
        _is_analyzing = True
        try:
            logger.info("=" * 60)
            logger.info("🚀 일일 AI 분석 파이프라인 시작")
            logger.info(f"⏰ 실행 시각: {datetime.now().strftime('%Y-%m-%d %H:%M:%S KST')}")

            # Step 1: 뉴스 수집
            logger.info("📡 Step 1: 글로벌 뉴스 수집 중...")
            news_items = await collector.collect_all()

            if not news_items:
                raise RuntimeError("수집된 뉴스가 없습니다.")

            # Step 2: Claude AI 분석
            logger.info("🤖 Step 2: Claude AI 심층 분석 중...")
            report = await analyzer.analyze(news_items)

            # Step 3: 로컬 JSON 저장
            today = datetime.now().strftime("%Y-%m-%d")
            report_path = DATA_DIR / f"report_{today}.json"
            with open(report_path, "w", encoding="utf-8") as f:
                json.dump(report, f, ensure_ascii=False, indent=2)

            logger.info(f"💾 리포트 저장 완료: {report_path}")
            logger.info("=" * 60)
            return report

        except Exception as e:
            logger.error(f"❌ 파이프라인 실패: {e}")
            raise
        finally:
            _is_analyzing = False


def load_today_report() -> Optional[dict]:
    """오늘 날짜의 리포트 파일 로드"""
    today = datetime.now().strftime("%Y-%m-%d")
    path = DATA_DIR / f"report_{today}.json"
    if path.exists():
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return None


# ─── FastAPI 앱 생성 ────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """앱 시작/종료 라이프사이클"""
    global analyzer

    logger.info("🌅 AI 증시 브리핑 백엔드 시작 중...")

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
    description="Claude AI 기반 글로벌 증시 뉴스 분석 서버",
    version="1.0.0",
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
    """서버 상태 확인"""
    today_report = load_today_report()
    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "analyzer_ready": analyzer is not None,
        "today_report_ready": today_report is not None,
        "is_analyzing": _is_analyzing,
        "scheduled_jobs": len(scheduler.get_jobs()),
    }


@app.get("/api/daily-report")
async def get_daily_report():
    """
    오늘의 AI 분석 리포트 반환

    - 오늘 리포트가 있으면 즉시 반환
    - 없으면 즉시 생성 후 반환 (최대 60초 대기)
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
                detail="분석이 진행 중입니다. 잠시 후 다시 시도해주세요."
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


@app.post("/api/trigger-analysis")
async def trigger_analysis(background_tasks: BackgroundTasks):
    """
    수동으로 즉시 분석 실행 (백그라운드)
    분석 완료까지 기다리지 않고 즉시 응답 반환
    """
    if _is_analyzing:
        return {"success": False, "message": "이미 분석이 진행 중입니다."}

    if not analyzer:
        raise HTTPException(status_code=503, detail="AI 엔진이 초기화되지 않았습니다.")

    background_tasks.add_task(run_daily_pipeline)
    return {
        "success": True,
        "message": "분석이 백그라운드에서 시작됐습니다. 약 1~2분 후 /api/daily-report에서 결과를 확인하세요.",
    }


@app.get("/api/reports/history")
async def get_report_history():
    """최근 7일 분석 리포트 목록"""
    reports = []
    for path in sorted(DATA_DIR.glob("report_*.json"), reverse=True)[:7]:
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
            reports.append({
                "date": data.get("date"),
                "headline": data.get("headline"),
                "newsCount": len(data.get("topNews", [])),
                "generatedAt": data.get("generatedAt"),
            })
        except Exception:
            pass

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
