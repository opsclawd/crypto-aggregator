# Midday Delta (material changes only)

You are generating a small update ONLY if material change exists since the last Morning Market Map.

Inputs are in `out/market-map-input.json`.

## Output rules

If there is no material change (no meaningful thesis changes and no high-signal new catalysts), output exactly:

NO_MATERIAL_CHANGE

Otherwise output a Markdown report:

1) New / updated catalysts
2) Thesis changes (bias/levels/invalidation/trigger)
3) Cross-source shifts (alignment/disagreement)
4) Caveats

## Materiality guidance

Material means at least one of:
- a key level/invalidation/trigger changed on BTC/ETH/SOL
- a new high-impact catalyst appeared or moved rumor→confirmed
- multiple analysts aligned/disagreed in a way that changes risk framing

Do not restate the full market map.
