"""
📁 backend/main.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FastAPI 서버 — REST API + 자동 분석 스케줄러

API 엔드포인트:
  GET  /health              → 서버 상태 확인
  GET  /api/status          → 상세 서버 상태
  GET  /api/daily-report    → 오늘 AI 분석 리포트
  GET  /api/daily-report/{date} → 특정 날짜 리포트
  POST /api/trigger-analysis → 즉시 분석 실행 (수동)
  GET  /api/reports/history  → 최근 7일 리포트 목록

v2.1: Supabase 영구 저장 연동 (database.py)
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
import yfinance as yf
import requests

from news_collector import NewsCollector
from ai_analyzer import AIAnalyzer
import database as db

# ─── 환경변수 로드 ─────────────────────────────────────────────────
load_dotenv()

# ─── 싱글톤 인스턴스 ─────────────────────────────────────────────────
collector = NewsCollector()
analyzer: Optional[AIAnalyzer] = None
scheduler = AsyncIOScheduler(timezone="Asia/Seoul")
_analysis_lock = asyncio.Lock()
_is_analyzing = False
_analysis_progress: str = ""
_last_error: Optional[str] = None
_analysis_started_at: Optional[str] = None


# ─── 분석 파이프라인 ─────────────────────────────────────────────────
async def run_daily_pipeline() -> dict:
    """
    전체 분석 파이프라인:
    1. RSS 뉴스 수집
    2. Claude AI 심층 분석
    3. Supabase 저장 (폴백: 로컬 파일)
    """
    global _is_analyzing, _analysis_progress, _last_error, _analysis_started_at

    if _is_analyzing:
        logger.warning("⚠ 이미 분석이 진행 중입니다.")
        return {"status": "already_running"}

    async with _analysis_lock:
        _is_analyzing = True
        _analysis_started_at = datetime.now(timezone.utc).isoformat()
        _last_error = None

        try:
            logger.info("=" * 60)
            logger.info("🚀 일일 AI 분석 파이프라인 시작")
            logger.info(f"⏰ {datetime.now().strftime('%Y-%m-%d %H:%M:%S KST')}")
            logger.info(f"💾 스토리지 모드: {'Supabase' if db.is_supabase_enabled() else '로컬 파일'}")

            # Step 1: 뉴스 수집
            _analysis_progress = "📡 글로벌 뉴스 수집 중..."
            logger.info(f"Step 1: {_analysis_progress}")
            try:
                news_items = await asyncio.wait_for(collector.collect_all(), timeout=180)
            except asyncio.TimeoutError:
                raise RuntimeError("뉴스 수집 타임아웃 (180초)")

            if not news_items:
                raise RuntimeError("수집된 뉴스가 없습니다.")

            # Claude 입력량 제한: 중요도 상위 30개만 선별 (응답 시간 단축)
            MAX_NEWS = int(os.getenv("MAX_NEWS_COUNT", "30"))
            if len(news_items) > MAX_NEWS:
                news_items = sorted(
                    news_items,
                    key=lambda x: x.get("importance_score", 0),
                    reverse=True
                )[:MAX_NEWS]
                logger.info(f"📌 뉴스 {len(news_items)}개로 제한 (상위 중요도 기준)")
            else:
                logger.info(f"✅ {len(news_items)}개 뉴스 수집")

            # Step 2: Claude AI 분석
            _analysis_progress = f"🤖 Claude AI 분석 중... ({len(news_items)}개)"
            logger.info(f"Step 2: {_analysis_progress}")
            try:
                report = await asyncio.wait_for(analyzer.analyze(news_items), timeout=480)
            except asyncio.TimeoutError:
                raise RuntimeError("AI 분석 타임아웃 (480초) — 뉴스 수를 줄이거나 MAX_NEWS_COUNT 환경변수를 조정하세요")

            # Step 3: Supabase 저장 (폴백: 로컬 파일)
            _analysis_progress = "💾 데이터 저장 중..."
            logger.info(f"Step 3: {_analysis_progress}")
            await db.save_report(report)

            _analysis_progress = "✅ 분석 완료!"
            logger.info("=" * 60)
            return report

        except Exception as e:
            _last_error = str(e)
            _analysis_progress = f"❌ 오류: {str(e)[:100]}"
            logger.error(f"❌ 파이프라인 실패: {e}")
            raise
        finally:
            _is_analyzing = False


# ─── FastAPI 앱 ────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    global analyzer

    logger.info("🌅 AI 증시 브리핑 백엔드 v2.1 시작...")

    # Supabase 연결 확인
    storage_info = db.get_storage_info()
    logger.info(f"💾 스토리지: {storage_info['mode']} | 저장된 리포트: {storage_info['count']}건")

    # AIAnalyzer 초기화
    try:
        analyzer = AIAnalyzer()
        logger.info(f"✅ Gemini AI 엔진 초기화 완료 (모델: {analyzer.model})")
    except Exception as e:
        logger.error(f"❌ AIAnalyzer 초기화 실패: {e}")

    # 스케줄러 등록
    analysis_hour = int(os.getenv("ANALYSIS_HOUR", "5"))
    analysis_minute = int(os.getenv("ANALYSIS_MINUTE", "30"))
    scheduler.add_job(
        run_daily_pipeline,
        trigger=CronTrigger(hour=analysis_hour, minute=analysis_minute, timezone="Asia/Seoul"),
        id="daily_analysis",
        replace_existing=True,
    )
    scheduler.start()
    logger.info(f"📅 스케줄러: 매일 {analysis_hour:02d}:{analysis_minute:02d} KST")

    # 오늘 리포트 없으면 즉시 실행
    if not db.load_today_report() and analyzer:
        logger.info("📌 오늘 리포트 없음 → 즉시 분석 시작")
        asyncio.create_task(run_daily_pipeline())

    yield

    scheduler.shutdown(wait=False)
    logger.info("👋 서버 종료")


app = FastAPI(
    title="AI 증시 브리핑 API",
    description="Gemini AI 기반 글로벌 증시 뉴스 분석 서버 v2.2",
    version="2.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── 엔드포인트 ───────────────────────────────────────────────────

@app.get("/")
async def root():
    return {
        "message": "AI 증시 브리핑 백엔드 서버가 정상 작동 중입니다.",
        "status": "running",
        "docs_url": "/docs"
    }

@app.get("/health")
async def health_check():
    today_report = db.load_today_report()
    storage_info = db.get_storage_info()
    return {
        "status": "ok",
        "version": "2.1.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "analyzer_ready": analyzer is not None,
        "today_report_ready": today_report is not None,
        "is_analyzing": _is_analyzing,
        "storage_mode": storage_info["mode"],
        "scheduled_jobs": len(scheduler.get_jobs()),
    }


@app.get("/api/status")
async def get_status():
    jobs = scheduler.get_jobs()
    next_run_time = jobs[0].next_run_time.isoformat() if jobs and jobs[0].next_run_time else None
    storage_info = db.get_storage_info()
    today_report = db.load_today_report()

    return JSONResponse(content={
        "success": True,
        "data": {
            "serverVersion": "2.2.0",
            "analyzerReady": analyzer is not None,
            "geminiModel": analyzer.model if analyzer else None,
            "isAnalyzing": _is_analyzing,
            "analysisProgress": _analysis_progress,
            "analysisStartedAt": _analysis_started_at,
            "lastError": _last_error,
            "todayReportReady": today_report is not None,
            "todayReportGeneratedAt": today_report.get("generatedAt") if today_report else None,
            "nextScheduledAt": next_run_time,
            "storageMode": storage_info["mode"],
            "availableReportDates": storage_info["availableDates"][:7],
            "scheduledJobCount": len(jobs),
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })


@app.get("/api/daily-report")
async def get_daily_report():
    from zoneinfo import ZoneInfo
    kst_now = datetime.now(ZoneInfo("Asia/Seoul"))
    today_str = kst_now.strftime("%Y-%m-%d")

    report = db.load_today_report()

    # 리포트가 있어도 오늘 날짜가 아니면 재분석 트리거
    if report and report.get("date") != today_str:
        logger.info(f"📅 기존 리포트는 {report.get('date')} 것 → 오늘({today_str}) 새 분석 필요")
        report = None

    if not report:
        if not analyzer:
            raise HTTPException(status_code=503, detail="AI 엔진 미초기화. GEMINI_API_KEY 확인.")
        if _is_analyzing:
            raise HTTPException(status_code=202, detail={
                "message": "분석 진행 중입니다.",
                "progress": _analysis_progress,
            })
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
    report = db.load_report(date)
    if not report:
        raise HTTPException(status_code=404, detail=f"{date} 날짜의 리포트가 없습니다.")
    return JSONResponse(content={
        "success": True,
        "data": report,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })


@app.post("/api/trigger-analysis")
async def trigger_analysis(background_tasks: BackgroundTasks):
    if _is_analyzing:
        return {"success": False, "message": "이미 분석 진행 중.", "progress": _analysis_progress}
    if not analyzer:
        raise HTTPException(status_code=503, detail="AI 엔진 미초기화.")
    background_tasks.add_task(run_daily_pipeline)
    return {
        "success": True,
        "message": "분석이 백그라운드에서 시작됐습니다. 약 1~3분 후 /api/daily-report에서 확인하세요.",
    }


@app.get("/api/reports/history")
async def get_report_history():
    reports = db.load_history(limit=7)
    return JSONResponse(content={
        "success": True,
        "data": reports,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })


# ── 종목 상세 인메모리 캐시 (1시간 TTL) ──────────────────────────────
_stock_cache: dict = {}   # { ticker: {"data": {...}, "ts": float} }
STOCK_CACHE_TTL = 3600    # 1시간 (초)

@app.get("/api/stock/{ticker}")
async def get_stock_detail(ticker: str):
    """
    종목 상세 정보 반환.
    최적화:
      1. 인메모리 캐시 (1시간) — 동일 종목 반복 조회 시 즉시 응답
      2. yfinance info + history 병렬 실행 — 순차 대비 약 40% 단축
      3. Claude 번역은 캐시 미스 시에만 실행
    """
    import time

    # ── 1. 캐시 확인 ──────────────────────────────────────────────
    cached = _stock_cache.get(ticker)
    if cached and (time.time() - cached["ts"]) < STOCK_CACHE_TTL:
        logger.info(f"[캐시 HIT] {ticker}")
        return JSONResponse(content={
            "success": True,
            "data": cached["data"],
            "cached": True,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

    logger.info(f"[캐시 MISS] {ticker} — yfinance 조회 시작")

    try:
        # ── 2. yfinance info / history 병렬 실행 ──────────────────
        def fetch_info():
            session = requests.Session()
            session.headers.update({
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                )
            })
            t = yf.Ticker(ticker, session=session)
            try:
                return t.info or {}
            except Exception as e:
                logger.warning(f"yfinance info error [{ticker}]: {e}")
                return {}

        def fetch_history():
            session = requests.Session()
            session.headers.update({
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                )
            })
            t = yf.Ticker(ticker, session=session)
            try:
                return t.history(period="1y")
            except Exception as e:
                logger.warning(f"yfinance history error [{ticker}]: {e}")
                return None

        # asyncio.gather 로 두 블로킹 작업을 병렬 실행
        info, history_data = await asyncio.gather(
            asyncio.to_thread(fetch_info),
            asyncio.to_thread(fetch_history),
        )

        if history_data is None or (hasattr(history_data, 'empty') and history_data.empty):
            raise HTTPException(status_code=404, detail="종목 데이터를 찾을 수 없습니다.")

        current_price = float(history_data['Close'].iloc[-1])

        def get_return(days_ago: int) -> float:
            n = len(history_data)
            start_price = history_data['Close'].iloc[0] if n <= days_ago else history_data['Close'].iloc[-(days_ago + 1)]
            return round(((current_price - float(start_price)) / float(start_price)) * 100, 2)

        # 통화 추론 (info에 없는 경우)
        default_currency = "USD"
        if ticker.endswith(".KS") or ticker.endswith(".KQ"):
            default_currency = "KRW"
        elif ticker.endswith(".T"):
            default_currency = "JPY"
            
        data = {
            "ticker": ticker,
            "name":        info.get("shortName") or info.get("longName") or ticker,
            "sector":      info.get("sector", "N/A"),
            "industry":    info.get("industry", "N/A"),
            "summary":     info.get("longBusinessSummary", "제공된 기업 정보가 없습니다."),
            "marketCap":   info.get("marketCap", 0),
            "peRatio":     info.get("trailingPE") or info.get("forwardPE") or None,
            "currency":    info.get("currency") or default_currency,
            "currentPrice": current_price,
            "returns": {
                "1d": get_return(1),
                "1w": get_return(5),
                "1m": get_return(21),
                "1y": get_return(252),
            },
        }

        # ── 3. Gemini 번역 (info 부족 시에만) ────────────────────
        if analyzer and analyzer.client:
            try:
                is_missing = (data["name"] == ticker or
                              data["summary"] == "제공된 기업 정보가 없습니다.")

                if is_missing:
                    prompt = (
                        f"주식 티커 '{ticker}'에 대한 기업 정보를 JSON 형식으로만 응답해줘. "
                        "개요는 한국어로 주식/경제 용어에 맞게 3~4문장으로 요약해줘.\n"
                        '형식: {"name": "종목명", "sector": "섹터", "industry": "산업군", "summary": "개요 내용"}'
                    )
                elif data.get("summary"):
                    prompt = (
                        "다음 해외 기업의 비즈니스 개요를 한국어 주식/경제 용어에 맞게 "
                        "자연스럽게 번역해줘. 핵심만 3~4문장으로 요약 번역해줘. "
                        f"(부연설명 없이 번역 결과만 출력):\n\n{data['summary']}"
                    )
                else:
                    prompt = None

                if prompt:
                    from google.genai import types
                    response = await analyzer.client.aio.models.generate_content(
                        model="gemini-2.0-flash",
                        contents=prompt,
                        config=types.GenerateContentConfig(temperature=0.3)
                    )
                    content = response.text.strip()

                    if is_missing:
                        import re as _re, json as _json
                        m = _re.search(r'\{.*\}', content, _re.DOTALL)
                        if m:
                            parsed = _json.loads(m.group(0))
                            data["name"]     = parsed.get("name",     data["name"])
                            data["sector"]   = parsed.get("sector",   data["sector"])
                            data["industry"] = parsed.get("industry", data["industry"])
                            data["summary"]  = parsed.get("summary",  data["summary"])
                    else:
                        data["summary"] = content

            except Exception as e:
                logger.warning(f"Gemini 번역/생성 실패 [{ticker}]: {e}")

        # ── 4. 캐시 저장 ──────────────────────────────────────────
        _stock_cache[ticker] = {"data": data, "ts": time.time()}
        logger.info(f"[캐시 저장] {ticker}")

        return JSONResponse(content={
            "success": True,
            "data": data,
            "cached": False,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Stock Detail Error [{ticker}]: {e}")
        raise HTTPException(status_code=500, detail=f"종목 정보 조회 실패: {str(e)}")


# ─── 서버 실행 ───────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "8000")),
        log_level=os.getenv("LOG_LEVEL", "info"),
        reload=False,
    )
