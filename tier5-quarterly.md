Tier 5 — quarterly visual-redesign pass

This tier is intentionally NOT autonomous. It needs Erwin eyeballs before any
layout, OG, or marketing change ships. Items for the handoff doc when Erwin
triages:

- Hero composition (image order, eyebrow text, CTA order)
- OG card rotation
- Journal entry archive unheading & sub-brand visual variations
- Quarterly color refresh (only if brand-leading)

Skipped because:

- Ploy pattern spec says "Erwin eyeballs before merging" for Tier 5.
- Each item is a Ploy-style PR with side-by-side screenshots + 1-click merge.

When Erwin is ready for a Tier 5 pass, the workflow is:

1. Render current state PNG (off `prod` URL) at width 1280x800.
2. Run a single proposal: hero/OG/section order, capped at one PR.
3. Compare, ship via the same staging → main gate we've been using.
4. Tag the PR `tier-5-quarterly`.

Until then, no autonomous shipping of Tier 5.