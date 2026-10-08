# FlowDoc Core

## Authority Boundary

Owner: flowdoc-core. This README describes this package's local build and resource
and PDF API. Shared MVP scope and status belong to Project Control's
`docs/domains/flowdoc-export-mvp-r2-runtime-plan-2026-10-07.md`.

The package validates templates, prepares typed data and composes bound TextBlock
and simple table graphs. Its PDF engine renders TextBlocks and simple tables
with whole-line row continuation. There is no HTTP server or database here.

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
by JSON.parse cannot be recovered. Future Service registration must retain this
raw-text boundary. The returned definition is a detached frozen copy with a
canonical SHA-256 fingerprint (including template identity/version). It is not
authentication. Preparation pins this definition; it never selects a version.

Fields are strings or one level of arrays of string-field objects. Required
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
settings and an ordered node graph, not measured coordinates. Only A4 portrait
or landscape, mm/pt margins, paragraph TextBlocks, text/line-break inlines and
Sarabun normal/bold/italic combinations are supported in this slice. Simple tables
use declared fixed-width columns; nested/merged tables, unresolved tags, custom
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

Tables have one optional header row and 4 pt cell padding with 0.5 pt black
borders. Column widths must fit the page; text must fit the remaining cell width.
The tallest cell determines row height. Multiple TextBlocks per cell flow in
order. `allowBreak:true` continues at measured whole-line boundaries, retaining
row identity; finished cells remain blank on later fragments. `allowBreak:false`
moves the row intact, or returns LAYOUT_FAILED if it exceeds the usable page.
`repeatHeaderRows:true` repeats the header on continuation pages. The header
stays with at least the next body line; impossible header/body combinations fail
instead of producing blank pages. An empty collection renders only its header.
Page breaks do not mutate the composed graph. Row/column merging, configurable
cell styling and nested tables remain outside this MVP slice.

`fixtures/table/` contains raw template/short/empty/long requests. Its body style
uses 12 pt text / 20 pt lines, providing enough room for measured Sarabun Thai ink;
the older R1 design fixture's illustrative 18 pt setting is not a fit guarantee.
The installed consumer generates `table-short.pdf`, `table-empty.pdf` and
`table-long.pdf`, plus expected text and resolved graphs for inspection.

`npm run check:package` also creates `bound-text.pdf`, `four-styles.pdf` and `overflow.pdf` with
expected text and result metadata in the artifact directory. Inspect extracted
text, embedded fonts and rendered pages before claiming visual acceptance; the
consumer command alone does not perform the host Poppler/visual review.

## Reused implementation

Native source/Cargo.lock and the subset algorithm were extracted from
`flowdoc-vnext-core` commit `fa76c74356e5cfc9296f6a86c0bfac690e8416f6` through
the validated Linux runtime probe. They require no old repository at runtime.
Rustybuzz 0.20.1 and ICU segmenter 2.2.0 remain locked. Sarabun Regular, Bold,
Italic and BoldItalic ship with their SIL Open Font License in `assets/fonts/OFL.txt`.
The derivative subset helper uses explicit output names rather than the source
font's reserved family name. Runtime packaging currently targets the pinned Debian
Bookworm images only; other platforms are not claimed as verified.
