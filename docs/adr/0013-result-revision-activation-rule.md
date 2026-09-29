# Which result revision is authoritative

**Status:** Proposed. Needs a product/domain decision; nothing here has been changed in code.

## Context

The documented rule (`domain.md` before this update, ADR-0002, ADR-0008) says: *exactly one finalized revision is authoritative at a time, and KPI projections use that authoritative revision.*

The implementation (`PrismaMissionResultRepository.review()`) does this: every call creates a new `ResultRevision` and **always sets it as the result's `activeRevision`**, whether or not `finalize` is true. Approved data (`approved-measurements`, the Signal Quality snapshot) uses the active revision **only if it has `finalizedAt`**. A finalized revision is immutable, and a later revision may be created from it.

Consequences of the current behavior:

1. Operator finalizes revision 2. Operator later saves a working revision 3 (not finalized) to continue reviewing. Revision 3 becomes active, so the mission **leaves the heatmap** until revision 3 is finalized. Revision 2 is no longer authoritative even though it is still the latest finalized one.
2. That save emits no event, so the change reaches the heatmap only when the snapshot TTL (5 s) expires and the version changes, and the operator sees no advisory (ADR-0011).
3. The UI cannot express "keep the finalized result live while I edit a draft".

## Options

**A. Latest revision always wins (change the documented rule).**
State the rule as "the active revision is the latest saved; it counts only if finalized". Pros: matches the code, simplest. Cons: an operator's work in progress silently removes data from projections; a finalized result can be "un-finalized" by accident.

**B. Only a finalized revision can become active (change the code).**
Keep drafts as revisions that are not active (for example, track the latest draft separately or derive it from "latest revision"). `review()` sets `activeRevisionId` only when `finalize` is true. Pros: matches the domain rule; projections are stable while the operator works; the event fires exactly when the projection changes. Cons: needs a way to load the latest draft in the review UI (a `latestRevision` or `draftRevision` field, or ordering by `revision`), and a small schema/contract change.

**C. Both: keep "active" as it is and add an explicit `authoritativeRevisionId`.**
Pros: no ambiguity. Cons: two pointers to explain, larger change.

## Suggested direction

Option B, because it keeps the documented invariant and makes the heatmap independent of in-progress work. This is a recommendation from reading the code, not a decision.

## If accepted

- Update `review()` and the review-loading path (frontend `MeasurementReviewController.load` must show the latest draft's rejections).
- Emit the finalized event only on finalize, as today (now consistent).
- Amend ADR-0002 and ADR-0008 and remove the open question in `domain.md`.
- Add tests for: finalize -> save draft -> projection unchanged; finalize -> finalize again -> projection updated.
