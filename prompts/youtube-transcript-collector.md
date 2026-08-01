# YouTube Transcript Collector

Goal: collect usable analytical content (transcripts) for TA-first YouTube channels.

## Primary method: Python script (preferred — no browser required)

Run the Python transcript fetcher directly:

```bash
cd ~/.openclaw/workspace/crypto-aggregator && python3 scripts/fetch-youtube-transcripts.py
```

This uses `youtube-transcript-api` to fetch captions directly from YouTube — fast, reliable, no browser needed. It writes output to:
- `data/raw/<day>/youtube-transcripts/<videoId>.json`

The script handles these cases gracefully:
- `no_transcript_available` — video has no captions
- `transcripts_disabled` — creator turned them off
- `age_restricted` — blocked by YouTube
- `ip_blocked` — rate limited; browser fallback can retry later

The script skips already-fetched videos (checks for existing `.json` files), so re-runs are safe.

## Fallback: Browser (only if Python fails with ip_blocked or unexpected)

If Python exits with a non-zero exit code OR you see `[FAIL] ip_blocked` for videos that matter, fall back to the browser:

1. Open the video URL
2. Click "..." menu → "Show transcript" OR find the Transcript panel
3. Copy the text, remove timestamps
4. Write `data/raw/<day>/youtube-transcripts/<videoId>.json` manually if needed

## Output schema

Each transcript file must match:

```json
{
  "videoId": "...",
  "fetchedAt": "<ISO timestamp>",
  "transcriptText": "<plain text>",
  "language": "en",
  "method": "api | browser",
  "sourceUrl": "<video url>",
  "error": null
}
```

If Python succeeded with `[OK]`, no further action needed. If it failed and you used browser fallback, write the file manually.

## Rules

- Do not hallucinate transcript
- Cap at ~20 videos per run (script handles this with `MAX_ITEMS`)
- Skip already-fetched videos (script handles this automatically)
- Do not announce a narrative summary — stop after the script completes