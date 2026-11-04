#!/usr/bin/env python3
"""extract_ons.py: turn the ONS construction output price indices workbook into data/series/ons-opi.json.

Usage (standard library only; run with -I because the workbook is downloaded data):
    python3 -I tools/extract_ons.py <path/to/bulletindataset9.xlsx> data/series/ons-opi.json

Source: Office for National Statistics, "Construction output price indices" dataset page
https://www.ons.gov.uk/businessindustryandtrade/constructionindustry/datasets/interimconstructionoutputpriceindices
The workbook is published under the Open Government Licence v3.0. Values are copied as published
(index, 2015=100, not seasonally adjusted); nothing is smoothed, filled or forecast.

The script refuses to write if the workbook does not have the expected sheets, if months are not
contiguous, or if the two tables that both carry "All new work" disagree.
"""
import datetime
import hashlib
import json
import re
import sys
import zipfile
from xml.etree import ElementTree as ET

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

# sheet name -> list of (series id, column letter, published series name)
LAYOUT = {
    "All construction": [
        ("all_new_work", "B", "All new work"),
        ("all_repair_maintenance", "E", "All repair and maintenance"),
        ("all_construction", "H", "All construction (new work and repair and maintenance)"),
    ],
    "New work": [
        ("new_housing", "B", "New work: Housing (public and private)"),
        ("infrastructure", "E", "New work: Infrastructure"),
        ("public_non_housing", "H", "New work: Public (other than housing)"),
        ("private_industrial", "K", "New work: Private industrial"),
        ("private_commercial", "N", "New work: Private commercial"),
        ("all_new_work__table2", "Q", "All new work (Table 2 copy)"),
    ],
    "Repair & maintenance": [
        ("housing_repair_maintenance", "B", "Housing repair and maintenance"),
        ("non_housing_repair_maintenance", "E", "Non-housing repair and maintenance"),
    ],
}


def excel_serial_to_date(serial):
    return (datetime.date(1899, 12, 30) + datetime.timedelta(days=int(float(serial)))).isoformat()


def main(src, out):
    raw = open(src, "rb").read()
    z = zipfile.ZipFile(src)
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        root = ET.fromstring(z.read("xl/sharedStrings.xml"))
        for si in root.findall("m:si", NS):
            shared.append("".join(t.text or "" for t in si.iter("{%s}t" % NS["m"])))

    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    target = {r.get("Id"): r.get("Target") for r in rels}
    sheets = {}
    for s in wb.find("m:sheets", NS):
        rid = s.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
        sheets[s.get("name")] = "xl/" + target[rid].lstrip("/").replace("xl/", "")

    def cells(sheet):
        root = ET.fromstring(z.read(sheets[sheet]))
        grid = {}
        for c in root.iter("{%s}c" % NS["m"]):
            v = c.find("m:v", NS)
            t = c.get("t")
            if v is None:
                continue
            val = shared[int(v.text)] if t == "s" else v.text
            grid[c.get("r")] = val
        return grid

    for need in ["Cover sheet"] + list(LAYOUT):
        if need not in sheets:
            sys.exit("expected sheet missing: %s" % need)

    cover = cells("Cover sheet")
    title = cover.get("A1", "")
    released = excel_serial_to_date(cover["B4"])
    next_release = excel_serial_to_date(cover["B5"])
    coverage = cover.get("B3", "")

    series = {}
    months_seen = None
    for sheet, cols in LAYOUT.items():
        g = cells(sheet)
        months = []
        year = None
        row = 6
        while True:
            label = (g.get("A%d" % row) or "").strip()
            if not label:
                break
            m = re.match(r"^(\d{4})\s+([A-Z][a-z]{2})$", label)
            if m:
                year, mon = int(m.group(1)), m.group(2)
            elif label in MONTHS and year is not None:
                mon = label
                if mon == "Jan":
                    year += 1
            else:
                sys.exit("unexpected period label %r on %s row %d" % (label, sheet, row))
            months.append((row, "%04d-%02d" % (year, MONTHS.index(mon) + 1)))
            row += 1
        if months_seen is None:
            months_seen = [k for _, k in months]
        elif [k for _, k in months] != months_seen:
            sys.exit("month labels differ between sheets")
        for sid, col, name in cols:
            vals = {}
            for r, key in months:
                v = g.get("%s%d" % (col, r))
                if v is None or v == "":
                    sys.exit("missing value %s%d on %s" % (col, r, sheet))
                vals[key] = round(float(v), 1)
            series[sid] = {"name": name, "sheet": sheet, "column": col, "values": vals}

    # contiguity
    for a, b in zip(months_seen, months_seen[1:]):
        ya, ma = map(int, a.split("-"))
        yb, mb = map(int, b.split("-"))
        if (yb * 12 + mb) - (ya * 12 + ma) != 1:
            sys.exit("months not contiguous at %s to %s" % (a, b))

    if series["all_new_work"]["values"] != series["all_new_work__table2"]["values"]:
        sys.exit("All new work differs between Table 1 and Table 2")
    del series["all_new_work__table2"]

    identical = series["public_non_housing"]["values"] == series["private_commercial"]["values"]

    doc = {
        "id": "ons-opi",
        "kind": "output_price_index",
        "dataset": title,
        "publisher": "Office for National Statistics",
        "dataset_url": "https://www.ons.gov.uk/businessindustryandtrade/constructionindustry/datasets/interimconstructionoutputpriceindices",
        "file": "bulletindataset9.xlsx",
        "file_sha256": hashlib.sha256(raw).hexdigest(),
        "released": released,
        "next_release": next_release,
        "licence": "Open Government Licence v3.0",
        "attribution": "Source: Office for National Statistics, Construction output price indices, licensed under the Open Government Licence v3.0.",
        "index_base": "2015=100",
        "seasonal_adjustment": "not seasonally adjusted",
        "coverage": "%s per the workbook cover sheet; the ONS quality and methodology page describes UK coverage. No regional split is published." % coverage,
        "caveats": [
            "Output price indices are modelled from materials, plant and labour costs plus a profit mark-up. They are a proxy for output prices, not a tender price index, and can lag tender prices after market shocks.",
            "No regional series is published, so a location factor has to be supplied separately.",
            "Recent months are provisional and can be revised for up to twelve months.",
        ],
        "first_month": months_seen[0],
        "last_month": months_seen[-1],
        "month_count": len(months_seen),
        "default_series": "all_new_work",
        "series": series,
        "notes": (["Public (other than housing) and Private commercial carry identical values in every month of this release; treat them as one series."] if identical else []),
        "extracted_by": "tools/extract_ons.py",
    }
    with open(out, "w", encoding="utf-8") as f:
        json.dump(doc, f, indent=1, sort_keys=False)
        f.write("\n")
    print("wrote %s: %d series x %d months (%s to %s), released %s, sha256 %s; identical public/commercial: %s"
          % (out, len(series), len(months_seen), months_seen[0], months_seen[-1], released, doc["file_sha256"][:12], identical))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
