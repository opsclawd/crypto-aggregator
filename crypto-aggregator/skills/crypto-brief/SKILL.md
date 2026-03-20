---
name: crypto-brief
version: 1
summary: Generate a structured crypto daily brief from normalized source artifacts.
---

# Crypto Brief Skill

## Purpose

Turn a cleaned source bundle into a compact, decision-useful daily crypto brief.

## Inputs

- `out/brief-input.md`
- `out/normalized-YYYY-MM-DD.json`

## Required behavior

1. Keep straight news and TA separate.
2. Highlight only changes that matter.
3. Collapse duplicate reporting into one synthesized point.
4. Preserve disagreement when sources conflict.
5. Prefer direct primary-source claims over secondary commentary.

## Output standards

- No fluff.
- Every important claim should point back to one or more source URLs in the appendix.
- Mention uncertainty when confidence is low.
- Treat reposts as weaker than original source reporting.
