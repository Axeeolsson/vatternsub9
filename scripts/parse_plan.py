"""Parse Vätternrundan_detaljschema_sub9.xlsx into src/data/plan.seed.ts.

Dependency-free: reads the xlsx (a zip of XML) directly. Emits a typed
TypeScript module conforming to src/lib/types.ts.

Run:  python3 scripts/parse_plan.py [path-to-xlsx]
"""
import sys
import os
import re
import json
import zipfile
import datetime as dt
import xml.etree.ElementTree as ET

HERE = os.path.dirname(__file__)
DEFAULT_XLSX = os.path.expanduser(
    "~/Downloads/Vätternrundan_detaljschema_sub9.xlsx"
)
OUT = os.path.join(HERE, "..", "src", "data", "plan.seed.ts")

M = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}

# Week 1 Monday. Race day (week 43 Friday) must land on 2027-06-18.
BASE_MONDAY = dt.date(2026, 8, 24)
RACE_DATE = dt.date(2027, 6, 18)

DAY_NAMES = {
    "måndag": 1,
    "tisdag": 2,
    "onsdag": 3,
    "torsdag": 4,
    "fredag": 5,
    "lördag": 6,
    "söndag": 7,
}


def load_shared_strings(z):
    ss = []
    root = ET.fromstring(z.read("xl/sharedStrings.xml"))
    for si in root.findall("m:si", NS):
        ss.append("".join(t.text or "" for t in si.iter(M + "t")))
    return ss


def sheet_map(z):
    """Return {sheet_name: worksheet_xml_path}."""
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    rid_to_target = {}
    for rel in rels:
        rid_to_target[rel.get("Id")] = rel.get("Target")
    out = {}
    R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
    for sheet in wb.iter(M + "sheet"):
        name = sheet.get("name")
        rid = sheet.get(R)
        target = rid_to_target.get(rid, "")
        if not target.startswith("/"):
            target = "xl/" + target
        else:
            target = target.lstrip("/")
        out[name] = target
    return out


def read_rows(z, path, ss):
    """Yield {col_letter: value} dicts per row."""
    root = ET.fromstring(z.read(path))
    for row in root.iter(M + "row"):
        cells = {}
        for c in row:
            ref = c.get("r")
            if not ref:
                continue
            col = re.match(r"[A-Z]+", ref).group(0)
            t = c.get("t")
            v = c.find("m:v", NS)
            val = None
            if v is not None:
                val = v.text
                if t == "s":
                    val = ss[int(val)]
            iselem = c.find("m:is", NS)
            if iselem is not None:
                val = "".join(x.text or "" for x in iselem.iter())
            if val not in (None, ""):
                cells[col] = val
        if cells:
            yield cells


def classify(title, detail):
    s = (title + " " + detail).lower()
    tl = title.lower()
    if "vila" in tl or "ledig" in s:
        return "rest", "rest"
    if "race" in s or "vätternrundan" in s or "lopp" in s:
        return "race", "hard"
    if "återhämtning" in s or "lugn" in tl:
        return "recovery", "easy"
    if "styrka" in s:
        return "strength", "easy"
    if "kadens" in s:
        return "cadence", "easy"
    # Long endurance is decided by the title before intensity keywords,
    # since long-ride details often mention "tempo"/"jämnt tempo".
    if "långpass" in tl or "distans" in tl or "lång " in tl:
        return "long", "moderate"
    if "ftp" in s or "tröskel" in s or "sweet" in s or "threshold" in s:
        return "threshold", "hard"
    if "vo2" in s or "vo₂" in s:
        return "vo2", "hard"
    if "tempo" in tl:
        return "tempo", "hard"
    if "interval" in s:
        return "intervals", "hard"
    if "långpass" in s or "distans" in s:
        return "long", "moderate"
    if "tempo" in s:
        return "tempo", "hard"
    return "endurance", "moderate"


def parse_duration(detail):
    total = 0
    found = False
    for h, hm in re.findall(r"(\d+)\s*h(?:\s*(\d+)\s*min)?", detail):
        total += int(h) * 60 + (int(hm) if hm else 0)
        found = True
    if not found:
        m = re.search(r"(\d+)\s*min", detail)
        if m:
            total = int(m.group(1))
            found = True
    return total if found else None


def parse_zone(detail):
    m = re.search(r"\bZ([1-5])\b", detail)
    return "Z" + m.group(1) if m else None


def parse_intervals(detail):
    blocks = []
    # e.g. "6×2 min hög kadens (95–105 rpm) med 2 min lätt vila"
    for m in re.finditer(
        r"(\d+)\s*[×xX]\s*(\d+)\s*min([^.]*)", detail
    ):
        reps = int(m.group(1))
        on = int(m.group(2))
        tail = m.group(3)
        off = None
        mo = re.search(r"(\d+)\s*min[^.]*vila", tail)
        if mo:
            off = int(mo.group(1))
        cad = None
        mc = re.search(r"(\d+)\s*[–-]\s*(\d+)\s*rpm", tail)
        if mc:
            cad = [int(mc.group(1)), int(mc.group(2))]
        z = parse_zone(tail)
        block = {"reps": reps, "onMin": on}
        if off is not None:
            block["offMin"] = off
        if z:
            block["zone"] = z
        if cad:
            block["cadenceRpm"] = cad
        blocks.append(block)
    return blocks


def phase_short(phase):
    # "Fas 1 - Grundbas" -> "Grundbas"
    parts = phase.split("-", 1)
    return parts[1].strip() if len(parts) > 1 else phase.strip()


def main():
    xlsx = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_XLSX
    if not os.path.exists(xlsx):
        print("ERROR: xlsx not found:", xlsx)
        sys.exit(1)
    z = zipfile.ZipFile(xlsx)
    ss = load_shared_strings(z)
    smap = sheet_map(z)

    # --- overview: week -> (dateRange, phase, weekType) ---
    overview = {}
    ov_path = smap.get("Översikt")
    for row in read_rows(z, ov_path, ss):
        a = row.get("A")
        if a is None:
            continue
        try:
            wk = int(float(a))
        except ValueError:
            continue
        overview[wk] = {
            "dateRange": row.get("B", ""),
            "phase": row.get("C", ""),
            "weekType": row.get("D", ""),
        }

    weeks = []
    for wk in range(1, 44):
        sheet_name = "Vecka%d" % wk
        path = smap.get(sheet_name)
        if not path:
            continue
        meta = overview.get(wk, {"dateRange": "", "phase": "", "weekType": ""})
        week_start = BASE_MONDAY + dt.timedelta(days=(wk - 1) * 7)
        sessions = []
        for row in read_rows(z, path, ss):
            day = row.get("A")
            if not day:
                continue
            dname = day.strip().lower()
            dow = DAY_NAMES.get(dname)
            if not dow:
                continue  # header / title rows
            title = (row.get("B") or "").strip()
            detail = (row.get("C") or "").strip()
            if not title and not detail:
                continue
            stype, intensity = classify(title, detail)
            zone = parse_zone(title + " " + detail)
            date = week_start + dt.timedelta(days=dow - 1)
            sessions.append(
                {
                    "id": "w%d-d%d" % (wk, dow),
                    "week": wk,
                    "dayOfWeek": dow,
                    "date": date.isoformat(),
                    "title": title or "Pass",
                    "sessionType": stype,
                    "durationMin": parse_duration(detail),
                    "zone": zone,
                    "intervals": parse_intervals(detail),
                    "intensity": intensity,
                    "detail": detail,
                }
            )
        sessions.sort(key=lambda s: s["dayOfWeek"])
        weektype = meta["weekType"]
        is_recovery = (
            "återhämtning" in weektype.lower()
            or "nedtrappning" in weektype.lower()
        )
        weeks.append(
            {
                "week": wk,
                "dateRange": meta["dateRange"],
                "startDateISO": week_start.isoformat(),
                "phase": meta["phase"],
                "phaseShort": phase_short(meta["phase"]),
                "weekType": weektype,
                "isRecovery": is_recovery,
                "sessions": sessions,
            }
        )

    # sanity: race week friday
    wk43_start = BASE_MONDAY + dt.timedelta(days=42 * 7)
    race_friday = wk43_start + dt.timedelta(days=4)
    assert race_friday == RACE_DATE, (
        "Race date mismatch: computed %s vs expected %s"
        % (race_friday, RACE_DATE)
    )

    seed = {
        "raceDateISO": RACE_DATE.isoformat(),
        "startDateISO": BASE_MONDAY.isoformat(),
        "weeks": weeks,
    }

    body = json.dumps(seed, ensure_ascii=False, indent=2)
    ts = (
        "// AUTO-GENERATED by scripts/parse_plan.py — do not edit by hand.\n"
        "// Source: Vätternrundan_detaljschema_sub9.xlsx\n"
        'import type { PlanSeed } from "../lib/types";\n\n'
        "export const planSeed: PlanSeed = " + body + " as PlanSeed;\n\n"
        "export default planSeed;\n"
    )
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(ts)

    n_sessions = sum(len(w["sessions"]) for w in weeks)
    print("Wrote", os.path.abspath(OUT))
    print("weeks:", len(weeks), "sessions:", n_sessions)
    print("race day:", race_friday.isoformat(), "(", race_friday.strftime("%A"), ")")


if __name__ == "__main__":
    main()
