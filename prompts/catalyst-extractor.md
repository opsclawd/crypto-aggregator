# Catalyst Extractor (high-signal only)

Read `out/catalyst-extraction-input-YYYY-MM-DD.json` for today.

Extract ONLY potentially market-moving catalysts.

## Include
- macro / rates / CPI / Fed
- ETF / major regulatory actions
- exploits / outages / protocol incidents
- exchange listing/delisting/halts
- token unlocks / major governance events
- meaningful liquidation / OI / funding regime shifts IF the source provides concrete data

## Exclude
- generic newsletter news
- low-signal partnership announcements
- price-only commentary

## Output format

Output ONLY valid JSON (no markdown fences), matching `schemas/catalyst.schema.json`.

If nothing qualifies, output an empty array: []
