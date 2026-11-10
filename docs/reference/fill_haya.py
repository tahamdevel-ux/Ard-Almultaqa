"""Fill the Hay'a land manifest template without touching its layout.

The template (haya_template.xlsx) is opened as a zip and only cell values in
xl/worksheets/sheet1.xml are replaced. Logos, text boxes, fonts, colours,
column widths, merges and page setup stay byte-for-byte as in the original.
openpyxl cannot even read this file (its drawing has values openpyxl rejects),
and libraries that rebuild the workbook drop the text boxes, so this is the
only safe way.
"""
import json, re, sys, zipfile
from xml.sax.saxutils import escape

TEMPLATE, DATA, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
d = json.load(open(DATA, encoding="utf8"))

FIRST_ROW, ROWS = 19, 50          # pilgrim rows 19..68 (50 seats)
COLS = "BCDEFGHI"
# style ids taken from the original template
ST_NO = {"contractor": 20, "crew": 21, "pilgrim": 22}
ST_BODY = {"contractor": 24, "crew": 25, "pilgrim": 22}


def cell(ref, value, style):
    if value is None or value == "":
        return f'<c r="{ref}" s="{style}"/>'
    if isinstance(value, (int, float)):
        return f'<c r="{ref}" s="{style}"><v>{value}</v></c>'
    return f'<c r="{ref}" s="{style}" t="inlineStr"><is><t xml:space="preserve">{escape(str(value))}</t></is></c>'


with zipfile.ZipFile(TEMPLATE) as z:
    parts = {n: z.read(n) for n in z.namelist()}
sheet = parts["xl/worksheets/sheet1.xml"].decode("utf8")


def set_cell(ref, value):
    """Replace the value of an existing cell, keeping its style."""
    global sheet
    m = re.search(rf'<c r="{ref}"( s="\d+")?[^>]*?(/>|>.*?</c>)', sheet, re.S)
    style = int(re.search(r's="(\d+)"', m.group(0)).group(1)) if m.group(1) else 0
    sheet = sheet[:m.start()] + cell(ref, value, style) + sheet[m.end():]


# ---- header block (same cells as the original) ----
h = d["header"]
set_cell("D10", h["company"])
set_cell("E10", h["sub_company"])
set_cell("I10", h["transport_company"])
set_cell("I11", h["madinah_hotel"])
set_cell("I13", h["makkah_hotel"])
set_cell("D12", h["bus_number"])
set_cell("D14", h["departure_governorate"])
set_cell("D15", h["departure_date"])
set_cell("I15", h["route"])
set_cell("F12", f'التسلسل / {h["sequence"]}' if h.get("sequence") else "التسلسل /")

# ---- people: contractor first, driver, driver's assistant, then pilgrims ----
people = sorted(d["people"], key=lambda p: {"contractor": 0, "driver": 1, "assistant": 2}.get(p["role"], 3))
people = people[:ROWS]
contractor = next((p for p in people if p["role"] == "contractor"), None)
set_cell("D11", contractor["name_ar"] if contractor else "")
set_cell("D13", contractor["phone"] if contractor else "")

# counts row 17: adult, child, infant, guide, total
adults = sum(1 for p in people if p.get("age_group", "adult") == "adult")
children = sum(1 for p in people if p.get("age_group") == "child")
infants = sum(1 for p in people if p.get("age_group") == "infant")
set_cell("D17", adults)
set_cell("E17", children or "")
set_cell("F17", infants or "")
set_cell("H17", len(people))

rows_xml = []
for i in range(ROWS):
    r = FIRST_ROW + i
    p = people[i] if i < len(people) else None
    kind = "pilgrim"
    if p and p["role"] == "contractor":
        kind = "contractor"
    elif p and p["role"] in ("driver", "assistant"):
        kind = "crew"
    vals = ([i + 1, p["name_ar"], p.get("mother_name", ""), p.get("nationality", ""), p["birth_date"],
             p.get("gender", ""), p["passport"], p["first_name_en"]] if p else [None] * 8)
    cells = "".join(cell(f"{c}{r}", v, ST_NO[kind] if c == "B" else ST_BODY[kind]) for c, v in zip(COLS, vals))
    rows_xml.append((r, cells))

for r, cells in rows_xml:
    m = re.search(rf'(<row r="{r}"[^>]*>)(.*?)(</row>)', sheet, re.S)
    sheet = sheet[:m.start()] + m.group(1) + cells + m.group(3) + sheet[m.end():]

parts["xl/worksheets/sheet1.xml"] = sheet.encode("utf8")
with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
    for n, b in parts.items():
        z.writestr(n, b)
print("written", OUT, len(people), "people")
