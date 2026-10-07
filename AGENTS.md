# FlowDoc Core Agent Guide

## Authority Boundary

Owner: flowdoc-core. Scope: package code, resource adapters, tests and local build.
Project Control owns shared scope/status and the governing Export MVP design:
`../flowdoc-project-control/docs/domains/flowdoc-export-mvp-r1-design-2026-10-07.md`.
This guide is not evidence of PDF, Service or MVP readiness.

Read `../flowdoc-project-control/AGENTS.md` before FlowDoc work. Package foundation
and public PDF engine authority are the P1–P4 slices in
`../flowdoc-project-control/docs/domains/flowdoc-export-mvp-r2-runtime-plan-2026-10-07.md`.
Keep HTTP, DB, editor, and old-repo path dependencies out of Core.
Use public exports deliberately, preserve resource hashes/licenses, and test
the packed artifact in an isolated Linux/amd64 consumer before claiming packaging works.
Do not install/build/download runtime tools during package installation or rendering.
Shared plans remain in Project Control. Verify changed/affected areas, preserve
unrelated changes and commit only after relevant checks pass.
