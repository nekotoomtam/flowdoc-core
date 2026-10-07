# FlowDoc Core

## Authority Boundary

Owner: flowdoc-core. This README describes this package's local build and resource
API. Shared MVP scope and status belong to Project Control's
`docs/domains/flowdoc-export-mvp-r2-runtime-plan-2026-10-07.md`.

This foundation exposes resource loading only. Template binding, layout and the
public PDF engine are subsequent work; there is no HTTP server or database here.

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
  // Explicit absolute executable/helper/font paths for future internal adapters.
}
```

The caller supplies Python 3.11 with fontTools 4.58.2 and a temporary directory.
The loader checks bundled hashes, executable readiness and temporary writes.
Initialize once per engine instance, not for every glyph or page. Failures return
`RESOURCE_UNAVAILABLE`; there is no font/runtime fallback. Internal import paths
are not public API. The subset helper is internal and requires explicit inputs
and separate output paths; it preserves source font bytes and glyph IDs.

## Reused inputs

Native source/Cargo.lock and the subset algorithm were extracted from
`flowdoc-vnext-core` commit `fa76c74356e5cfc9296f6a86c0bfac690e8416f6` through
the validated Linux runtime probe. They require no old repository at runtime.
Rustybuzz 0.20.1 and ICU segmenter 2.2.0 remain locked. Sarabun Regular, Bold,
Italic and BoldItalic ship with their SIL Open Font License in `assets/fonts/OFL.txt`.
The derivative subset helper uses explicit output names rather than the source
font's reserved family name. Runtime packaging currently targets the pinned Debian
Bookworm images only; other platforms are not claimed as verified.
