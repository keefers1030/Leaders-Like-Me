#!/usr/bin/env python3
"""Render the link-preview image and the iPhone/iPad home-screen icon with Chrome.

    python3 data/source/make_previews.py

Writes og-image.png (1200 x 630, from data/source/og-card.html) and
apple-touch-icon.png (180 x 180, from favicon.svg) in the project root.
"""
import os, subprocess, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


def shoot(url, out, width, height):
    with tempfile.TemporaryDirectory() as profile:
        subprocess.run([
            CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
            f"--user-data-dir={profile}", "--allow-file-access-from-files",
            f"--window-size={width},{height}", "--virtual-time-budget=8000",
            f"--screenshot={out}", url,
        ], check=True, capture_output=True)
    print("wrote", out)


shoot("file://" + os.path.join(ROOT, "data", "source", "og-card.html"), os.path.join(ROOT, "og-image.png"), 1200, 630)

# Home-screen icon: the favicon on a full square (iOS rounds the corners itself).
with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False, dir=os.path.join(ROOT, "data", "source")) as f:
    f.write('<!doctype html><html><body style="margin:0;background:#2e3a56">'
            '<img src="../../favicon.svg" style="width:180px;height:180px;display:block;transform:scale(1.12)"></body></html>')
    icon_page = f.name
try:
    shoot("file://" + icon_page, os.path.join(ROOT, "apple-touch-icon.png"), 180, 180)
finally:
    os.unlink(icon_page)
