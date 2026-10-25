"""Download and simplify the geometries the globe draws.

Outputs (committed, served as static files):
  web/public/geo/states.json      Brazilian states, properties {uf, name}
  web/public/geo/mun/<uf>.json    municipalities per state, properties {id (IBGE), name}
  web/public/geo/world.json       world-atlas 50m TopoJSON (decoded in the browser)

Sources: click_that_hood (states, from IBGE), tbrugz/geodata-br (municipalities, IBGE),
world-atlas (Natural Earth). Downloads are cached in data/.cache.

Usage: python3 -I data/build_geo.py
"""
import json
import math
import pathlib
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE = ROOT / "data/.cache"
OUT = ROOT / "web/public/geo"

STATES_URL = "https://cdn.jsdelivr.net/gh/codeforamerica/click_that_hood@master/public/data/brazil-states.geojson"
MUN_URL = "https://cdn.jsdelivr.net/gh/tbrugz/geodata-br@master/geojson/geojs-{code}-mun.json"
WORLD_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json"

IBGE_UF = {"AC": 12, "AL": 27, "AP": 16, "AM": 13, "BA": 29, "CE": 23, "DF": 53, "ES": 32, "GO": 52,
           "MA": 21, "MT": 51, "MS": 50, "MG": 31, "PA": 15, "PB": 25, "PR": 41, "PE": 26, "PI": 22,
           "RJ": 33, "RN": 24, "RS": 43, "RO": 11, "RR": 14, "SC": 42, "SP": 35, "SE": 28, "TO": 17}


def fetch(url: str, name: str) -> bytes:
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / name
    if not path.exists():
        with urllib.request.urlopen(url, timeout=120) as resp:
            path.write_bytes(resp.read())
    return path.read_bytes()


def douglas_peucker(pts, eps):
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = pts[a]
        bx, by = pts[b]
        dx, dy = bx - ax, by - ay
        length = math.hypot(dx, dy) or 1e-12
        idx, dmax = -1, 0.0
        for i in range(a + 1, b):
            px, py = pts[i]
            d = abs(dy * px - dx * py + bx * ay - by * ax) / length
            if d > dmax:
                idx, dmax = i, d
        if dmax > eps:
            keep[idx] = True
            stack += [(a, idx), (idx, b)]
    return [p for p, k in zip(pts, keep) if k]


def simplify_ring(ring, eps):
    # closed rings: split in two halves so the first and last point are not the same anchor
    half = len(ring) // 2
    pts = douglas_peucker(ring[: half + 1], eps)[:-1] + douglas_peucker(ring[half:], eps)
    pts = [[round(x, 3), round(y, 3)] for x, y in pts]
    out = []
    for p in pts:
        if not out or out[-1] != p:
            out.append(p)
    if out and out[0] != out[-1]:
        out.append(out[0])
    return out if len(out) >= 4 else None


def simplify_geometry(geom, eps):
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    result = []
    for poly in polys:
        rings = [r for r in (simplify_ring(r, eps) for r in poly) if r]
        if rings:
            result.append(rings)
    if not result:
        return None
    return {"type": "MultiPolygon", "coordinates": result}


def write(path: pathlib.Path, fc) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    body = json.dumps(fc, ensure_ascii=False, separators=(",", ":"))
    path.write_text(body, encoding="utf-8")
    return len(body)


def build_states() -> int:
    src = json.loads(fetch(STATES_URL, "brazil-states.geojson"))
    feats = []
    for f in src["features"]:
        geom = simplify_geometry(f["geometry"], 0.01)
        feats.append({"type": "Feature", "properties": {"uf": f["properties"]["sigla"], "name": f["properties"]["name"]},
                      "geometry": geom})
    assert len(feats) == 27, len(feats)
    return write(OUT / "states.json", {"type": "FeatureCollection", "features": feats})


def build_municipalities() -> int:
    total, count = 0, 0
    for uf, code in IBGE_UF.items():
        src = json.loads(fetch(MUN_URL.format(code=code), f"mun-{code}.json"))
        feats = []
        for f in src["features"]:
            geom = simplify_geometry(f["geometry"], 0.004)
            if geom is None:
                continue
            feats.append({"type": "Feature", "properties": {"id": f["properties"]["id"], "name": f["properties"]["name"]},
                          "geometry": geom})
        count += len(feats)
        total += write(OUT / f"mun/{uf.lower()}.json", {"type": "FeatureCollection", "features": feats})
    print(f"municipalities: {count}")
    return total


def build_world() -> int:
    body = fetch(WORLD_URL, "countries-50m.json")
    (OUT / "world.json").write_bytes(body)
    return len(body)


def main() -> None:
    sizes = {"states": build_states(), "municipalities": build_municipalities(), "world": build_world()}
    print({k: f"{v / 1e6:.2f} MB" for k, v in sizes.items()})


if __name__ == "__main__":
    main()
