"""Build the abroad city -> country table used by the API and the web app.

The TSE lists abroad results by city only. This joins the TSE municipality
catalog (block "zz") with our manual table in abroad_countries.py and fails
loudly if the TSE has a city the table does not know.

Usage: python3 -I data/build_abroad.py
"""
import json
import pathlib
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "data"))
from abroad_countries import C  # noqa: E402

CATALOG_URL = "https://resultados.tse.jus.br/oficial/ele2026/6258/config/mun-e006258-cm.json"
OUTPUTS = [ROOT / "api/assets/abroad-cities.json", ROOT / "web/public/data/abroad-cities.json"]


def main() -> None:
    with urllib.request.urlopen(CATALOG_URL, timeout=60) as resp:
        catalog = json.load(resp)
    abroad = next(a for a in catalog["abr"] if a["cd"] == "zz")["mu"]

    missing = [m for m in abroad if m["cd"] not in C]
    if missing:
        sys.exit(f"cities missing from abroad_countries.py: {missing}")

    cities = []
    for m in abroad:
        country, iso, lat, lon = C[m["cd"]]
        cities.append({
            "cd": m["cd"],
            "nm": m["nm"].title(),
            # overseas territories keep a qualifier in the table; the country name is what we show
            "country": country.split(" (")[0],
            "iso": iso,
            "lat": lat,
            "lon": lon,
        })
    cities.sort(key=lambda c: c["cd"])

    body = json.dumps(cities, ensure_ascii=False, separators=(",", ":"))
    for out in OUTPUTS:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(body, encoding="utf-8")
    print(f"{len(cities)} cities, {len({c['iso'] for c in cities})} countries")


if __name__ == "__main__":
    main()
