from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont


parser = argparse.ArgumentParser()
for name in ("request", "font-id", "source", "subset", "manifest", "subset-id",
             "family-name", "postscript-name", "subset-prefix"):
    parser.add_argument(f"--{name}", required=True)
parser.add_argument("--style-name", default="Regular")
args = parser.parse_args()

REQUEST_PATH = Path(args.request).resolve()
SOURCE_PATH = Path(args.source).resolve()
SUBSET_PATH = Path(args.subset).resolve()
MANIFEST_PATH = Path(args.manifest).resolve()
if len({REQUEST_PATH, SOURCE_PATH, SUBSET_PATH, MANIFEST_PATH}) != 4:
    parser.error("input and output paths must be distinct")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


document = json.loads(REQUEST_PATH.read_text(encoding="utf-8"))
request = document.get("rendererHandoff", {}).get("measuredDrawContract", document)
font_asset = next(
    (asset for asset in request["fontAssets"] if asset["fontId"] == args.font_id),
    None,
)
if font_asset is None:
    raise RuntimeError(f"request does not declare font {args.font_id}")
if sha256(SOURCE_PATH) != font_asset["sha256"]:
    raise RuntimeError("registered source font hash mismatch")

paint_commands = request.get("paintCommands")
if paint_commands is None:
    paint_commands = [
        command
        for page in request["pages"]
        for command in page["commands"]
    ]

glyph_ids = sorted({
    glyph["glyphId"]
    for command in paint_commands
    if command["kind"] == "glyph-run"
    and command["fontId"] == args.font_id
    for glyph in command["glyphs"]
} | {0})

font = TTFont(SOURCE_PATH, recalcTimestamp=False)
options = subset.Options()
options.retain_gids = True
options.hinting = False
options.notdef_glyph = True
options.notdef_outline = True
options.recommended_glyphs = True
options.glyph_names = True
options.layout_features = ["*"]
subsetter = subset.Subsetter(options=options)
subsetter.populate(gids=glyph_ids)
subsetter.subset(font)

name_values = {
    1: args.family_name,
    2: args.style_name,
    3: f"{args.family_name} {args.style_name}; {args.subset_id}",
    4: f"{args.family_name} {args.style_name}",
    6: args.postscript_name,
    16: args.family_name,
    17: args.style_name,
}
for record in font["name"].names:
    replacement = name_values.get(record.nameID)
    if replacement is not None:
        record.string = replacement.encode(record.getEncoding())

SUBSET_PATH.parent.mkdir(parents=True, exist_ok=True)
font.save(SUBSET_PATH, reorderTables=True)

subset_font = TTFont(SUBSET_PATH, recalcTimestamp=False)
manifest = {
    "manifestVersion": 1,
    "subsetId": args.subset_id,
    "fontId": font_asset["fontId"],
    "postScriptName": args.postscript_name,
    "subsetPrefix": args.subset_prefix,
    "source": {
        "path": SOURCE_PATH.as_posix(),
        "sha256": font_asset["sha256"],
        "bytes": SOURCE_PATH.stat().st_size,
    },
    "subset": {
        "path": SUBSET_PATH.as_posix(),
        "sha256": sha256(SUBSET_PATH),
        "bytes": SUBSET_PATH.stat().st_size,
        "sfntGlyphCount": subset_font["maxp"].numGlyphs,
        "retainedGlyphIds": glyph_ids,
        "retainGlyphIds": True,
        "hintingRetained": False,
    },
    "fontMetrics": {
        "unitsPerEm": subset_font["head"].unitsPerEm,
        "fontBBox": [
            subset_font["head"].xMin,
            subset_font["head"].yMin,
            subset_font["head"].xMax,
            subset_font["head"].yMax,
        ],
        "ascent": subset_font["hhea"].ascent,
        "descent": subset_font["hhea"].descent,
        "capHeight": getattr(subset_font["OS/2"], "sCapHeight", subset_font["hhea"].ascent),
    },
    "license": {
        "id": "OFL-1.1",
        "path": "assets/fonts/OFL.txt",
        "reservedNameRemovedFromDerivative": True,
    },
    "builder": {
        "fontToolsVersion": "4.58.2",
        "shaperRevision": "rustybuzz-0.20.1",
    },
}
MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
MANIFEST_PATH.write_bytes((json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
print(SUBSET_PATH)
print(MANIFEST_PATH)
