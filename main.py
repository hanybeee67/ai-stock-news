# -*- coding: utf-8 -*-
"""
급등주 알리미 (초간단 버전)

코스피 / 코스닥 / S&P500(뉴욕거래소) / 나스닥 시장을 30분마다 살펴서
5% 이상 급등 + 저가 종목(국내 1만원 이하, 미국 $10 이하) 중 상승률 상위 20개를
[회사명 · 상승률 · 현재가] 로 보여준다.

로컬 실행:  python main.py  →  브라우저가 자동으로 열림 (http://localhost:8000)
렌더 배포:  uvicorn main:app --host 0.0.0.0 --port $PORT  (render.yaml 참고)
모바일:     배포된 렌더 URL을 휴대폰 브라우저로 열면 바로 사용 가능 (설치 불필요)

API 키 불필요 — 네이버 증권 공개 API + 야후 파이낸스 사용.
"""

import os
import threading
import time
import webbrowser
from datetime import datetime

import requests
import uvicorn
from fastapi import FastAPI
from fastapi.responses import HTMLResponse, JSONResponse

# ── 설정 ─────────────────────────────────────────────
SURGE_THRESHOLD = 5.0    # 급등 기준 (%)
KR_PRICE_CAP = 10000     # 국내 종목 현재가 상한 (원)
US_PRICE_CAP = 10.0      # 미국 종목 현재가 상한 ($)
TOP_N = 20               # 시장별 최대 표시 개수 (상승률 상위)
CHECK_INTERVAL_MIN = 30  # 점검 주기 (분)
PORT = int(os.environ.get("PORT", 8000))  # 렌더는 PORT 환경변수로 포트를 지정함

# 미국은 거래소 기준으로 나눔 (코스피/코스닥처럼) — 실제 지수 구성종목이 아니라
# 나스닥 거래소 상장 종목 전체 vs 그 외(뉴욕증권거래소 등) 상장 종목 전체.
NASDAQ_EXCHANGES = ["NMS", "NGM", "NCM"]   # 나스닥 (Global Select/Global/Capital Market)
NYSE_EXCHANGES = ["NYQ", "ASE", "PCX"]     # 뉴욕증권거래소 계열 (NYSE / NYSE American / NYSE Arca)

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}

# ── 수집 결과 저장소 ─────────────────────────────────
state = {
    "updated_at": None,
    "threshold": SURGE_THRESHOLD,
    "kr_price_cap": KR_PRICE_CAP,
    "us_price_cap": US_PRICE_CAP,
    "top_n": TOP_N,
    "interval_min": CHECK_INTERVAL_MIN,
    "markets": {"KOSPI": [], "KOSDAQ": [], "SP500": [], "NASDAQ": []},
    "errors": {},
}
_refresh_lock = threading.Lock()


# ── 데이터 수집 ──────────────────────────────────────
def fetch_korea(market: str) -> list:
    """네이버 증권 '상승' 목록에서 5% 이상 급등 + 1만원 이하 종목 상위 20개 수집 (market: KOSPI | KOSDAQ)"""
    result = []
    for page in range(1, 11):
        res = requests.get(
            f"https://m.stock.naver.com/api/stocks/up/{market}",
            params={"page": page, "pageSize": 100},
            headers=HEADERS,
            timeout=15,
        )
        res.raise_for_status()
        stocks = res.json().get("stocks", [])
        if not stocks:
            break
        page_min = SURGE_THRESHOLD
        for s in stocks:
            try:
                rate = float(str(s.get("fluctuationsRatio", "0")).replace(",", ""))
                price = float(str(s.get("closePrice", "0")).replace(",", ""))
            except ValueError:
                continue
            page_min = min(page_min, rate)
            if rate >= SURGE_THRESHOLD and price <= KR_PRICE_CAP:
                result.append({
                    "name": s.get("stockName", ""),
                    "rate": round(rate, 2),
                    "price": f"{price:,.0f}원",
                })
        # 상승률 내림차순 목록이므로 기준 미달 종목이 나오면 다음 페이지는 볼 필요 없음
        if page_min < SURGE_THRESHOLD:
            break
    result.sort(key=lambda x: x["rate"], reverse=True)
    return result[:TOP_N]


def fetch_us(exchanges: list) -> list:
    """야후 파이낸스에서 5% 이상 급등 + $10 이하 + 지정 거래소(나스닥/뉴욕 등) 종목 상위 20개 수집"""
    quotes = []
    try:
        import yfinance as yf
        from yfinance.screener.query import EquityQuery
        query = EquityQuery("and", [
            EquityQuery("eq", ["region", "us"]),
            EquityQuery("gte", ["percentchange", SURGE_THRESHOLD]),
            EquityQuery("lte", ["intradayprice", US_PRICE_CAP]),
            EquityQuery("is-in", ["exchange"] + exchanges),
        ])
        quotes = yf.screen(query, sortField="percentchange", sortAsc=False, size=TOP_N).get("quotes", [])
    except Exception:
        quotes = _fetch_us_fallback(exchanges)

    result = []
    for q in quotes:
        rate = q.get("regularMarketChangePercent") or 0
        price = q.get("regularMarketPrice")
        if price is None or rate < SURGE_THRESHOLD or price > US_PRICE_CAP:
            continue
        result.append({
            "name": q.get("shortName") or q.get("longName") or q.get("symbol", ""),
            "rate": round(float(rate), 2),
            "price": f"${float(price):,.2f}",
        })
    result.sort(key=lambda x: x["rate"], reverse=True)
    return result[:TOP_N]


def _fetch_us_fallback(exchanges: list) -> list:
    """야후 커스텀 스크리너 실패 시: 사전 정의 스크리너(day_gainers + small_cap_gainers)에서
    지정 거래소에 해당하는 종목만 걸러서 반환."""
    seen = {}
    for scr_id in ("day_gainers", "small_cap_gainers"):
        res = requests.get(
            "https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved",
            params={"scrIds": scr_id, "count": 100},
            headers=HEADERS,
            timeout=15,
        )
        res.raise_for_status()
        for q in res.json()["finance"]["result"][0]["quotes"]:
            symbol = q.get("symbol")
            if symbol and q.get("exchange") in exchanges:
                seen[symbol] = q
    return list(seen.values())


def refresh():
    """네 시장을 모두 조회해서 state 갱신 (실패한 시장은 이전 데이터 유지 + 오류 기록)"""
    with _refresh_lock:
        jobs = {
            "KOSPI": lambda: fetch_korea("KOSPI"),
            "KOSDAQ": lambda: fetch_korea("KOSDAQ"),
            "SP500": lambda: fetch_us(NYSE_EXCHANGES),
            "NASDAQ": lambda: fetch_us(NASDAQ_EXCHANGES),
        }
        for market, job in jobs.items():
            try:
                state["markets"][market] = job()
                state["errors"].pop(market, None)
            except Exception as e:
                state["errors"][market] = f"{type(e).__name__}: {e}"
        state["updated_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def watch_loop():
    while True:
        refresh()
        time.sleep(CHECK_INTERVAL_MIN * 60)


# ── 웹 서버 ──────────────────────────────────────────
app = FastAPI(title="급등주 알리미")


@app.on_event("startup")
def on_startup():
    threading.Thread(target=watch_loop, daemon=True).start()


@app.get("/api/surge")
def api_surge():
    return JSONResponse(state)


@app.post("/api/refresh")
def api_refresh():
    refresh()
    return JSONResponse(state)


PAGE = """<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0f1420">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<title>급등주 알리미</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
  html { -webkit-text-size-adjust: 100%; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif;
    background: #0f1420; color: #e8ecf4;
    padding-left: max(14px, env(safe-area-inset-left));
    padding-right: max(14px, env(safe-area-inset-right));
    padding-bottom: max(24px, env(safe-area-inset-bottom));
  }
  header {
    position: sticky; top: 0; z-index: 10;
    display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px;
    padding-top: max(14px, env(safe-area-inset-top));
    padding-bottom: 14px;
    background: rgba(15, 20, 32, .92);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border-bottom: 1px solid #1e2740;
  }
  h1 { font-size: clamp(18px, 5vw, 22px); white-space: nowrap; }
  .meta { color: #8b94a8; font-size: 12.5px; flex: 1 1 auto; line-height: 1.4; }
  button#btn {
    background: #2563eb; color: #fff; border: 0; border-radius: 8px;
    padding: 10px 16px; font-size: 14px; font-weight: 600; cursor: pointer;
    flex: 0 0 auto; min-height: 40px; -webkit-appearance: none;
  }
  button#btn:active { background: #1d4ed8; }
  button#btn:disabled { opacity: .5; cursor: wait; }
  main { padding-top: 16px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 14px; }
  .card { background: #1a2132; border-radius: 14px; padding: 14px; min-width: 0; }
  .card h2 { font-size: 15px; margin-bottom: 2px; }
  .count { color: #8b94a8; font-size: 12px; margin-bottom: 8px; }
  .error { color: #f87171; font-size: 12px; margin-bottom: 8px; overflow-wrap: anywhere; }
  .list { max-height: 60vh; overflow-y: auto; -webkit-overflow-scrolling: touch; }
  .row {
    display: flex; align-items: baseline; gap: 10px;
    padding: 11px 2px; border-bottom: 1px solid #262f45;
  }
  .row:last-child { border-bottom: 0; }
  .row .name {
    flex: 1 1 auto; min-width: 0; font-size: 14px;
    overflow-wrap: anywhere; word-break: keep-all;
  }
  .row .rate {
    flex: 0 0 auto; color: #f43f5e; font-weight: 700; font-size: 14px; white-space: nowrap;
  }
  .row .price {
    flex: 0 0 auto; color: #cbd5e1; font-size: 12.5px; white-space: nowrap;
    text-align: right; min-width: 64px;
  }
  .empty { color: #8b94a8; font-size: 13px; padding: 10px 0; }

  @media (max-width: 480px) {
    body { padding-left: max(12px, env(safe-area-inset-left)); padding-right: max(12px, env(safe-area-inset-right)); }
    header { flex-direction: column; align-items: stretch; gap: 8px; }
    .meta { order: 2; font-size: 12px; }
    button#btn { order: 1; width: 100%; padding: 12px; font-size: 15px; }
    .grid { grid-template-columns: 1fr; gap: 12px; }
    .list { max-height: none; overflow-y: visible; }
  }

  @media (prefers-color-scheme: light) {
    body { background: #f4f6fb; color: #1a2132; }
    header { background: rgba(244, 246, 251, .92); border-bottom-color: #dfe4ee; }
    .card { background: #ffffff; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
    .row { border-bottom-color: #edf0f6; }
    .row .price { color: #4b5568; }
    .meta, .count, .empty { color: #6b7280; }
  }
</style>
</head>
<body>
<header>
  <h1>🚀 급등주 알리미</h1>
  <span class="meta" id="meta">불러오는 중…</span>
  <button id="btn" onclick="manualRefresh()">지금 새로고침</button>
</header>
<main>
<div class="grid">
  <div class="card"><h2>🇰🇷 코스피</h2><div id="KOSPI-info"></div><div class="list" id="KOSPI"></div></div>
  <div class="card"><h2>🇰🇷 코스닥</h2><div id="KOSDAQ-info"></div><div class="list" id="KOSDAQ"></div></div>
  <div class="card"><h2>🇺🇸 S&amp;P 500</h2><div id="SP500-info"></div><div class="list" id="SP500"></div></div>
  <div class="card"><h2>🇺🇸 나스닥</h2><div id="NASDAQ-info"></div><div class="list" id="NASDAQ"></div></div>
</div>
</main>
<script>
function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}
function render(d) {
  document.getElementById('meta').textContent =
    `+${d.threshold}% · 국내 ${d.kr_price_cap.toLocaleString()}원 이하 · 미국 $${d.us_price_cap} 이하 · 상위 ${d.top_n}개 · ${d.interval_min}분마다 자동 점검 · 마지막 갱신: ${d.updated_at || '-'}`;
  for (const m of ['KOSPI', 'KOSDAQ', 'SP500', 'NASDAQ']) {
    const list = d.markets[m] || [];
    document.getElementById(m + '-info').innerHTML =
      (d.errors[m] ? `<div class="error">조회 실패: ${esc(d.errors[m])}</div>` : '') +
      `<div class="count">급등 종목 ${list.length}개</div>`;
    document.getElementById(m).innerHTML = list.length
      ? list.map(s =>
          `<div class="row"><div class="name">${esc(s.name)}</div><div class="rate">+${s.rate}%</div><div class="price">${esc(s.price)}</div></div>`
        ).join('')
      : (d.errors[m] ? '' : '<div class="empty">기준을 넘는 급등 종목이 없습니다.</div>');
  }
}
async function load() {
  try { render(await (await fetch('/api/surge')).json()); } catch (e) {}
}
async function manualRefresh() {
  const btn = document.getElementById('btn');
  btn.disabled = true; btn.textContent = '조회 중…';
  try { render(await (await fetch('/api/refresh', {method: 'POST'})).json()); } catch (e) {}
  btn.disabled = false; btn.textContent = '지금 새로고침';
}
load();
setInterval(load, 60 * 1000);  // 화면은 1분마다 서버 데이터를 다시 읽음
</script>
</body>
</html>"""


@app.get("/", response_class=HTMLResponse)
def index():
    return PAGE


if __name__ == "__main__":
    if not os.environ.get("RENDER"):
        threading.Timer(1.5, webbrowser.open, args=(f"http://localhost:{PORT}",)).start()
    uvicorn.run(app, host="0.0.0.0", port=PORT)
