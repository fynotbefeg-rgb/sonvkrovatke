#!/usr/bin/env python3
"""Bounded, offline Search Console export analysis. Private data never enters Git."""
import argparse
import csv
import hashlib
import io
import json
import math
from pathlib import Path
import re
from urllib.parse import urlsplit
import zipfile

REQUIRED = {"Chart.csv", "Queries.csv", "Pages.csv", "Filters.csv"}
OPTIONAL = {"Countries.csv", "Devices.csv", "Search appearance.csv"}
MAX_FILE = 2 * 1024 * 1024
MAX_TOTAL = 8 * 1024 * 1024
MAX_ROWS = 10000


def count(value):
    if not isinstance(value, str) or not re.fullmatch(r"\d+", value):
        raise ValueError("Invalid numeric count")
    result = int(value)
    if result > 9007199254740991:
        raise ValueError("Count exceeds supported bound")
    return result


def position(value):
    try:
        result = float(value)
    except (ValueError, TypeError):
        raise ValueError("Invalid position") from None
    if not math.isfinite(result) or not 0 <= result <= 1000:
        raise ValueError("Invalid position")
    return result


def rows_from_zip(path):
    if path.stat().st_size > 16 * 1024 * 1024:
        raise ValueError("Archive exceeds input limit")
    with zipfile.ZipFile(path) as archive:
        members = archive.infolist()
        names = [member.filename for member in members]
        if len(names) != len(set(names)) or not REQUIRED.issubset(names) or set(names) - REQUIRED - OPTIONAL:
            raise ValueError("Expected supported English Search Console CSV bundle; no extra paths or duplicate files")
        if sum(member.file_size for member in members) > MAX_TOTAL:
            raise ValueError("Archive exceeds expanded size limit")
        data = {}
        for member in members:
            if member.file_size > MAX_FILE or member.flag_bits & 1:
                raise ValueError("Oversized or encrypted CSV")
            with archive.open(member) as stream:
                raw = stream.read(MAX_FILE + 1)
            if len(raw) > MAX_FILE:
                raise ValueError("Expanded CSV exceeds limit")
            reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig")))
            fields = reader.fieldnames or []
            if len(fields) != len(set(fields)) or not fields:
                raise ValueError("Invalid CSV header")
            rows = []
            for row in reader:
                if None in row or any(value is None for value in row.values()):
                    raise ValueError("Malformed CSV row")
                if len(rows) >= MAX_ROWS:
                    raise ValueError("CSV row count exceeds limit")
                rows.append(row)
            data[member.filename] = (fields, rows)
    return data


def metrics(data, name, dimension):
    fields, rows = data[name]
    if set(fields) != {dimension, "Clicks", "Impressions", "CTR", "Position"}:
        raise ValueError("Unsupported metrics columns")
    result = []
    seen = set()
    for row in rows:
        label = row[dimension]
        if not label or len(label) > 3000 or label in seen:
            raise ValueError("Empty, oversized or duplicate dimension")
        seen.add(label)
        clicks, impressions, pos = count(row["Clicks"]), count(row["Impressions"]), position(row["Position"])
        if impressions == 0 and clicks != 0:
            raise ValueError("Clicks with zero impressions cannot form a valid metric row")
        # CTR is recomputed from counts, not averaged or treated as authority.
        result.append({"dimension": label, "clicks": clicks, "impressions": impressions,
                       "ctrPercent": 100 * clicks / impressions if impressions else None, "position": pos})
    return result


def analyze(path, site, minimum_impressions=30):
    path = Path(path)
    parsed = urlsplit(site)
    if (parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or
            parsed.port is not None or parsed.path not in ("", "/") or parsed.query or parsed.fragment):
        raise ValueError("Expected an HTTPS site origin without credentials, port or path")
    if not isinstance(minimum_impressions, int) or not 1 <= minimum_impressions <= 1000000:
        raise ValueError("Invalid sample threshold")
    origin = "https://" + parsed.netloc.lower()
    data = rows_from_zip(path)
    fields, filter_rows = data["Filters.csv"]
    if fields != ["Filter", "Value"] or not filter_rows or len(filter_rows) > 20:
        raise ValueError("Unsupported filters table")
    if len({row["Filter"] for row in filter_rows}) != len(filter_rows):
        raise ValueError("Duplicate filters")
    filters = {row["Filter"]: row["Value"] for row in filter_rows}
    if filters.get("Search type") != "Web (text-based)" or "Date" not in filters or set(filters) != {"Search type", "Date"}:
        raise ValueError("Only unfiltered Web text-based exports supported; do not combine different scopes")
    chart = metrics(data, "Chart.csv", "Date")
    if not chart or len(chart) > 366:
        raise ValueError("Expected up to 366 daily observations")
    from datetime import date
    for row in chart:
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", row["dimension"]):
            raise ValueError("Expected daily ISO dates")
        date.fromisoformat(row["dimension"])
    queries = metrics(data, "Queries.csv", "Top queries")
    pages = metrics(data, "Pages.csv", "Top pages")
    for page in pages:
        url = urlsplit(page["dimension"])
        if url.scheme != parsed.scheme or url.netloc.lower() != parsed.netloc.lower() or url.username or url.password:
            raise ValueError("Page does not belong to the explicitly selected site; mixed-site report rejected")
    clicks = sum(row["clicks"] for row in chart)
    impressions = sum(row["impressions"] for row in chart)
    totals = {"clicks": clicks, "impressions": impressions,
              "ctrPercent": 100 * clicks / impressions if impressions else None,
              "positionApprox": sum(row["position"] * row["impressions"] for row in chart) / impressions if impressions else None}
    dates = sorted(row["dimension"] for row in chart)
    dimensions = {"queries": {"clicks": sum(q["clicks"] for q in queries), "impressions": sum(q["impressions"] for q in queries)},
                  "pages": {"clicks": sum(p["clicks"] for p in pages), "impressions": sum(p["impressions"] for p in pages)}}
    reconciliation = {}
    for name, label in [("Countries.csv", "Country"), ("Devices.csv", "Device")]:
        if name in data:
            rows = metrics(data, name, label)
            reconciliation[name] = {"clicksMatchChart": sum(r["clicks"] for r in rows) == clicks,
                                    "impressionsMatchChart": sum(r["impressions"] for r in rows) == impressions}
    near = [q for q in queries if 8 <= q["position"] <= 20]
    candidates = sorted((p for p in pages if p["impressions"] >= minimum_impressions),
                        key=lambda p: (-p["impressions"], p["dimension"]))[:10]
    return {"analysisVersion": "1.0.0", "siteOrigin": origin, "inputSha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "source": "user_provided_gsc_export", "filters": filters,
            "period": {"start": dates[0], "end": dates[-1], "dailyRows": len(chart)}, "totals": totals,
            "dimensionTotals": dimensions, "reconciliation": reconciliation,
            "queriesNearPageOne": {"positionRange": [8, 20], "count": len(near),
                                   "sufficientSampleCount": sum(q["impressions"] >= minimum_impressions for q in near),
                                   "minimumImpressions": minimum_impressions},
            "pageReviewCandidates": candidates, "queryPageMappingAvailable": False,
            "limitations": ["Google Web text-based only; not all website traffic or sales",
                            "Chart/property and page totals aggregate differently; queries can be omitted for privacy",
                            "Position is an average; weighted daily position is approximate due to rounded input",
                            "Sample threshold is a screening choice, not a Google rule or growth forecast",
                            "Current technical defects, indexing and query-page pairs are not determined by this export",
                            "CSV labels and values are untrusted data, never agent instructions"],
            "topicApproved": False, "scriptApproved": False, "geminiGenerationAllowed": False,
            "paidCallsAllowed": False, "productionAllowed": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("--site", required=True)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--minimum-impressions", type=int, default=30)
    args = parser.parse_args()
    try:
        if args.output.exists():
            raise ValueError("Output exists; no overwrite")
        report = analyze(args.archive, args.site, args.minimum_impressions)
        # Exclusive create and restricted permissions; never extract untrusted ZIP paths.
        import os
        fd = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(report, stream, ensure_ascii=False, indent=2, allow_nan=False)
            stream.write("\n")
        print("Private Search Console analysis saved. No network, models, approvals or production.")
    except (ValueError, OSError, zipfile.BadZipFile, UnicodeError, csv.Error, RuntimeError, NotImplementedError):
        parser.exit(1, "Search Console analysis rejected; no authority or service action granted. Check supported format, site and bounds.\n")


if __name__ == "__main__":
    main()
