"""Download the raw TSE files of the 2026 first round (election 6257) into a local cache.

The first round is final, so these files never change: we fetch them once and
build a static snapshot from the cache (see build_r1.py). The TSE answers 429 to
clients that ask too fast, so this script is sequential, paced at <= 2 req/s and
backs off on 429 (60 s, doubling up to 10 min). It is resumable: files already in
the cache are skipped.

Usage: python3 -I data/fetch_r1.py
"""
import json
import pathlib
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE = ROOT / "data/.cache/r1"
BASE = "https://resultados.tse.jus.br/oficial/ele2026/6257"
PACE = 0.5  # seconds between requests (2 req/s)
BACKOFF_START = 60
BACKOFF_MAX = 600
UFS = ["ac", "al", "am", "ap", "ba", "ce", "df", "es", "go", "ma", "mg", "ms", "mt", "pa",
       "pb", "pe", "pi", "pr", "rj", "rn", "ro", "rr", "rs", "sc", "se", "sp", "to", "zz"]

_last = 0.0
_backoff = BACKOFF_START


def fetch(path: str) -> bytes | None:
    """GET BASE/path with pacing and 429 back-off; None on 404."""
    global _last, _backoff
    while True:
        wait = PACE - (time.monotonic() - _last)
        if wait > 0:
            time.sleep(wait)
        _last = time.monotonic()
        req = urllib.request.Request(f"{BASE}/{path}", headers={"User-Agent": "apuracao-r1-snapshot"})
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                body = resp.read()
            _backoff = BACKOFF_START
            return body
        except urllib.error.HTTPError as err:
            if err.code == 404:
                return None
            if err.code == 429:
                print(f"429 on {path}: pausing {_backoff}s", flush=True)
                time.sleep(_backoff)
                _backoff = min(_backoff * 2, BACKOFF_MAX)
                continue
            raise
        except (urllib.error.URLError, TimeoutError) as err:
            print(f"network error on {path}: {err}; retrying in 10s", flush=True)
            time.sleep(10)


def cached(path: str, name: str) -> pathlib.Path | None:
    out = CACHE / name
    if out.exists():
        return out
    body = fetch(path)
    if body is None:
        print(f"404 {path}", flush=True)
        return None
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_suffix(".tmp")
    tmp.write_bytes(body)
    tmp.rename(out)
    return out


def main() -> None:
    catalog = cached("config/mun-e006257-cm.json", "catalog.json")
    if catalog is None:
        # first-round catalog missing: fall back to the second round's (same codes)
        catalog = cached("../6258/config/mun-e006258-cm.json", "catalog.json")
    cat = json.loads(catalog.read_text(encoding="utf-8"))

    cached("dados/br/br-c0001-e006257-u.json", "br.json")
    for uf in UFS:
        cached(f"dados/{uf}/{uf}-c0001-e006257-u.json", f"uf/{uf}.json")

    jobs = [(a["cd"], m["cd"]) for a in cat["abr"] for m in a["mu"]]
    # abroad first: small and needed for the country view
    jobs.sort(key=lambda j: j[0] != "zz")
    done = 0
    for uf, cd in jobs:
        cached(f"dados/{uf}/{uf}{cd}-c0001-e006257-u.json", f"mun/{uf}/{cd}.json")
        done += 1
        if done % 200 == 0:
            print(f"{done}/{len(jobs)} municipalities", flush=True)
    print(f"done: {done}/{len(jobs)} municipalities", flush=True)


if __name__ == "__main__":
    main()
