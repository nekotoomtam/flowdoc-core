# FlowDoc Core

Package `0.5.0` supports model19 Section instances: UUID `id`,
required display `label`/`nameBase`, no `key`/`formats`, and generation
`sections:[{id,data,header?,footer?}]`. Saved definition order controls output;
each saved ID is required exactly once. Prepared schema2 pins model19 and the
definition fingerprint. Model18 retains its existing object input/schema1 reader.
Section-local anchors are namespaced by instance; cross-Section references use
an explicit `targetSectionId`. No implicit migration or font-size adjustment.
Model19 Stage2 permits fixed-height text at Section flow roots, including top-level
Area Formats. Text nodes with props.heightMode:fixed / props.height must fit their text and remaining body space; overflow fails
without clipping, shrinking or moving that text frame. This is separate from
Area Format sizing.fixed, whose maximum-height behavior is described below. Section page/band settings remain
authoritative. Cell/repeat frames and nested Areas stay forbidden. Scoped/multiple
TOCs use explicit model19 scope `{kind:"section"}` or `{kind:"document"}`.
One TOC per Section and one per document may coexist; duplicates after Area
expansion fail. Section scope uses its owning Section, not a caller-selected ID.
Empty scopes add no page. Target numbers follow continue/restart/exclude; hidden
numbers remain in contents and excluded targets retain title links without numbers.
Pagination has one layout pass: fixed number slots are filled afterwards without
reflow; an oversized number fails rather than guessing or retrying. Model18 keeps
its existing unscoped contract. Release identity is the matching annotated tag on
the release snapshot; installation is separate. Shared contract: Project Control Section–Area Stage0–3.

## DOCX development output in 0.5.0

Final top-level Areas may opt into `props.verticalAlign: "bottom"`; the default
remains ordinary flow. PDF keeps a fitting final Area together at the final body
edge; oversized Areas flow and align their last fragment. The DOCX development
adapter stores it once in editable native page-bottom note content, with no
visible reference or separator. Native Word verification is pending; a retained
LibreOffice preview drops table content in this note path. This remains an
experimental candidate, not accepted Word parity. See the template guide.

`createDocxEngine` exports the shared resolved document as DOCX with embedded
fonts, tables, page bands, links and refreshable Word fields. Font signatures
come from each embedded family's actual regular font, including Thai coverage.
When both native shaping and segmentation capabilities are supplied, the writer
uses measured line paragraphs and individually editable VML word boxes. Changes
to text or fonts in Word may require regeneration to restore source layout.
Native Word pagination and full PDF fidelity are not guaranteed. The private
SRS PDF calibration probes remain opt-in experiments, separate from ordinary PDF
output. See [template guide](docs/template-guide.md#docx-development-output-in-050)
for the two layout paths, API/receipts, budgets and verification limits. This
version is a development integration; release, installation and Service pinning
are separate steps.

The 0.5.0 candidate additionally maps group-label cells to native vertical
merges, adapts fractional font sizes in a DOCX-only snapshot and preserves
separately named static faces such as Sarabun Light. Bounded fixed page bands
reserve native structural overhead explicitly. These are DOCX adaptations;
the original input/PDF and release/Service pins are unchanged. See the template
guide for receipts, native flow behavior and remaining fit limits.

## Internal task input reader

`normalizeTaskInput(template, valueHandle, options)` validates model18/19
values and writes `flowdoc-task-input/1` incrementally. Storage-neutral handles expose
object properties, array elements and bounded scalars; Core never loads a whole
Section or Area entry. A collection pass precedes resolution so property order and
forward image references do not select a first winner. Service owns file/image
metadata and Section asset keys. Only typed image slots invoke its adapter; omitted
images retain explicit version1 unavailable resources and reasons, including required
fields. Legacy `prepareGeneration` still accepts its original UUID image values only.
This normalized contract is internal input for Service task processing, not a new
legacy prepared snapshot, renderer capability, public endpoint or PDF readiness claim.
## Authority Boundary

Owner: flowdoc-core. This README describes the package API, local build and resource runtime. Project Control owns shared plans, status and acceptance. Detailed authoring contracts are maintained in [Developer Documentation](../flowdoc-project-control/docs/developer/authoring/README.md).

Package version: 0.5.0 on development; the latest release snapshot remains0.4.7.
This package includes Section19, scoped contents, Format sizing v2, group-label
spans, streamed task images/PDF and the opt-in height calculation below.
Release identity requires the matching tagged snapshot and acceptance gates.
Historical0.4.0 accepted **nodeModelVersion: 18 only**, with legacy schemaVersion 1 and library-font schemaVersion 2. Models 4–17 are rejected at template and resolved-document entrypoints. Changing a version number alone does not migrate a template.

## Internal bounded task composition

`composeTaskDocument(validatedTemplate, normalizedValueHandle, {signal?})` consumes
`flowdoc-task-input/1` with its exact template pin. Source collections are replayed
lazily through the same binding expansion steps as legacy composition. Each record
is bounded to256 KiB; source/prepared payloads are never loaded as complete objects.
Canonical normalized values are validated separately from raw request defaults.
One resolved graph remains bounded to50,000 node/inline identities and2,000 Section
instances. This is not layout spooling or a whole Service RAM guarantee.
Available image markers bind to their asset IDs; unavailable markers retain frames
using `unavailable-<findingId>` and do not add composition findings. The caller must
retain existing source findings and suppress duplicate unavailable-image diagnostics.
Source handles must describe the same sealed, pinned bytes on each replay; the
Service adapter owns file integrity and lifetime. Abort closes all active iterators.
Legacy prepared schema1/2 APIs and their bounds are unchanged.

## Internal streamed PDF output

The Linux/amd64 native helper supports the bounded `--serve` protocol used by
one ICU line-segmenter session per generation; the original one-shot interface
remains available. Measurement/shaping and line-break rules are unchanged.
Abort/deadlines close the owned sessions; helpers are closed after final layout
before font subsetting/PDF writing. Use the complete packaged resources: mixing
this Core with an older helper fails resource probing. Service task containers
require a reaping init, including when the render worker is forcibly killed.
Core does not own container supervision or HTTP/database/storage policy.

Task composition may reuse bounded template-access metadata for that call only;
source/fingerprint checks and all validation passes remain. The Service adapter
owns read-cache, field-index and record-byte budgets, fallback and file lifetime.
Neither mechanism creates a cross-job cache or permits stale inputs.

`PDF_STREAM_CONTRACT` is `flowdoc-pdf-stream/1`. Engines additionally expose
`generatePdfTo(resolvedDocument, provider, output, {signal?, maxBytes?})`.
This is an isolated Core contract; Service/task/FlowDocMake activation is later work.
The caller must check this exact capability and method; no buffered fallback.
Legacy `generatePdf` retains its 20-image/64 MiB retained-image limits.

`provider.images` maps each resolved image resource ID to
`{kind:'jpeg'|'rgb-deflate', width, height, content:{key,byteLength,sha256}, alpha?}`.
An alpha reference has the same shape as content and is permitted only with RGB.
RGB/alpha streams are zlib-compressed interleaved RGB8/gray8 without PNG predictors;
JPEG is normalized RGB8. Preparation/rotation/colour conversion and full raster
decoding remain the caller's existing image-preparation responsibility. Core
checks JPEG framing/dimensions and zlib decoded byte counts, not source image
decoding or colour-profile trust. PNG alpha must be prepared separately, never
flattened or silently recompressed to lower quality to satisfy capacity.

`provider.open(frozenRef, signal)` returns an async iterable of nonempty chunks
up to64 KiB. The adapter owns paths/handles, must honor cancellation and close on
iterator return/error. Core verifies exact length/SHA-256 while embedding and
never resolves a URL or client path. Manifests and functions are snapshotted before
awaiting. Resource IDs control reuse; byte-identical distinct IDs stay distinct.
Per-page resource dictionaries list only images actually drawn on that page.

`output.write(chunk, signal)` must await actual bounded acceptance/backpressure;
`output.abort(reasonCode)` must close/delete partial output or report failure.
Callbacks must cooperate with cancellation; the Service process owner supplies
deadline/forced-stop enforcement for stalled native or adapter work. Core owns
neither the destination nor its success finalization. Publish only after a
successful result AND closing/verifying the owned artifact. Failures abort even
when final runtime/temp cleanup fails; cleanup failure is not successful output.
Success is `{byteLength,sha256,mediaType,pageCount,fontUsage?}`, with no PDF bytes.

Bounds: 2,000 prepared descriptors,8 MiB manifest,8 million pixels/derivative,
50 MiB/compressed stream,10,000 placements,50,000 expanded nodes (including
inlines/bands),2,000 pages,256 MiB output (maxBytes may only lower it). Images and
PDF objects are emitted sequentially; one page content and bounded font/layout/
glyph/xref metadata still remain. This does not certify whole-process RAM, giant
structured-data composition, Service reservations or full UAT capacity.

## Opt-in font height calculation

`calculateFontHeightAdjustment` and `FONT_HEIGHT_METHOD` are public root exports.
The input is `{fontSizePt, sourceMetric, targetMetric}`; each metric contains only
`methodId: 'thai-bo-baseline-top-v1'`, integer `unitsPerEm` (16–16384), and positive
`topDesign` as a decimal string. Both measurements come from the approved Regular
400 profile. Resolve files, profile trust, face availability and permissions in
the caller; this pure function performs no lookup or mutation.

It returns `{ok:true,value:{fontSizePt,methodId}}` or `{ok:false,code}`.
Codes: `INVALID_FONT_INPUT`, `METRIC_INVALID`, `METHOD_UNSUPPORTED`, `NUMERIC_RANGE`.
The formula is old pt times source height/em divided by target height/em, with
exact rational arithmetic and final positive round-half-up to six decimal places.
Equal ratios preserve the original pt without rounding. TH Sarabun New 16 pt
(top 400/em 1000) to Sarabun (586/1000) yields 10.921502 pt.
Finite positive pt has no new upper bound; zero after rounding or numeric
overflow is unavailable, never clamped. Decimal parsing is bounded to 400
characters and an absolute exponent of 400; malformed/nonfinite metrics fail.

The function does not alter `lineHeightPt`, font selection, PDF resources,
templates, or renderer behavior. Width, wrapping and required line clearance
still depend on the selected face. Callers explicitly apply a successful result;
ordinary pt rendering and legacy Sarabun do not invoke this calculation.

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

A document defines page layouts and ordered Sections. Each Section owns its paper, header/footer, variables and authored content or intentional blank page. An Area is a named variable declared in globalSchema or a Section inputSchema and placed in an authored graph. areaFormats explicitly declare ownerAreaId and key; invocation data belongs to that format. Model18 Section formats must be empty; model19 has no Section formats/key and uses the ID-addressed array shown above. Requests do not accept legacy content arrays. Static content, covers and page breaks remain supported.

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

Use Node >=24.15.0 <25 and `npm ci`, then `npm run build` and `npm test`. The resource runtime
supports Linux/amd64 with glibc. Windows can build/test the TypeScript boundary;
native execution is checked through Docker Desktop's Linux engine.

Linux tests and `check:package` also require `FLOWDOC_LEGACY_SEGMENTER`: an
explicit absolute path to the retained prior one-shot Linux ELF helper used by
compatibility tests. It is a test fixture, not the current serving helper. Keep
its provenance/hash with proof; do not replace it with a mock or the new helper.

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
borders. Optional table `props.borderStyle:"none"` suppresses outer and internal
strokes in PDF and DOCX while retaining cell fills and the existing spacing
rules. Omitted or `"single"` keeps the usual border; explicit `borderColor` values,
including white, remain unchanged. Column widths must fit the page; text must fit the remaining cell width.
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

## Packaged Format sizing v2

Model19 Area Format definitions optionally declare `sizing: {mode: "auto"}` or
`{mode: "fixed", height: {value: 300, unit: "pt"}}` (pt/mm). Omitted sizing retains
legacy auto. Fixed requires a Section flow-root Area and cannot contain a TOC.
Each call reserves min(declared maximum, current body remainder), even when
content is short or empty. A positive remainder renders every fitting whole
line/image/protected table unit, closes table fragments and stops this instance;
it never moves or retries the remainder. Only zero remaining space omits the
whole frame. Later calls run independently. No clipping or automatic shrink.

Input stays complete. FORMAT_CONTENT_OMITTED, FORMAT_FRAME_NOT_SHOWN and
FORMAT_IMAGE_NOT_SHOWN retain diagnostic version1 and identify partial rendering.
Visible references/TOC to omitted content fail LAYOUT_FAILED with reason
omitted-destination and collected warnings. No Area sizing or request override.
Matched consumers require formatSizing.version2, diagnosticsVersion1 and the
exact new artifact checksum. Version1 archives describe the earlier whole-frame
fit gate and remain immutable. Package 0.4.5 is untagged, not installed;
Project Control owns cross-repository verification and release acceptance.


## Group-label spans

Model19 (schema1 or2) rowGroups optionally declares
`groupLabel:{cellTemplateId:"member-label",emptyCellTemplateId:"empty-label"}`.
The member and empty label cells bind the same group field, occupy the same grid column/colSpan, have no
authored rowSpan, and each contains one text-block with a required nonempty
string field-ref in group scope. Labels cannot contain links, anchors, images
or TOCs. The group needs member/empty row templates; a prefix is optional here.
Normal rowGroups without groupLabel retain their existing contract. Model18
rejects this optional declaration; it is not silently discarded.

The empty template row must set allowBreak:false. Core derives span from member count (empty uses one fallback row). An empty
group collection emits no group; equal names remain distinct instances.
keepStart is always true for groupLabel and cannot be set false. In PDF auto flow,
each actual continuation fragment repeats the complete name plus ` (ต่อ)`;
members keep their logical identity and flow once. A complete label that cannot
fit fails LAYOUT_FAILED with reason group-label-does-not-fit and group context.

Format sizing.fixed still reserves the lesser of maximum height and current
page remainder. It closes the visible table and stops this Format; remaining
members never continue onto another page. FORMAT_CONTENT_OMITTED retains
formatOmission.version1; pending groupId/groupIndex/itemIndex identify where
content stopped (no itemIndex for group labels/empty rows). Input stays complete;
a successful partial PDF must be reported as incomplete. Totals remain authored
ordinary rows, not a new aggregation or group-footer hook.

Consumers must preserve the declaration and inspect groupLabelSpans.version1
on a matched Service/FlowDocMake contract, with model19/schema1,2, diagnostics1
and formatSizing.version2. The suffix uses the selected label font; missing
glyphs block generation without fallback. This package also retains
the decimal PDF image-coordinate serialization fix; do not overwrite an older
archive using the new bytes. Project Control owns cross-repository acceptance.
