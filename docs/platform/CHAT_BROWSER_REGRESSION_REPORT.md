# Sprint 5 browser regression report

Date: 2026-11-23

Browser: local Google Chrome/Chromium. Firefox was not run because its Playwright executable was unavailable.

## Complete run

```bash
VITEST_COVERAGE=1 npm --prefix client exec vitest --project browser --run
```

The broad run executed **73 files / 820 tests**: **65 files / 808 tests passed**, with **8 files / 12 tests failing** initially. The suite is therefore not reported as completely passing.

## Triage

| Failure group | Classification | Outcome |
|---|---|---|
| `ChatPageOffline` (3) and `ChatPageMobileSearch` (1) | Genuine Sprint 5 regression | `callsDisabledForUser` was defined in the controller but omitted from the split view model. Fixed; all four pass on focused rerun. |
| `ChatHeaderActions` (2), upload-menu keyboard (1), user-menu layer (1) | Timing/contention in broad parallel run | Focused reruns passed: header 9/9, upload menu 20/20, user-menu layers 7/7. |
| `SidebarHeader.calls` (1) | Pre-existing test expectation mismatch | Test still expects `h-[72px]`; current header design no longer has that class. |
| `ConversationFilters` desktop (2) | Pre-existing test expectation mismatch | Tests expect `.ouj-folder-count`; current desktop action omits that node. |
| `SidebarHeader.userButton` (1) | Pre-existing test expectation mismatch | Test expects a desktop `User menu` control that the current header no longer renders. |

The final focused eight-file rerun passed **46/50 tests**. The four remaining failures are confined to the three stale expectation files above and are unrelated to SSO, CRM, scope enforcement, or the Sprint 5 view-model correction.

## Other client evidence

```bash
npm --prefix client run test:unit
```

Result: **49 files, 459 tests passed**. The production client also built successfully inside the isolated Chat image.

## Interpretation

Sprint 5's confirmed browser regression is fixed and covered. The remaining four failures must be resolved by deciding whether current UI behavior or the old expectations are authoritative; this sprint did not silently change unrelated layout behavior just to make tests green.
