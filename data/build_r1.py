"""Build the static first-round snapshot served by the web app (web/public/data/r1).

Reads the raw TSE files downloaded by fetch_r1.py (data/.cache/r1) and writes:
  summary.json   candidates (sorted by votes in Brazil), Brazil, each UF, abroad (zz),
                 the sum of the UFs and per-country totals (sum of the abroad cities)
  mun/<uf>.json  municipalities keyed by IBGE id
  abroad.json    abroad cities keyed by TSE code

Every area is a compact array: [el, comp, abst, vv, vb, vn, st, ts, *votes], with the
votes aligned with the candidate order of summary.json. The first round is final, so
production never calls the TSE for it.

Usage: python3 -I data/build_r1.py [--allow-missing]
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE = ROOT / "data/.cache/r1"
OUT = ROOT / "web/public/data/r1"
ABROAD = ROOT / "web/public/data/abroad-cities.json"
UFS = ["ac", "al", "am", "ap", "ba", "ce", "df", "es", "go", "ma", "mg", "ms", "mt", "pa",
       "pb", "pe", "pi", "pr", "rj", "rn", "ro", "rr", "rs", "sc", "se", "sp", "to"]
# TSE ballot names come without some accents; keep the names the site already shows
NAME_OVERRIDES = {22: "Flávio Bolsonaro"}
LOWER = {"da", "de", "do", "das", "dos", "e"}
FIELDS = 8  # numbers before the votes


def title(name: str) -> str:
    words = name.lower().split()
    return " ".join(w if i and w in LOWER else w[:1].upper() + w[1:] for i, w in enumerate(words))


def candidates_of(raw: dict) -> list[dict]:
    out = []
    for agr in raw["carg"][0]["agr"]:
        for par in agr["par"]:
            for c in par["cand"]:
                n = int(c["n"])
                out.append({
                    "n": n,
                    "name": NAME_OVERRIDES.get(n, title(c["nmu"])),
                    "party": par["sg"],
                    "sqcand": c["sqcand"],
                    "runoff": c["st"] == "2º turno",
                    "votes": int(c["vap"] or 0),
                })
    return out


def area(raw: dict, order: list[int]) -> list[int]:
    e, s, v = raw["e"], raw["s"], raw["v"]
    votes = {c["n"]: c["votes"] for c in candidates_of(raw)}
    head = [e["te"], e["c"], e["a"], v["vv"], v["vb"], v["tvn"], s["st"], s["ts"]]
    return [int(x or 0) for x in head] + [votes.get(n, 0) for n in order]


def add(total: list[int] | None, r: list[int]) -> list[int]:
    return list(r) if total is None else [a + b for a, b in zip(total, r)]


def load(path: pathlib.Path) -> dict | None:
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def write(path: pathlib.Path, data: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def main() -> None:
    allow_missing = "--allow-missing" in sys.argv
    br = load(CACHE / "br.json")
    catalog = load(CACHE / "catalog.json")
    if br is None or catalog is None:
        sys.exit("run fetch_r1.py first")

    cands = sorted(candidates_of(br), key=lambda c: -c["votes"])
    order = [c["n"] for c in cands]
    summary = {
        "dg": br["dg"], "hg": br["hg"],
        "candidates": [{k: c[k] for k in ("n", "name", "party", "sqcand", "runoff")} for c in cands],
        "br": area(br, order), "ufs": {},
    }

    brufs = None
    for uf in UFS + ["zz"]:
        raw = load(CACHE / f"uf/{uf}.json")
        if raw is None:
            sys.exit(f"missing state file {uf}")
        r = area(raw, order)
        if uf == "zz":
            summary["zz"] = r
        else:
            summary["ufs"][uf] = r
            brufs = add(brufs, r)
    summary["brUfsSum"] = brufs

    missing = []
    for block in catalog["abr"]:
        uf = block["cd"]
        items = {}
        before = len(missing)
        for m in block["mu"]:
            raw = load(CACHE / f"mun/{uf}/{m['cd']}.json")
            if raw is None:
                missing.append(f"{uf}{m['cd']}")
                continue
            items[m["cd"] if uf == "zz" else m["cdi"]] = area(raw, order)
        write(OUT / ("abroad.json" if uf == "zz" else f"mun/{uf}.json"), items)
        if uf == "zz":
            abroad_items = items
        elif len(missing) == before:
            # the municipalities of a fully downloaded state must add up to the state file
            total = None
            for r in items.values():
                total = add(total, r)
            if total and total[FIELDS:] != summary["ufs"][uf][FIELDS:]:
                sys.exit(f"{uf}: municipalities do not add up to the state total")

    countries: dict[str, list[int]] = {}
    for city in json.loads(ABROAD.read_text(encoding="utf-8")):
        r = abroad_items.get(city["cd"])
        if r is not None:
            countries[str(city["iso"])] = add(countries.get(str(city["iso"])), r)
    summary["countries"] = countries

    if missing:
        print(f"{len(missing)} area files missing (first: {missing[:5]})")
        if not allow_missing:
            sys.exit("incomplete download: rerun fetch_r1.py or pass --allow-missing")
    write(OUT / "summary.json", summary)
    print(f"{len(cands)} candidates, {len(summary['ufs'])} states, {len(countries)} countries")


if __name__ == "__main__":
    main()
