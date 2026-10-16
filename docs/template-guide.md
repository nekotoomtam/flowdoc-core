# FlowDoc Core 0.4.0 template entrypoint

## Authority Boundary

Owner: flowdoc-core. This file locates this package's implemented contract and runnable examples. Project Control owns the complete cross-repository authoring documentation and release acceptance; this guide does not publish templates or certify visual output.

This describes the 0.4.0 development package. The accepted release remains
0.3.0 until the separate release gates pass; a manual version is not a release tag.

Only `nodeModelVersion: 18` is accepted. Models 4–17 and their legacy content envelopes have been retired. Historical explanations remain in Git history and must not be used as current authoring instructions.

Read [Developer Documentation](../../flowdoc-project-control/docs/developer/authoring/README.md) for definitions, node properties, defaults, binding scopes, tables, contents, page numbering, image sizing and review rules. The [authoring workflow](../../flowdoc-project-control/docs/domains/flowdoc-ai-template-authoring-guide.md) covers draft creation through a complete reviewed PDF. Publish requires explicit user confirmation.

Code contracts: [template types](../src/template/types.ts), [prepared data](../src/data/types.ts), [resolved document](../src/composition/resolvedDocument.ts), and [public exports](../src/index.ts).

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
