# FlowDoc Core

## Authority Boundary

Owner: flowdoc-core. This README describes the package API, local build and resource runtime. Project Control owns shared plans, status and acceptance. Detailed authoring contracts are maintained in [Developer Documentation](../flowdoc-project-control/docs/developer/authoring/README.md).

Package version: 0.4.0. Its release identity is the matching annotated tag on the
snapshot branch; a package version alone does not establish release acceptance.
Version 0.4.0 accepts **nodeModelVersion: 18 only**, with legacy schemaVersion 1 and library-font schemaVersion 2. Models 4–17 are rejected at template and resolved-document entrypoints. Changing a version number alone does not migrate a template.

## Template and data API

```ts
import { validateTemplate, prepareGeneration, composeDocument } from '@flowdoc/core';
const template = validateTemplate(rawTemplateJson);
if (!template.ok) throw new Error(JSON.stringify(template.issues));
const prepared = prepareGeneration(template.value, requestJson);
if (!prepared.ok) throw new Error(JSON.stringify(prepared.issues));
const composed = composeDocument(template.value, prepared.value);
if (!composed.ok) throw new Error(JSON.stringify(composed.issues));
// Pass composed.value to engine.value.generatePdf.
// Preserve warnings in the caller's job/status record.
```

Use raw JSON text to detect duplicate decoded keys. Template validation returns a detached frozen definition and canonical fingerprint. Prepared snapshots are JSON-serializable and checked again at composition; this structural check is not authentication.

A document defines page layouts and ordered Sections. Each Section owns its paper, header/footer, variables and authored content or intentional blank page. An Area is a named variable declared in globalSchema or a Section inputSchema and placed in an authored graph. areaFormats explicitly declare ownerAreaId and key; invocation data belongs to that format. Section formats must be empty and requests do not accept legacy content arrays. Static content, covers and page breaks remain supported.

Unknown business fields produce warnings. Invalid Area entries, missing required fields, unknown formats and wrong types fail rather than silently skipping content. Areas accept arrays or keyed objects according to their declaration. See the [local template entrypoint](docs/template-guide.md) and runnable fixtures.

Text measurement uses a per-generation cache (32 MiB serialized payload, at most 8,192 entries) and a persistent shaper per font. Sessions close on success or failure. These bounds are not a total job-memory guarantee. Core contains no HTTP server or database.

Schema 2 text styles use `{font:{kind:'library',releaseId,weight,style},fontSize,lineHeightPt}`.
Weight is an integer 1–1000; style is normal/italic. `{font:{kind:'unselected'},fontSize,lineHeightPt}`
is structurally valid for drafts and blocks PDF with FONT_NOT_SELECTED.
Schema 1 keeps its Sarabun normal/bold/italic contract and canonical fingerprint.

Use root export `loadLibraryFonts(bundledResources, faces)` before `createPdfEngine`.
Each face supplies releaseId, faceId, assetId, approved weight/style, absolute file path,
SHA-256 and licenses[{id,path,sha256}]. Only static TTF is supported; selection is exact,
without nearest weight, synthesized styles or fallback. Core checks bytes and normal/italic
flags, then snapshots verified font/license bytes into a private generation directory.
Shaping and subsetting use that same snapshot. Schema 2 PDF results include fontUsage
with selected identities, hashes and license hashes, without filesystem paths.
Core does not fetch fonts, resolve a latest release, authorize catalog activation or infer
approved weights from filenames. The caller owns catalog authorization/readiness.

## Release branches

Before preparing or promoting a release, follow the shared
[release rules and gates](../flowdoc-project-control/docs/domains/flowdoc-export-working-release-rules-draft-2026-10-09.md).
They also record the owner-authorized 2026-10-16 history repair; that exception
does not permit moving tags during normal releases.

Version 0.1.0 is the first local export package release. `release` contains one
snapshot commit per accepted version; annotated `v<version>` tags identify those
commits and must not be moved. Development history remains on development branches.
The initial release snapshot has its own root; later releases must parent the
previous release commit as its only parent and include only the reviewed candidate tree. Never merge or
fast-forward development history into `release`; every reachable commit must have
its version tag on the remote, including commits through any additional parent. Record the
development source commit in each release commit and verify tree equality. Do not
merge unrelated histories blindly. Build and verify the package before tagging;
never overwrite a released package under the same version. Service pins its exact
tarball and checksum. Send the snapshot branch and its annotated tag atomically,
then verify both remote targets. A development package version or a successful
local installation does not establish a release. This local release is not a public registry publication.

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
compiler invocation or runtime downloads. This package is private/unpublished.

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
Images and Areas follow the template guide. Tables use declared fixed-width columns and support merged cells.
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
Page breaks do not mutate the composed graph. Cells support direct TextBlock/Image children, per-side padding (including zero), cell repeats, image item binding and owned Area subformats.
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

For delivery, update this README and `docs/template-guide.md` with the candidate's
actual contract and limits before freezing its tree. Retain the packed artifact,
checksum, source commit and Linux consumer results. The Service consumer must use
that exact tarball; a Windows build alone does not verify its native PDF runtime.
Font verification covers exact selected faces/required glyphs and legacy Sarabun
parity. Release promotion follows the gates above after this preparation.
