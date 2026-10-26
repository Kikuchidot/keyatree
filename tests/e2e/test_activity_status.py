"""アクティビティ（在席状況）選択機能のE2E試験（試験環境: localhost:3210）

試験内容:
1. API: アクティビティの保存・取得・解除、マスターに無いIDは拒否
2. UI: ヘッダーのアイコン → アクティビティ一覧 → 選択するとドット色とラベルが変わる
3. マスター管理で項目名を変更するとヘッダーの表示に反映される
"""

import json
import urllib.parse

import httpx
import pytest
from playwright.sync_api import expect, Browser

USER_B = {
    "email": "suzuki@keyaki-s.com",
    "password": "*Ub9F+cWbQGCcHpn",
}


def login_api(base_url: str, email: str, password: str) -> dict:
    r = httpx.post(f"{base_url}/api/auth/login", json={"email": email, "password": password}, timeout=60)
    assert r.status_code == 200 and r.json().get("ok"), f"ログイン失敗: {r.text}"
    return r.json()["account"]


def cookie_value(account: dict) -> str:
    payload = {k: account[k] for k in ("id", "name", "email", "permissionId", "permissionName", "employeeId")}
    return urllib.parse.quote(json.dumps(payload, ensure_ascii=False))


@pytest.fixture(scope="module")
def env(base_url):
    acc_b = login_api(base_url, USER_B["email"], USER_B["password"])
    client_b = httpx.Client(base_url=base_url, cookies={"kt_session": cookie_value(acc_b)}, timeout=60)
    yield {"base_url": base_url, "acc_b": acc_b, "client_b": client_b}
    # 後片付け: アクティビティを解除
    try:
        client_b.put("/api/presence", json={"statusId": ""})
    except Exception:
        pass
    client_b.close()


def test_01_api_save_and_clear(env):
    """API: アクティビティの保存・取得・解除"""
    client = env["client_b"]

    # マスターにアクティビティカテゴリがある
    masters = client.get("/api/masters").json()["masters"]
    items = masters.get("activityStatus") or []
    assert len(items) >= 2, f"アクティビティの既定値が無い: {items}"
    busy = next(i for i in items if i["id"] == "as2")

    # 保存
    r = client.put("/api/presence", json={"statusId": busy["id"]})
    assert r.status_code == 200, r.text
    key = env["acc_b"]["id"]
    assert r.json()["presence"].get(key, {}).get("statusId") == "as2"

    # 取得
    r = client.get("/api/presence")
    assert r.status_code == 200
    assert r.json()["presence"].get(key, {}).get("statusId") == "as2"

    # 不明なIDは拒否
    r = client.put("/api/presence", json={"statusId": "as_unknown"})
    assert r.status_code == 400

    # 解除
    r = client.put("/api/presence", json={"statusId": ""})
    assert r.status_code == 200
    assert key not in r.json()["presence"]


def test_02_ui_select_activity(env, browser: Browser):
    """UI: ヘッダーからアクティビティを選択するとドットとラベルが変わる"""
    ctx = browser.new_context(viewport={"width": 1280, "height": 800})
    ctx.add_cookies([{"name": "kt_session", "value": cookie_value(env["acc_b"]), "url": env["base_url"]}])
    page = ctx.new_page()
    try:
        page.goto(f"{env['base_url']}/features", wait_until="domcontentloaded")
        # ヘッダーのアイコンを開く
        avatar = page.locator("header button:has-text('▾')").first
        expect(avatar).to_be_visible(timeout=60000)
        avatar.click()

        # アクティビティ一覧が表示される
        expect(page.locator("text=アクティビティ").first).to_be_visible(timeout=15000)
        option = page.locator("[data-activity-id='as2']")
        expect(option).to_be_visible()

        # 「取り込み中」を選択
        option.click()
        # メニュー内にチェックが付く
        expect(page.locator("[data-activity-id='as2'] span:text('✓')")).to_be_visible(timeout=10000)

        # ヘッダーのアイコンにドットが付き、ラベルが変わる
        dot = page.locator("[data-testid='activity-dot']")
        expect(dot).to_be_visible(timeout=10000)
        assert "bg-rose-500" in (dot.get_attribute("class") or "")
        expect(page.locator("header", has_text="取り込み中").first).to_be_visible()

        # APIにも保存されている
        d = env["client_b"].get("/api/presence").json()
        assert d["presence"].get(env["acc_b"]["id"], {}).get("statusId") == "as2"
        page.screenshot(path=".verdent/testing/screenshots/activity_select.png", full_page=False)

        # ページ再読み込み後も保持される
        page.reload(wait_until="domcontentloaded")
        expect(page.locator("header", has_text="取り込み中").first).to_be_visible(timeout=60000)
    finally:
        ctx.close()


def test_03_master_rename_reflects(env, browser: Browser):
    """マスター管理で項目名を変更するとヘッダーの表示に反映される"""
    client = env["client_b"]
    masters = client.get("/api/masters").json()["masters"]
    original = json.loads(json.dumps(masters))
    try:
        # as2（取り込み中）を「商談中」に改名
        for item in masters["activityStatus"]:
            if item["id"] == "as2":
                item["label"] = "商談中"
        r = client.put("/api/masters", json={"masters": masters})
        assert r.status_code == 200, r.text

        ctx = browser.new_context(viewport={"width": 1280, "height": 800})
        ctx.add_cookies([{"name": "kt_session", "value": cookie_value(env["acc_b"]), "url": env["base_url"]}])
        page = ctx.new_page()
        try:
            page.goto(f"{env['base_url']}/features", wait_until="domcontentloaded")
            # as2 を選択済みにする
            client.put("/api/presence", json={"statusId": "as2"})
            page.reload(wait_until="domcontentloaded")
            # 改名後のラベルがヘッダーに表示される
            expect(page.locator("header", has_text="商談中").first).to_be_visible(timeout=60000)

            # メニューにも改名が反映される
            page.locator("header button:has-text('▾')").first.click()
            expect(page.locator("[data-activity-id='as2']")).to_contain_text("商談中", timeout=10000)
        finally:
            ctx.close()
    finally:
        # マスターを元に戻す
        client.put("/api/masters", json={"masters": original})
        client.put("/api/presence", json={"statusId": ""})
