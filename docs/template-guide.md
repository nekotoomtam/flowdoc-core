# FlowDoc Core 0.4.8 template entrypoint

## Authority Boundary

Owner: flowdoc-core. This file locates this package's implemented contract and runnable examples. Project Control owns the complete cross-repository authoring documentation and release acceptance; this guide does not publish templates or certify visual output.

This describes package 0.4.8 after release 0.4.3, including opt-in font-height
calculation, Section19, group-label continuation and streamed task input/PDF.
Ordinary pt rendering is unchanged. See the root README for the exact native
helper/session contract and font-height API inputs/errors. Service owns task
storage, credentials, streaming delivery and process supervision.
Height adjustment does not keep text width, wrapping, or line clearance constant.
Release identity is established by the matching snapshot/tag after the release gates.

Models 18 and 19 are accepted. Model19 uses UUID Section instances and array input; its Stage2 fixed-height text frames are allowed only at Section flow roots, including top-level Area Formats. Text-node props.heightMode:fixed / props.height frames fail on text/body overflow and cannot control Section pages or bands. They are separate from Area Format sizing.fixed below. Cell/repeat frames and nested Areas remain prohibited; Stage3 TOCs require props.scope `{kind:"section"}` or `{kind:"document"}`, with one per scope after expansion. Section scope uses the owning Section. Empty scopes create no page; number slots are reserved and filled from actual target page numbering in one layout pass. Model18 TOCs remain unscoped. Model18 keeps its original behavior. Models 4–17 and their legacy content envelopes have been retired. Historical explanations remain in Git history and must not be used as current authoring instructions.

Read [Developer Documentation](../../flowdoc-project-control/docs/developer/authoring/README.md) for definitions, node properties, defaults, binding scopes, tables, contents, page numbering, image sizing and review rules. The [authoring workflow](../../flowdoc-project-control/docs/domains/flowdoc-ai-template-authoring-guide.md) covers draft creation through a complete reviewed PDF. Publish requires explicit user confirmation.

Code contracts: [template types](../src/template/types.ts), [prepared data](../src/data/types.ts), [resolved document](../src/composition/resolvedDocument.ts), and [public exports](../src/index.ts).

## DOCX development output in 0.4.8

The DOCX writer consumes the same `ResolvedDocument` and prepared
image provider as PDF. `createDocxEngine(resources).generateDocxTo(document,
images, output, {signal?, maxBytes?, maxXmlNodes?})` writes a buffered, editable
Word package. Word must refresh fields/contents; generation alone does not
certify native pagination or PDF fidelity. Existing PDFs are not rewritten.

Supplying both native shaping and segmentation capabilities selects measured
line paragraphs and individually editable VML word boxes. Word edits to text or
fonts may require regeneration to restore source layout; ordinary Word reflow
is not promised in this mode. Embedded font-table signatures are read from each
family's actual regular face OS/2 table rather than a fixed Latin signature.
The private SRS PDF spacing/calibration probes remain explicit experiments and
do not change ordinary PDF generation defaults.

`maxXmlNodes` explicitly selects the expanded XML-element budget, default50000,
maximum300000. A larger selection does not raise the source-node50000,
image-reference10000, resource16MiB or output32MiB limits. Its receipt records
the selected limit and actual XML count. Whole-document experiments with a
larger budget are not passes of the default profile or total-memory guarantees.
Reading relationships, bands and cover admission use private measurements from
the actual text/font resources; native Word fit still requires visual review.
Rule thickness is rounded to the nearest representable eighth-point, within
the supported0.25–12pt range, with an explicit source/native difference receipt.

## Font styles and resources in 0.4.0

`schemaVersion` is independent of `nodeModelVersion:18` and the template's own
`version`. Schema 1 keeps the existing Sarabun style contract and fingerprint;
keep confirmed legacy documents in that schema rather than changing a number
to make them library-font documents. Schema 2 uses a style such as:

```json
{
  "font": {
    "kind": "library",
    "releaseId": "10000000-0000-4000-8000-000000000001",
    "weight": 400,
    "style": "normal"
  },
  "fontSize": {"value": 12, "unit": "pt"},
  "lineHeightPt": 20
}
```

The example release ID is illustrative; use an actual eligible Service catalog
release. A style may instead use `font:{kind:'unselected'}` while drafting, but
it cannot produce a PDF. Weight is an integer 1–1000 and style is normal/italic.
Select an exact available face: no nearest-weight selection, synthetic bold or
italic, automatic font substitution, or network font download. A catalog default
does not change an existing document. Missing glyphs also block PDF generation.

Before creating the engine, call root export `loadLibraryFonts(bundledResources,
faces)` and handle its Result. Pass the returned resources to `createPdfEngine`.
Each `LibraryFontInput` supplies releaseId, faceId, assetId, approved weight/style,
absolute static-TTF path, SHA-256, and licenses with id/path/SHA-256. See the
[exported font types](../src/fonts/types.ts) and
[resource loader](../src/fonts/resources.ts); these paths are caller inputs, not
values to put in a template or authoring request. Variable fonts/OTF are unsupported.

Core checks font/license bytes and uses a private immutable generation snapshot
for shaping/subsetting/embedding. Preserve returned `fontUsage` identities and
hashes with the result. Service owns import, six lifecycle states, permissions,
draft readiness and retired-release inheritance; Core does not grant those rights.
See [Service operations](../../flowdoc-service/docs/usage.md) for that workflow.
Schema 2 validation alone does not establish readiness for the actual input.

## Runnable examples

- `fixtures/area-document/`: explicit Section Area, owned format, nested business arrays and row groups.
- `fixtures/srs-basic/`: global variables and ordered Area text/table entries.
- `fixtures/areas/`: an authored table with Area content inside its cells.
- `fixtures/page-numbering/`: Section paper/bands, authored covers, excluded/hidden/restarted page numbering.
- `fixtures/table/`: short, empty and long tables with continuation.
- `fixtures/row-groups/`: repeated logical table groups.

Always validate a template and prepare its matching request before composition. The `sections` request object uses Section keys; the prepared snapshot uses Section IDs. Area formats use explicit ownerAreaId and key. They cannot declare another Area in their input schema. A reusable format with business arrays is distinct from an Area placement.

Run the Core build/tests and packed Linux consumer described in [README](../README.md).
For a font-aware consumer, exercise every selected face and required character set,
verify embedded font identities against the supplied bytes, and compare legacy
Sarabun output with its confirmed baseline. A successful validator or preview job
ID alone does not prove the final PDF is complete: inspect its content, pagination,
links and every rendered page.

## Packaged Format sizing v2 development candidate

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
fit gate and remain immutable. Package 0.4.4 is untagged, not installed;
Project Control owns cross-repository verification and release acceptance.


## Group-label spans development candidate

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
keepStart is always true for groupLabel and cannot be set false. In auto,
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
glyphs block generation without fallback. This unpromoted candidate also retains
the decimal PDF image-coordinate serialization fix; do not overwrite an older
archive using the new bytes. Project Control owns cross-repository acceptance.
