#!/usr/bin/env python3
"""Mirror the NASA SVS media used by Earth Jukebox into data/svs/<dataset>/.

Why: browsers only let the app read a video's pixels (for live sight-to-sound analysis) when the file
comes from the same server. With the media mirrored locally, every pop-up is analysed live, and the
app also works offline.

Usage (from the earth-jukebox folder):
    python3 tools/fetch_svs.py            # the light set, about 120 MB
    python3 tools/fetch_svs.py --big      # also the large movies (lightning 127 MB, air quality 179 MB)
    python3 tools/fetch_svs.py --list     # show what would be downloaded

The list of files is read from src/data/datasets.js, so there is one source of truth.
Standard library only. NASA SVS media is public domain; please credit NASA SVS.
"""
import os
import re
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CATALOG = os.path.join(ROOT, "src", "data", "datasets.js")


def parse_catalog():
    text = open(CATALOG, encoding="utf-8").read()
    base = re.search(r"const SVS = '([^']+)'", text).group(1)
    items = []
    # Split into dataset blocks on "id: '...'," followed by "svs:"
    blocks = re.split(r"\n  \{\n    id: '", text)[1:]
    for block in blocks:
        ds = block.split("'", 1)[0]
        for m in re.finditer(r"\{ label: [^\n]*\}", block):
            line = m.group(0)
            f = re.search(r"file: '([^']+)'", line)
            u = re.search(r"url: SVS \+ '([^']+)'", line)
            if f and u:
                items.append((ds, f.group(1), base + u.group(1), "big: true" in line))
            c = re.search(r"captions: SVS \+ '([^']+)'", line)
            cf = re.search(r"captionsFile: '([^']+)'", line)
            if c and cf:
                items.append((ds, cf.group(1), base + c.group(1), False))
    return items


def download(url, dest):
    tmp = dest + ".part"
    req = urllib.request.Request(url, headers={"User-Agent": "earth-jukebox-fetch/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r, open(tmp, "wb") as out:
        total = int(r.headers.get("Content-Length") or 0)
        done = 0
        while True:
            chunk = r.read(1 << 16)
            if not chunk:
                break
            out.write(chunk)
            done += len(chunk)
            if total:
                sys.stdout.write(f"\r    {done / 1e6:6.1f} / {total / 1e6:.1f} MB")
                sys.stdout.flush()
    os.replace(tmp, dest)
    sys.stdout.write("\n")


def main():
    big = "--big" in sys.argv
    items = parse_catalog()
    todo = [i for i in items if big or not i[3]]
    if "--list" in sys.argv:
        for ds, f, url, is_big in items:
            print(f"{'[big] ' if is_big else '      '}{ds}/{f}  <-  {url}")
        return
    for ds, f, url, _ in todo:
        dest_dir = os.path.join(ROOT, "data", "svs", ds)
        os.makedirs(dest_dir, exist_ok=True)
        dest = os.path.join(dest_dir, f)
        if os.path.exists(dest) and os.path.getsize(dest) > 0:
            print(f"  ok   {ds}/{f} (already here)")
            continue
        print(f"  get  {ds}/{f}")
        try:
            download(url, dest)
        except Exception as e:  # keep going; the app falls back to streaming for anything missing
            print(f"  FAILED {url}: {e}")
    skipped = len(items) - len(todo)
    print(f"\nDone. {'Run with --big to also fetch ' + str(skipped) + ' large movie(s).' if skipped else ''}")


if __name__ == "__main__":
    main()
