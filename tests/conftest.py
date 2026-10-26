"""試験用conftest: base_url 解決とビューポート設定"""

import os

import pytest


@pytest.fixture(scope="session")
def base_url() -> str:
    if url := os.environ.get("BASE_URL"):
        return url
    return "http://localhost:3210"


@pytest.fixture(scope="session")
def browser_context_args(browser_context_args: dict) -> dict:
    return {
        **browser_context_args,
        "viewport": {"width": 1600, "height": 900},
    }
