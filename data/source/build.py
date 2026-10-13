#!/usr/bin/env python3
"""Build the app's leader data and photos from data/source/leaders.source.json.

    python3 data/source/build.py /path/to/leaders-like-me-api

- Photos marked {"repo": "file"} are taken from the leaders-like-me-api repo's
  public/images folder.
- Photos marked {"commons": true} are downloaded from Wikimedia Commons (the image on
  the person's Wikidata entry); {"commons": "File name.jpg"} names the Commons file
  directly. The artist and license are saved for the credit line.
- Commons downloads are cached in data/source/photo-credits.json, so re-running only
  fetches photos that are new or changed.
- Every photo is converted to a JPEG no larger than 480px on its longest side and
  saved as images/<id>.jpg.
- Writes data/leaders.js (loaded by the app) and data/leaders.json (for other uses).
- Stamps index.html with file fingerprints so browsers don't serve stale copies.
  After editing app.js or styles.css by hand, run with --stamp-only to refresh them.
"""
import json, os, subprocess, sys, tempfile, time, urllib.parse, urllib.request, re, html

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "data", "source", "leaders.source.json")
IMG_DIR = os.path.join(ROOT, "images")
UA = {"User-Agent": "LeadersLikeMe/1.0 (education project; https://github.com/keefers1030/leaders-like-me-api)"}


def get_json(url, tries=5):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(4 * (i + 1))
                continue
            raise
    raise RuntimeError("rate limited: " + url)


def download(url, dest, tries=5):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r, open(dest, "wb") as f:
                f.write(r.read())
            return
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(4 * (i + 1))
                continue
            raise


def strip_tags(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", s or ""))).strip()


def commons_photo(leader):
    """Find the person's Commons image and return (filename, thumb_url, credit dict)."""
    filename = leader["photo"]["commons"]
    if isinstance(filename, str):
        return (filename,) + commons_info(filename)
    wiki = next(l["url"] for l in leader["links"] if "wikipedia.org" in l["url"])
    title = urllib.parse.unquote(wiki.rsplit("/", 1)[1])
    s = get_json("https://en.wikipedia.org/api/rest_v1/page/summary/" + urllib.parse.quote(title))
    qid = s["wikibase_item"]
    claims = get_json(f"https://www.wikidata.org/wiki/Special:EntityData/{qid}.json")["entities"][qid]["claims"]
    filename = claims["P18"][0]["mainsnak"]["datavalue"]["value"]
    return (filename,) + commons_info(filename)


def commons_info(filename):
    info = get_json("https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({
        "action": "query", "titles": "File:" + filename, "prop": "imageinfo",
        "iiprop": "url|extmetadata", "iiurlwidth": 480, "format": "json"}))
    page = next(iter(info["query"]["pages"].values()))["imageinfo"][0]
    meta = page["extmetadata"]
    credit = {
        "artist": strip_tags(meta.get("Artist", {}).get("value")) or "Unknown",
        "license": strip_tags(meta.get("LicenseShortName", {}).get("value")),
        "url": page["descriptionurl"],
    }
    return page["thumburl"], credit


def to_jpeg(src, dest):
    subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "82", "-Z", "480", src, "--out", dest],
                   check=True, capture_output=True)


def main():
    if len(sys.argv) < 2 or sys.argv[1].startswith("--"):
        sys.exit(__doc__)
    repo_images = os.path.join(sys.argv[1], "public", "images")
    leaders = json.load(open(SRC, encoding="utf-8"))
    os.makedirs(IMG_DIR, exist_ok=True)
    cache_path = os.path.join(ROOT, "data", "source", "photo-credits.json")
    cache = json.load(open(cache_path, encoding="utf-8")) if os.path.exists(cache_path) else {}
    out = []
    for l in leaders:
        entry = {k: v for k, v in l.items() if k not in ("photo", "review")}  # review notes are for editors only
        photo = l.get("photo")
        dest = os.path.join(IMG_DIR, l["id"] + ".jpg")
        if photo and photo.get("repo"):
            to_jpeg(os.path.join(repo_images, photo["repo"]), dest)
            entry["image"] = f"images/{l['id']}.jpg"
            entry["imageCredit"] = None
        elif photo and photo.get("commons"):
            cached = cache.get(l["id"])
            wanted = photo["commons"] if isinstance(photo["commons"], str) else None
            if cached and os.path.exists(dest) and (wanted is None or wanted == cached["file"]):
                credit = cached["credit"]
            else:
                filename, url, credit = commons_photo(l)
                with tempfile.NamedTemporaryFile(suffix=os.path.splitext(url)[1], delete=False) as tmp:
                    download(url, tmp.name)
                    to_jpeg(tmp.name, dest)
                os.unlink(tmp.name)
                cache[l["id"]] = {"file": filename, "credit": credit}
                with open(cache_path, "w", encoding="utf-8") as f:
                    json.dump(cache, f, ensure_ascii=False, indent=1)
                time.sleep(0.5)
            entry["image"] = f"images/{l['id']}.jpg"
            entry["imageCredit"] = credit
        if entry.get("image"):
            entry["imageAlt"] = f"Portrait of {l['name']}"
        out.append(entry)
        print(("✓ " if entry.get("image") else "· ") + l["name"])

    out.sort(key=lambda e: e["name"].split()[-1])
    with open(os.path.join(ROOT, "data", "leaders.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    with open(os.path.join(ROOT, "data", "leaders.js"), "w", encoding="utf-8") as f:
        f.write("// Generated by data/source/build.py from data/source/leaders.source.json.\n"
                "// Edit the source file and re-run the script instead of editing this file.\n")
        f.write("window.LLM_LEADERS = " + json.dumps(out, ensure_ascii=False, indent=2) + ";\n")
    print(f"\n{len(out)} leaders, {sum(1 for e in out if e.get('image'))} with photos, "
          f"{sum(1 for e in out if e.get('clues'))} with Guess Who clues")


def stamp_index():
    """Add a content fingerprint (?v=...) to the app's file links in index.html, so
    browsers load fresh copies after an update instead of stale cached ones."""
    import hashlib
    path = os.path.join(ROOT, "index.html")
    html = open(path, encoding="utf-8").read()
    for rel in ["styles.css", "app.js", "data/tags.js", "data/collections.js", "data/leaders.js", "favicon.svg"]:
        digest = hashlib.md5(open(os.path.join(ROOT, rel), "rb").read()).hexdigest()[:8]
        html = re.sub(r'(["\'])' + re.escape(rel) + r'(\?v=[0-9a-f]*)?(["\'])', r"\g<1>" + rel + "?v=" + digest + r"\g<3>", html)
    with open(path, "w", encoding="utf-8") as f:
        f.write(html)


if __name__ == "__main__":
    if "--stamp-only" not in sys.argv:
        main()
    stamp_index()
