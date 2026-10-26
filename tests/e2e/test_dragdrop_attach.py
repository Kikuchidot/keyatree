"""ファイル添付のドラッグ&ドロップ改善のE2E試験（試験環境: localhost:3210）

試験内容:
1. メッセージ画面（投稿一覧）にファイルをドロップ → 投稿フォームが開き添付される
2. ドラッグ中は画面全体にオーバーレイ表示
3. 添付したまま投稿 → メッセージにファイル添付が表示される
"""

import json
import urllib.parse

import httpx
import pytest
from playwright.sync_api import expect, Browser

USER_A = {  # 管理者（チャンネル/トーク作成）
    "email": "k.sugita@365keyaki.onmicrosoft.com",
    "password": "R?3Qxg9tX%b@EmJ5",
}
USER_B = {  # 操作者（一般社員・トーク参加メンバー）
    "email": "suzuki@keyaki-s.com",
    "password": "*Ub9F+cWbQGCcHpn",
}

CH_NAME = "TEST-D&D添付チャンネル"
TALK_NAME = "TEST-D&D添付ルーム"
DROP_FILE_NAME = "dragdrop-test.txt"


def login_api(base_url: str, email: str, password: str) -> dict:
    r = httpx.post(f"{base_url}/api/auth/login", json={"email": email, "password": password}, timeout=60)
    assert r.status_code == 200 and r.json().get("ok"), f"ログイン失敗: {r.text}"
    return r.json()["account"]


def cookie_value(account: dict) -> str:
    payload = {k: account[k] for k in ("id", "name", "email", "permissionId", "permissionName", "employeeId")}
    return urllib.parse.quote(json.dumps(payload, ensure_ascii=False))


@pytest.fixture(scope="module")
def env(base_url):
    acc_a = login_api(base_url, USER_A["email"], USER_A["password"])
    acc_b = login_api(base_url, USER_B["email"], USER_B["password"])
    client_a = httpx.Client(base_url=base_url, cookies={"kt_session": cookie_value(acc_a)}, timeout=60)

    r = client_a.get("/api/task-channels")
    for c in (r.json().get("channels") or []) + (r.json().get("archivedChannels") or []):
        if c.get("name") == CH_NAME:
            client_a.delete(f"/api/task-channels/{c['id']}")

    r = client_a.post(
        "/api/task-channels",
        json={"name": CH_NAME, "members": [{"id": acc_b["employeeId"], "name": acc_b["name"]}]},
    )
    assert r.status_code == 200, f"チャンネル作成失敗: {r.text}"
    channel = r.json()["channel"]

    r = client_a.post(
        f"/api/task-channels/{channel['id']}/talks",
        json={"name": TALK_NAME, "members": [{"id": acc_b["employeeId"], "name": acc_b["name"]}]},
    )
    assert r.status_code == 200, f"トーク作成失敗: {r.text}"
    talk = r.json()["talk"]

    r = client_a.post(
        f"/api/task-channels/{channel['id']}/talks/{talk['id']}/messages",
        json={"text": "D&Dテストの既存メッセージ"},
    )
    assert r.status_code == 200, f"メッセージ投稿失敗: {r.text}"

    yield {"base_url": base_url, "acc_b": acc_b, "client_a": client_a, "channel": channel, "talk": talk}

    try:
        client_a.delete(f"/api/task-channels/{channel['id']}")
    except Exception:
        pass
    client_a.close()


def dispatch_drop(page, selector: str) -> None:
    """対象要素に File を載せた DataTransfer の dragenter/dragover/drop を dispatch する"""
    page.evaluate(
        """
        ([sel, fileName]) => {
          const dt = new DataTransfer();
          dt.items.add(new File(["drag & drop test payload"], fileName, { type: "text/plain" }));
          const target = document.querySelector(sel);
          if (!target) throw new Error("target not found: " + sel);
          for (const type of ["dragenter", "dragover", "drop"]) {
            target.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }));
          }
        }
        """,
        [selector, DROP_FILE_NAME],
    )


def test_01_drop_on_message_area_attaches_and_sends(env, browser: Browser):
    """メッセージ画面にドロップ → 添付 → 投稿までの一連の流れ"""
    ctx = browser.new_context(viewport={"width": 1600, "height": 900})
    ctx.add_cookies([{"name": "kt_session", "value": cookie_value(env["acc_b"]), "url": env["base_url"]}])
    page = ctx.new_page()
    try:
        # --- ① トークを開く ---
        page.goto(f"{env['base_url']}/tasks/channels", wait_until="domcontentloaded")
        ch_btn = page.locator(f"aside button:has-text('{CH_NAME}')").first
        expect(ch_btn).to_be_visible(timeout=60000)
        ch_btn.click()
        talk_span = page.locator(f"aside span:has-text('{TALK_NAME}')").first
        expect(talk_span).to_be_visible(timeout=30000)
        talk_span.click()
        expect(page.locator("text=D&Dテストの既存メッセージ").first).to_be_visible(timeout=30000)

        # --- ② ドラッグ中のオーバーレイ表示（dragenter/dragover のみ） ---
        page.evaluate(
            """
            () => {
              const dt = new DataTransfer();
              dt.items.add(new File(["x"], "dragdrop-test.txt", { type: "text/plain" }));
              const target = document.querySelector("[data-message-id]");
              for (const type of ["dragenter", "dragover"]) {
                target.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }));
              }
            }
            """
        )
        expect(page.locator("text=ファイルをドロップして添付").first).to_be_visible(timeout=10000)

        # --- ③ メッセージ画面にドロップ → 投稿フォームが開いて添付される ---
        dispatch_drop(page, "[data-message-id]")
        expect(page.locator(f"text={DROP_FILE_NAME}").first).to_be_visible(timeout=15000)

        # --- ④ 添付したまま投稿 → メッセージにファイルが表示される ---
        page.locator("button:has-text('投稿')").last.click()
        expect(page.locator("div[data-message-id]", has_text=DROP_FILE_NAME).first).to_be_visible(timeout=30000)
        page.screenshot(path=".verdent/testing/screenshots/dragdrop_attach.png", full_page=False)
    finally:
        ctx.close()
