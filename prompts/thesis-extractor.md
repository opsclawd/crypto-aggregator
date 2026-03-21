# Thesis Extractor (structured TA)

Read `out/thesis-extraction-input-YYYY-MM-DD.json` for today (use the current ISO day in the filename).

Your job: extract ONLY technical-analysis theses for BTC/ETH/SOL into a JSON array.

## Hard rules

- Do not hallucinate levels or bias.
- If a field is unknown, use `unknown` timeframe/setupType or null for optional fields.
- Support/resistance/targets must be arrays of strings; keep raw level formatting (e.g. "63.5k", "0.618 retrace ~ 3120").
- `rawThesisText` should be a concise but faithful snippet of the underlying text that supports the thesis.
- For YouTube items with `limitations` containing `youtube:transcript_unavailable`, you MUST either:
  - produce no thesis, OR
  - produce a thesis with `sourceReliability: low` and explicitly reflect that you only had title/metadata.

## Output format

Output ONLY valid JSON (no markdown fences), matching `schemas/thesis.schema.json`.

One source item may yield multiple theses if it clearly covers multiple assets/timeframes.
