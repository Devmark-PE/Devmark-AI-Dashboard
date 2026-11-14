"""Página informativa en "/": solo navegadores; el resto de clientes conserva el contrato original."""

import dataclasses
import re

import pytest

from app.api import public
from tests.test_public_contract import BROWSER_ACCEPT, SERVICE_INFO


def browser_root(client):
    return client.get("/", headers={"Accept": BROWSER_ACCEPT}, follow_redirects=False)


def test_browser_gets_landing_html(client):
    r = browser_root(client)
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/html")
    assert r.headers["vary"] == "Accept" and r.headers["cache-control"] == "no-cache"
    assert "default-src 'self'" in r.headers["content-security-policy"]
    for text in ("DEVMARK", "Hablar con un asesor", "https://wa.me/51975646074?text=", 'href="/dashboard/"', "application/ld+json", "/landing/og.png"):
        assert text in r.text


@pytest.mark.parametrize("accept", [None, "*/*", "application/json", "text/plain"])
def test_non_browser_clients_keep_json_contract(client, accept):
    r = client.get("/", headers={"Accept": accept} if accept else {"Accept": ""})
    assert r.status_code == 200 and r.json() == SERVICE_INFO
    assert r.headers["content-type"].startswith("application/json") and "content-security-policy" not in r.headers


def test_landing_assets_resolve(client):
    html = browser_root(client).text
    urls = set(re.findall(r'(?:href|src)="(/landing/[^"]+)"', html))
    assert any("/_next/static/" in u and u.endswith(".js") for u in urls) and any(u.endswith(".css") for u in urls)
    for url in urls:
        assert client.get(url).status_code == 200, url
    for url in ("/landing/og.png", "/landing/favicon.svg", "/landing/fonts/Braze.woff2"):
        assert client.get(url).status_code == 200, url


def test_seo_files(client):
    robots = client.get("/robots.txt")
    assert robots.status_code == 200 and "Sitemap: https://ai.devmarkpe.com/sitemap.xml" in robots.text
    sitemap = client.get("/sitemap.xml")
    assert sitemap.status_code == 200 and "<loc>https://ai.devmarkpe.com/</loc>" in sitemap.text


def test_browser_falls_back_to_dashboard_without_build(client, monkeypatch):
    settings = dataclasses.replace(public.get_settings(), landing_dir="/nonexistent")
    monkeypatch.setattr(public, "get_settings", lambda: settings)
    r = browser_root(client)
    assert r.status_code == 302 and r.headers["location"] == "/dashboard/"
    assert client.get("/robots.txt").status_code == 404
