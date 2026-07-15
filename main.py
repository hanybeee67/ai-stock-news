# -*- coding: utf-8 -*-
"""
급등주 알리미 (초간단 버전)

코스피 / 코스닥 / 미국 주식시장을 30분마다 살펴서
5% 이상 급등한 종목을 [회사명 · 상승률 · 현재가] 로 보여준다.

실행:  python main.py  →  브라우저가 자동으로 열림 (http://localhost:8000)
API 키 불필요 — 네이버 증권 공개 API + 야후 파이낸스 사용.
"""

import threading
import time
import webbrowser
from datetime import datetime

import requests
import uvicorn
from fastapi import FastAPI
from fastapi.responses import HTMLResponse, JSONResponse

# ── 설정 ─────────────────────────────────────────────
SURGE_THRESHOLD = 5.0   # 급등 기준 (%)
CHECK_INTERVAL_MIN = 30  # 점검 주기 (분)
PORT = 8000

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}

# ── 수집 결과 저장소 ─────────────────────────────────
state = {
    "updated_at": None,
    "threshold": SURGE_THRESHOLD,
    "interval_min": CHECK_INTERVAL_MIN,
    "markets": {"KOSPI": [], "KOSDAQ": [], "US": []},
    "errors": {},
}
_refresh_lock = threading.Lock()


# ── 데이터 수집 ──────────────────────────────────────
def fetch_korea(market: str) -> list:
    """네이버 증권 '상승' 목록에서 5% 이상 급등 종목 수집 (market: KOSPI | KOSDAQ)"""
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
            except ValueError:
                continue
            page_min = min(page_min, rate)
            if rate >= SURGE_THRESHOLD:
                result.append({
                    "name": s.get("stockName", ""),
                    "rate": round(rate, 2),
                    "price": f'{s.get("closePrice", "-")}원',
                })
        # 상승률 내림차순 목록이므로 기준 미달 종목이 나오면 다음 페이지는 볼 필요 없음
        if page_min < SURGE_THRESHOLD:
            break
    result.sort(key=lambda x: x["rate"], reverse=True)
    return result


def fetch_us() -> list:
    """야후 파이낸스 'day_gainers' 스크리너에서 5% 이상 급등 종목 수집"""
    quotes = []
    try:
        import yfinance as yf
        quotes = yf.screen("day_gainers", count=100).get("quotes", [])
    except Exception:
        # yfinance 실패 시 야후 공개 스크리너 API 직접 호출
        res = requests.get(
            "https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved",
            params={"scrIds": "day_gainers", "count": 100},
            headers=HEADERS,
            timeout=15,
        )
        res.raise_for_status()
        quotes = res.json()["finance"]["result"][0]["quotes"]

    result = []
    for q in quotes:
        rate = q.get("regularMarketChangePercent") or 0
        price = q.get("regularMarketPrice")
        if rate < SURGE_THRESHOLD or price is None:
            continue
        result.append({
            "name": q.get("shortName") or q.get("longName") or q.get("symbol", ""),
            "rate": round(float(rate), 2),
            "price": f"${float(price):,.2f}",
        })
    result.sort(key=lambda x: x["rate"], reverse=True)
    return result


def refresh():
    """세 시장을 모두 조회해서 state 갱신 (실패한 시장은 이전 데이터 유지 + 오류 기록)"""
    with _refresh_lock:
        jobs = {
            "KOSPI": lambda: fetch_korea("KOSPI"),
            "KOSDAQ": lambda: fetch_korea("KOSDAQ"),
            "US": fetch_us,
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
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>급등주 알리미</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif;
         background: #0f1420; color: #e8ecf4; padding: 24px; }
  header { display: flex; flex-wrap: wrap; align-items: baseline; gap: 12px; margin-bottom: 20px; }
  h1 { font-size: 22px; }
  .meta { color: #8b94a8; font-size: 13px; }
  button { background: #2563eb; color: #fff; border: 0; border-radius: 6px;
           padding: 6px 14px; font-size: 13px; cursor: pointer; }
  button:disabled { opacity: .5; cursor: wait; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; }
  .card { background: #1a2132; border-radius: 12px; padding: 16px; }
  .card h2 { font-size: 16px; margin-bottom: 4px; }
  .count { color: #8b94a8; font-size: 12px; margin-bottom: 10px; }
  .error { color: #f87171; font-size: 12px; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  td { padding: 7px 4px; border-bottom: 1px solid #262f45; }
  td.rate { color: #f43f5e; font-weight: bold; text-align: right; white-space: nowrap; }
  td.price { color: #cbd5e1; text-align: right; white-space: nowrap; }
  .empty { color: #8b94a8; font-size: 13px; padding: 12px 0; }
</style>
</head>
<body>
<header>
  <h1>🚀 급등주 알리미</h1>
  <span class="meta" id="meta">불러오는 중…</span>
  <button id="btn" onclick="manualRefresh()">지금 새로고침</button>
</header>
<div class="grid">
  <div class="card"><h2>🇰🇷 코스피</h2><div id="KOSPI"></div></div>
  <div class="card"><h2>🇰🇷 코스닥</h2><div id="KOSDAQ"></div></div>
  <div class="card"><h2>🇺🇸 미국</h2><div id="US"></div></div>
</div>
<script>
function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}
function render(d) {
  document.getElementById('meta').textContent =
    `+${d.threshold}% 이상 · ${d.interval_min}분마다 자동 점검 · 마지막 갱신: ${d.updated_at || '-'}`;
  for (const m of ['KOSPI', 'KOSDAQ', 'US']) {
    const list = d.markets[m] || [];
    let html = d.errors[m]
      ? `<div class="error">조회 실패: ${esc(d.errors[m])}</div>` : '';
    html += `<div class="count">급등 종목 ${list.length}개</div>`;
    if (list.length) {
      html += '<table>' + list.map(s =>
        `<tr><td>${esc(s.name)}</td><td class="rate">+${s.rate}%</td><td class="price">${esc(s.price)}</td></tr>`
      ).join('') + '</table>';
    } else if (!d.errors[m]) {
      html += '<div class="empty">기준을 넘는 급등 종목이 없습니다.</div>';
    }
    document.getElementById(m).innerHTML = html;
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
    threading.Timer(1.5, webbrowser.open, args=(f"http://localhost:{PORT}",)).start()
    uvicorn.run(app, host="127.0.0.1", port=PORT)
