# FlowDoc Core

## Authority Boundary

Owner: flowdoc-core. This README describes this package's local build and resource
and PDF API. Shared MVP scope and status belong to Project Control's
`docs/domains/flowdoc-export-mvp-r2-runtime-plan-2026-10-07.md`.

Development 0.1.8 validates templates, binds typed data and renders TextBlocks,
images, merged tables, cell repeats, Area subformats, links and contents to PDF.
There is no HTTP server or database here. Start with the Thai
[template guide](docs/template-guide.md) for model 4–11 contracts and examples.

## Template and data API

```ts
import {validateTemplate, prepareGeneration, composeDocument} from '@flowdoc/core';
const registered = validateTemplate(rawTemplateJson);
if (!registered.ok) throw new Error(JSON.stringify(registered.issues));
const prepared = prepareGeneration(registered.value, requestJson);
if (!prepared.ok) throw new Error(JSON.stringify(prepared.issues));
const composed = composeDocument(registered.value, prepared.value);
// Pass composed.value to engine.value.generatePdf only after composed.ok.
// Preserve prepared.warnings in the caller's job/status record.
```

Use raw JSON text when registering templates: duplicate decoded property names
are rejected. Already parsed objects are accepted, but keys previously discarded
by JSON.parse cannot be recovered. Service registration retains this
raw-text boundary. The returned definition is a detached frozen copy with a
canonical SHA-256 fingerprint (including template identity/version). It is not
authentication. Preparation pins this definition; it never selects a version.

Fields include strings, images, links, one-level object arrays and model 11 Area.
Supported item types depend on the node model; see the template guide. Required
missing fields fail even with defaults; optional absent fields use their declared
default or `""`/`[]`. Supplied wrong types/null fail without coercion. Unknown
business fields are ignored with warnings; unknown formats are skipped. At least
one accepted invocation is required. Envelope properties are strict. Examples in
the template must validate without either errors or warnings.

Persist PreparedInput as JSON if needed and keep the original request separately.
Composition rechecks its pin, complete normalized data, index order and coverage.
It applies no replacement defaults to a corrupted prepared snapshot. Optional
absent/no-default strings normalize to empty even with allowEmpty=false; that
canonical empty value is valid when a prepared snapshot is read back. This
snapshot check is structural validation, not proof of who wrote the values.

Formats contain independent text/table graphs. Table repeats replace one source
row with zero or more rows, using explicit global/local/item scopes. Generated
IDs and sourceMap preserve original request indices, including skipped entries.
Each invocation owns its nodes/data; no mutable defaults or outputs are shared.
Newline values become line-break leaves, empty values create no text leaves, and
all text inherits its parent TextBlock style. No expression evaluator is used.
`fixtures/srs-basic/` demonstrates a text/table/text request;
`fixtures/binding-text/` demonstrates the text-only PDF path.

## Release branches

Version 0.1.0 is the first local export package release. `release` contains one
snapshot commit per accepted version; annotated `v<version>` tags identify those
commits and must not be moved. Development history remains on development branches.
The initial release snapshot has its own root; later releases must parent the
previous release commit and include only the reviewed candidate tree. Record the
development source commit in each release commit and verify tree equality. Do not
merge unrelated histories blindly. Build and verify the package before tagging;
never overwrite a released package under the same version. Service pins its exact
tarball and checksum. This local release is not a public registry publication.

## Local development

Use Node 24 and `npm ci`, then `npm run build` and `npm test`. The resource runtime
supports Linux/amd64 with glibc. Windows can build/test the TypeScript boundary;
native execution is checked through Docker Desktop's Linux engine.

Run `npm run check:package` to build native tools using the retained Cargo.lock,
generate resource hashes, pack the package, and install the exact tarball in a
separate Linux consumer. It writes the tarball, checksum/result and consumer lock
to `artifacts/<run>/`. Consumer execution has no network, source mounts or root
privileges. Docker image digests and npm versions are pinned. Builds need network
access for locked dependencies. Images and build output are retained for inspection.

Do not run `npm pack` from an unprepared host checkout: the native files and
resource manifest are generated in the Linux build. Installation has no hooks,
compiler invocation or runtime downloads. This prerelease is private/unpublished.

## Resource API

```ts
import { loadBundledResources } from '@flowdoc/core';

const result = await loadBundledResources({
  pythonExecutable: '/usr/local/bin/python',
  tempRoot: '/app/tmp', // existing, writable, absolute directory
});
if (!result.ok) {
  console.error(result.issues);
} else {
  const resources = result.value;
  // Explicit absolute executable/helper/font paths for engine initialization.
}
```

The caller supplies Python 3.11 with fontTools 4.58.2 and a temporary directory.
The loader checks bundled hashes, executable readiness and temporary writes.
Initialize once per engine instance, not for every glyph or page. Failures return
`RESOURCE_UNAVAILABLE`; there is no font/runtime fallback. Internal import paths
are not public API. The subset helper is internal and requires explicit inputs
and separate output paths; it preserves source font bytes and glyph IDs.

## PDF API

```ts
import { createPdfEngine, type ResolvedDocument } from '@flowdoc/core';
// After a successful loadBundledResources call:
const engine = await createPdfEngine(resources);
if (engine.ok) {
  const pdf = await engine.value.generatePdf(resolvedDocument);
  // pdf.value contains bytes/mediaType/pageCount only when pdf.ok is true.
}
```

`resolvedDocument` follows the exported `ResolvedDocument` type. Repository
fixtures in `fixtures/pdf/` are runnable examples. They contain book page/style
settings and an ordered node graph, not measured coordinates. Supported pages
are A4 portrait or landscape with mm/pt margins. Text uses paragraph TextBlocks,
text/line-break/link inlines and Sarabun normal/bold/italic combinations.
Images and later-model features follow the template guide. Tables
use declared fixed-width columns; merged cells require model 6 or newer.
Nested tables, unresolved tags, custom
geometry and unrecognized props return LAYOUT_FAILED.
All root nodes need sourceMap entries. Input is copied before asynchronous work.

Adjacent text leaves form a paragraph; CRLF/CR becomes LF. Explicit newlines and
empty TextBlocks consume line height. ICU boundaries determine wrapping; a long
unbreakable segment uses measured whole graphemes. Text ink must fit the configured
width and line height or generation fails. The overflowing whole line moves to
the next page. No font fallback or clipping is used to hide unsupported content.

Each generation uses a separate temporary directory and cleans it on success or
failure. Child processes have a 30-second timeout and 16-MiB output cap; exceeding
either returns a resource failure. Package initialization checks resources; files
should remain immutable for an engine's lifetime. No global cross-job text cache.
Current PDF font CIDs are limited to 65535 per font per document; exceeding that
returns PDF_RENDER_FAILED. High-volume queueing is a later Service concern.

Tables have one optional header row and default 4 pt cell padding with 0.5 pt black
borders. Column widths must fit the page; text must fit the remaining cell width.
The tallest cell determines row height. Multiple TextBlocks per cell flow in
order. `allowBreak:true` continues at measured whole-line boundaries, retaining
row identity; finished cells remain blank on later fragments. `allowBreak:false`
moves the row intact, or returns LAYOUT_FAILED if it exceeds the usable page.
`repeatHeaderRows:true` repeats the header on continuation pages. The header
stays with at least the next body line; impossible header/body combinations fail
instead of producing blank pages. An empty collection renders only its header.
Page breaks do not mutate the composed graph. Model 6 adds merging; model 9 adds
direct TextBlock/Image children and per-side padding (including zero). Model 10
adds cell repeats and image item binding; model 11 adds owned Area subformats.
Nested tables and Columns in cells remain unsupported.

`fixtures/table/` contains raw template/short/empty/long requests. Its body style
uses 12 pt text / 20 pt lines, providing enough room for measured Sarabun Thai ink;
the older R1 design fixture's illustrative 18 pt setting is not a fit guarantee.
The installed consumer generates `table-short.pdf`, `table-empty.pdf` and
`table-long.pdf`, plus expected text and resolved graphs for inspection.

`npm run check:package` also creates `bound-text.pdf`, `four-styles.pdf` and `overflow.pdf` with
expected text and result metadata in the artifact directory. Inspect extracted
text, embedded fonts and rendered pages before claiming visual acceptance; the
consumer command alone does not perform the host Poppler/visual review.

## Merged tables (model 6)

Development model 6 adds explicitly placed merged table cells. For a table using
explicit placement, every cell supplies zero-based `columnIndex`; `rowSpan` and
`colSpan` default to 1. Covered slots have no placeholder nodes. Fully covered
rows may have empty `cellIds`; intentional empty cells have empty `childIds`.
Overlaps, holes, out-of-bounds spans, mixed placement, header/body crossing and
rowspans touching repeated rows are rejected. Horizontal merging in repeated
rows is supported. Model 4/5 retain their ordinary-table contract.

Merged cells measure text at combined column width. Vertical span height deficits
extend only the final covered row. Whole lines continue across pages under the
same logical cell; a protected row remains intact. Model 6 itself does not add
images in cells (added in model 9), nested tables or column containers. The packed consumer additionally
produces `merged-short.pdf` and `merged-long.pdf` for visual inspection.


## Reused implementation

Native source/Cargo.lock and the subset algorithm were extracted from
`flowdoc-vnext-core` commit `fa76c74356e5cfc9296f6a86c0bfac690e8416f6` through
the validated Linux runtime probe. They require no old repository at runtime.
Rustybuzz 0.20.1 and ICU segmenter 2.2.0 remain locked. Sarabun Regular, Bold,
Italic and BoldItalic ship with their SIL Open Font License in `assets/fonts/OFL.txt`.
The derivative subset helper uses explicit output names rather than the source
font's reserved family name. Runtime packaging currently targets the pinned Debian
Bookworm images only; other platforms are not claimed as verified.

## Model 7 links and destinations

Model 7 retains image and merged-cell support and adds inline `url` (value),
`link` (text/url) and `reference` (text/target) commands. External destinations
accept absolute HTTP/HTTPS URLs without credentials or control characters.
TextBlock `props.anchorId` identifies the first nonblank positioned line, including
inside cells; duplicate/missing or entirely empty destinations fail export.

A `link` schema field accepts one of those command objects without an inline id.
It can also occur in an array item schema. A field-ref inserts the typed command;
optional omission emits nothing, while supplied empty strings/null are invalid.
String-valued command properties and anchorId also accept scoped string bindings
`{scope:'global'|'local'|'item',key:'fieldName'}` in templates.

PDF hit areas follow existing glyph clusters and line/page placement, including
wrapped labels and repeated table headers. Adjacent links sharing an inseparable
cluster fail rather than choosing an ambiguous destination. Text styling is
unchanged. Model 8 adds contents below; DOCX links remain unsupported.

## Contents (model 8)

Mark TextBlocks with `props.toc: {level: 1}` (initial levels 1–3) and a unique
`anchorId`. Insert one root `table-of-contents` with `props.textStyleId`. Bound
visible titles, including TextBlocks in cells, follow authored document order.
Titles and their actual physical page numbers link to the first positioned heading.
Three levels are an initial validation limit; the stored level is numeric.

Contents use 12 pt indentation per level, a 12 pt gap and a fixed 36 pt number
column. Page numbers are filled after one pagination; a number that does not fit
fails. Model 8 documents with a contents node also receive temporary bottom-right
physical page numbers (regular 10 pt / 14 pt line box, bottom margin at least 18 pt).
No alternate numbering, generic footer controls or automatic heading inference.
See `fixtures/contents/template.json`. Existing models 4–7 retain their behavior.
## Section-owned inputs (model 15)

Model 15 declares each section with stable `id`, caller-facing `key`,
`inputSchema`, `formats` and optional `header`/`footer`. Requests use shared
`data` plus `sections.<key>.data/header/footer/content`. Section order comes
from the template. Omitted objects use defaults/required rules; unknown section
keys reject the complete request. Header/footer values belong to their own section.

Bindings explicitly select `global`, `section`, `header`, `footer`, `local`
or array `item` where allowed. There is no fallback between namespaces.
Document-global Areas retain one placement, including after prepared-input reload.
Invalid authored Area defaults fail template validation. Cover/blank exclusions,
existing overflow limits and A4 portrait/landscape rules still apply.

See `fixtures/section-ownership/{template,request}.json` and the packed
`section-ownership.pdf` consumer output. Models 4–14 keep their prior contract;
there is no automatic migration, DOCX or frontend adapter in this change.
