# YouTube Transcript Collector

Goal: collect usable analytical content (transcripts) for TA-first YouTube channels.

## Input

Read the queue file:
`out/youtube-transcript-queue-YYYY-MM-DD.json`

## Output

For each queue item, attempt to capture a plain-text transcript.

Write one JSON file per video to:
`data/raw/YYYY-MM-DD/youtube-transcripts/<videoId>.json`

Schema for each transcript file:

```json
{
  "videoId": "...",
  "fetchedAt": "<ISO timestamp>",
  "transcriptText": "<plain text>",
  "language": "en" ,
  "method": "browser",
  "sourceUrl": "<video url>",
  "error": null
}
```

If transcript cannot be extracted, still write the file with:
- `transcriptText`: ""
- `error`: a short reason (e.g. "no transcript available", "login required", "blocked")

## Browser procedure (preferred)

For each video:
1) Open the video URL.
2) Try to open transcript panel:
   - On YouTube watch page: look for "..." menu → "Show transcript" OR a "Transcript" section.
3) Copy transcript text.
4) Remove timestamps if they’re interleaved; we want readable continuous text.

## Rules

- Do not hallucinate transcript.
- If YouTube UI blocks transcript access, record the limitation in `error`.
- Keep runs bounded: cap at ~10 videos per run unless the queue is tiny.
