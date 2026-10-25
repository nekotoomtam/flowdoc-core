# FlowDoc Core 0.5.0 template entrypoint

## Authority Boundary

Owner: flowdoc-core. This file locates this package's implemented contract and runnable examples. Project Control owns the complete cross-repository authoring documentation and release acceptance; this guide does not publish templates or certify visual output.

This describes development package0.5.0 after release0.4.7, including opt-in font-height
calculation, Section19, group-label continuation and streamed task input/PDF.
Ordinary pt rendering is unchanged. See the root README for the exact native
helper/session contract and font-height API inputs/errors. Service owns task
storage, credentials, streaming delivery and process supervision.
Height adjustment does not keep text width, wrapping, or line clearance constant.
Release identity is established by the matching snapshot/tag after the release gates.

Models 18 and 19 are accepted. Model19 uses UUID Section instances and array input; its Stage2 fixed-height text frames are allowed only at Section flow roots, including top-level Area Formats. Text-node props.heightMode:fixed / props.height frames fail on text/body overflow and cannot control Section pages or bands. They are separate from Area Format sizing.fixed below. Cell/repeat frames and nested Areas remain prohibited; Stage3 TOCs require props.scope `{kind:"section"}` or `{kind:"document"}`, with one per scope after expansion. Section scope uses the owning Section. Empty scopes create no page; number slots are reserved and filled from actual target page numbering in one layout pass. Model18 TOCs remain unscoped. Model18 keeps its original behavior. Models 4–17 and their legacy content envelopes have been retired. Historical explanations remain in Git history and must not be used as current authoring instructions.

Read [Developer Documentation](../../flowdoc-project-control/docs/developer/authoring/README.md) for definitions, node properties, defaults, binding scopes, tables, contents, page numbering, image sizing and review rules. The [authoring workflow](../../flowdoc-project-control/docs/domains/flowdoc-ai-template-authoring-guide.md) covers draft creation through a complete reviewed PDF. Publish requires explicit user confirmation.

Code contracts: [template types](../src/template/types.ts), [prepared data](../src/data/types.ts), [resolved document](../src/composition/resolvedDocument.ts), and [public exports](../src/index.ts).

## DOCX development output in 0.5.0

PDF and DOCX consume the same validated `ResolvedDocument` and prepared image
provider. DOCX does not import a PDF or its captured positions. Initialization
returns a `Result`; use its engine only after checking `ok`:

```ts
const initialized = await createDocxEngine(resources);
if (!initialized.ok) throw new Error(initialized.issues[0]?.code);
const result = await initialized.value.generateDocxTo(
  document, images, stagedOutput, {signal, maxBytes: 32 * 1024 * 1024},
);
```

Import `createDocxEngine` from `@flowdoc/core`. Here `document` is the shared
resolved document; `images` implements the verified `PreparedImageProvider`
stream contract, including the empty provider for documents without images.
`stagedOutput` implements awaited `write(Uint8Array)` and `abort(reasonCode)`;
publish/rename staged bytes only after `result.ok`. The package is buffered
before chunk delivery, not constant-memory streaming. Cooperative cancellation
does not replace a caller-owned process deadline for stalled native work.

### Resource selection and Word editing

| Resources passed to `createDocxEngine` | Layout path |
| --- | --- |
| `{fonts}` only | Word lays out native paragraphs; font-metric/source guides are absent. |
| `fonts` plus `shaperPath` | Eligible font-metric baseline rules; Word still lays out native paragraphs. |
| `fonts`, `shaperPath`, `segmenterPath` | Also measures eligible source text into line paragraphs and editable VML word boxes. |

`loadBundledResources` returns both native paths, so passing that whole resource
object selects the third path automatically. Paths must be absolute; use the
verified packaged Linux/amd64 runtime. Protected/nonplain content can retain
native layout; inspect `source-word-layout` adaptations and their fallbacks.
Source-layout mode records `editBehavior:regenerate-after-edit` and, when applied,
`customXml/flowdoc-paragraphs.xml`. Text remains editable, but changing text or
fonts in Word may require regeneration to restore layout. Do not promise free
Word reflow or source-guided placement for every block.

`generateDocxTo(..., {textLayout:'native'})` explicitly retains ordinary native
paragraphs without VML word boxes. With both capabilities present, it still
measures required heading/row and band relationships. The default is unchanged;
explicit `textLayout:'source'` requires both native capabilities. Inspect the
`docx-text-layout` receipt. Native flow can wrap/page differently from source.

Ordinary body/cell paragraphs are eligible to flow between lines/pages. Row
splitting still follows the source row `allowBreak`; headers, grouped rows,
headings and protected content retain their own keep rules. There is no blanket
keep-whole-list promise. Table/cell insets and border quantization have explicit
adaptation receipts; a structurally valid package does not prove native fit.

Table `props.borderStyle` optionally accepts `"single"` or `"none"` in models18
and19. Omission retains a single0.5pt border, with `props.borderColor` defaulting
to `"000000"`. Set `borderStyle:"none"` to suppress all outer and internal table
strokes in PDF and DOCX, including merged cells; color is ignored for painting
in this mode but must still be valid RGB if supplied. Cell fills remain visible.
This is table-wide, not a per-cell override. Existing measurement, padding and
pagination rules remain in place; native Word can still lay out borderless
tables differently. Explicit `borderColor:"FFFFFF"` remains a painted white
border and is never converted automatically. Existing templates are unchanged.

The DOCX cell-margin adapter maps unequal vertical margins in an eligible text row
to shared row-minimum margins plus first/last paragraph before/after offsets.
Each cell's total inset is preserved in native twips; line heights/rules, fonts,
horizontal padding, borders and row controls stay unchanged. Uniform rows,
source-guided/fixed/image/empty cells, complex merges and final Area tables keep
the existing path. `table-space-policy.verticalOffsetPolicy` and each cell's
`paragraphBeforeTwips`/`paragraphAfterTwips` disclose the mapping. PDF and the
semantic source are unchanged. The owner accepted the SB1 short/30-row usability trial. This is bounded
evidence, separate from the known final-Area table-note preview limitation.

Static TrueType font bytes and licenses are verified and embedded. Family
signatures come from the actual regular face OS/2 table, including Thai coverage;
no fixed Latin signature is reused for every font. Missing coverage/unsupported
relations fail explicitly; generated metadata is not an arbitrary-font guarantee.

The UAT development candidate maps group-label cells to native vertical merges.
Each logical label occurs once; member rows retain `allowBreak` and are not kept
as a whole group. Word determines page continuation; this DOCX path does not
repeat the group name or append a continuation suffix. PDF group-label fragment
behavior below is unchanged. Inspect `group-label-native-merge` adaptations.

The public DOCX engine rounds fractional point sizes to the nearest half-point
in its private document snapshot, with ties upward. Source sizes outside0.5–819pt
fail. `font-size-quantization` records each source/native size and signed error;
measurement uses the emitted size. Source input and PDF are unchanged. This is
a font-size bound of0.25pt, not a position or pagination error guarantee. The
low-level `preflightDocx` / writer still require native-representable sizes.

Separately named static weights such as Sarabun Light use their verified legacy
font-family name from the actual font, preserving the selected bytes and weight;
`native-weight-family` records that mapping. Ambiguous names, missing regular
slot faces and weights without a separate style-linked family still fail.

Fixed page bands now admit content that fits their bounded source height.
They reserve source height plus required native structural paragraphs, recorded
in `fixed-band-native-reservation`; they do not clip an overflowing band to fit.
Content min/max band sizing remains unsupported. Word fit still needs review.

### Limits, receipts and comparison

The optional `maxBytes` can lower the32MiB output cap. `maxXmlNodes` selects the
expanded XML-element budget: default50000, maximum300000. Raising it does not
raise the source-node50000, image-reference10000 or combined resource16MiB
limits. An explicit selection returns `expanded-xml-budget` with limit/count.
Whole-SRS experiments using300000 are not passes of the default profile or
whole-job RAM guarantees. Rule thickness rounds to the nearest eighth-point
within0.25–12pt, with an explicit source/native difference receipt.

Success includes MIME type, byte length, SHA256, `pageCount:null`,
`fieldRefresh:'required'`, `wordVerified:false`, `buffered:true` and adaptations.
Word must refresh fields/contents; the receipt cannot establish final page count
or fidelity. To compare, preserve source/font hashes and original PDFs, convert
the exact DOCX through native Word, and inspect page/line breaks, table
continuations, text positions, Thai marks, fields and contents across the scope.
Record Word version/export options or their unknowns. LibreOffice QA is separate.

Sarabun/Bai Jamjuree trials and a Prompt signature control are bounded evidence,
not a percentage guarantee. The Prompt control no longer contains Angsana New,
but native Word102 versus FlowDoc101 pages remains open. The private SRS PDF
spacing/calibration probes remain opt-in experiments; ordinary PDF defaults are
not calibrated automatically. Existing PDF baselines stay immutable.

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

Always validate a template and prepare its matching request before composition. Model18 uses a `sections` request object keyed by Section keys; model19 uses the Section-ID array described above. The prepared snapshot retains Section IDs. Area formats use explicit ownerAreaId and key. They cannot declare another Area in their input schema. A reusable format with business arrays is distinct from an Area placement.

Run the Core build/tests and packed Linux consumer described in [README](../README.md).
For a font-aware consumer, exercise every selected face and required character set,
verify embedded font identities against the supplied bytes, and compare legacy
Sarabun output with its confirmed baseline. A successful validator or preview job
ID alone does not prove the final PDF is complete: inspect its content, pagination,
links and every rendered page.

## Final Area bottom alignment experimental candidate

An authored Area placement can set `props.verticalAlign: "bottom"` (or `"top"`
for default flow). Bottom is allowed only for the final top-level root Area of a
body Section, in models18/19. It is not available in cells or cover Sections;
fixed Format budgets, page breaks and TOCs inside that Area are rejected. Data
still supplies ordinary Area Format entries, not positions or fit hints. Multiple
entries form one ending Area; no entries add no visible block or page.

Composition retains `sections[].endingArea` with its Area ID, complete root suffix
and start index. Both renderer admission paths validate ownership and the suffix.
PDF measures through shared flow: one-page content stays together in the current
remainder or on the next page using actual band capacity, then aligns to the
body bottom. Oversized Areas retain normal flow and their last-page fragment
aligns down; order, fills, borders, images and link geometry are preserved.

DOCX uses one native page-bottom footnote per nonempty ending Area, referenced
after body content by an invisible custom mark. Reference numbers and separator
lines are suppressed. There is no repeated footer, floating box or extra Section.
Ending content remains native editable paragraphs/tables/images/links, outside
source-word boxes; editing takes place in Word's note area. A bounded source
envelope keeps short groups together; unbounded/oversized groups use native note
overflow. The `ending-area` adaptation records storage, envelope, keepTogether
and `wordVerified:false`; this is not a PDF-position import or a Word fit proof.

The SB1 short/30-row PDF trial has one final-page signing block. In the retained
LibreOffice preview, the native note reference is invisible but most table-note
content is not displayed. A normal numbered-note control has the same loss,
whereas a paragraph-only control displays every label. The DOCX XML retains all
cells/text; this observation does not establish native Word correctness. Word
conversion and visual acceptance remain pending. Do not claim arbitrary Area
content parity or release readiness from this experiment.

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
glyphs block generation without fallback. This unpromoted candidate also retains
the decimal PDF image-coordinate serialization fix; do not overwrite an older
archive using the new bytes. Project Control owns cross-repository acceptance.
