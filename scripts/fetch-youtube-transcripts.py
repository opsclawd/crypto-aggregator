#!/usr/bin/env python3
"""
Stage 2 YouTube ingestion — transcript fetching via youtube-transcript-api.

Primary method: Python library (fast, reliable, no browser required).
Fallback: write error blob so browser collector can retry if needed.
"""

import sys
import json
import traceback
from pathlib import Path
from datetime import datetime, timezone

# ── config ──────────────────────────────────────────────────────────────────
ROOT       = Path(__file__).parent.parent
DAY        = sys.argv[1] if len(sys.argv) > 1 else datetime.now(timezone.utc).strftime('%Y-%m-%d')
QUEUE_FILE = ROOT / 'out' / f'youtube-transcript-queue-{DAY}.json'
OUT_DIR    = ROOT / 'data' / 'raw' / DAY / 'youtube-transcripts'
MAX_ITEMS  = 20   # cap per run; empty queue → no-op
# ────────────────────────────────────────────────────────────────────────────

try:
    from youtube_transcript_api import YouTubeTranscriptApi
    from youtube_transcript_api._errors import (
        NoTranscriptFound, TranscriptsDisabled, VideoUnavailable,
        IpBlocked, RequestBlocked, PoTokenRequired, AgeRestricted,
    )
except ImportError:
    print('ERROR: youtube-transcript-api not installed. Run: pip install youtube-transcript-api --break-system-packages')
    sys.exit(1)


def already_done(vid: str) -> bool:
    return (OUT_DIR / f'{vid}.json').is_file()

def write_result(vid: str, transcript_text: str, method: str, error: str | None = None) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    result = {
        'videoId':      vid,
        'fetchedAt':    datetime.now(timezone.utc).isoformat(),
        'transcriptText': transcript_text,
        'language':     'en',
        'method':       method,
        'sourceUrl':    f'https://www.youtube.com/watch?v={vid}',
        'error':        error,
    }
    (OUT_DIR / f'{vid}.json').write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding='utf-8')


def fetch_one(video_id: str) -> None:
    if already_done(video_id):
        print(f'  [SKIP] {video_id} — already fetched')
        return

    print(f'  Fetching: {video_id}')
    try:
        api = YouTubeTranscriptApi()
        transcript = api.fetch(video_id, languages=['en'])
        # FetchedTranscript → list of FetchedTranscriptSnippet
        text = ' '.join(snippet.text for snippet in transcript)
        write_result(video_id, text, method='api')
        print(f'  [OK] {video_id} — {len(text)} chars')

    except NoTranscriptFound:
        write_result(video_id, '', method='api', error='no_transcript_available')
        print(f'  [FAIL] {video_id} — no transcript available')

    except (TranscriptsDisabled, VideoUnavailable):
        write_result(video_id, '', method='api', error='transcripts_disabled')
        print(f'  [FAIL] {video_id} — transcripts disabled/unavailable')

    except AgeRestricted:
        write_result(video_id, '', method='api', error='age_restricted')
        print(f'  [FAIL] {video_id} — age restricted')

    except IpBlocked:
        write_result(video_id, '', method='api', error='ip_blocked')
        print(f'  [FAIL] {video_id} — IP blocked by YouTube')

    except (RequestBlocked, PoTokenRequired) as e:
        write_result(video_id, '', method='api', error=f'request_blocked: {e}')
        print(f'  [FAIL] {video_id} — request blocked: {e}')

    except Exception:
        write_result(video_id, '', method='api', error=f'unexpected: {traceback.format_exc()}')
        print(f'  [ERROR] {video_id} — {traceback.format_exc()}')


def main() -> None:
    if not QUEUE_FILE.is_file():
        print(f'Queue file not found: {QUEUE_FILE} — nothing to do')
        sys.exit(0)

    queue = json.loads(QUEUE_FILE.read_text(encoding='utf-8'))
    items = queue.get('items', [])
    if not items:
        print('Queue is empty — nothing to do')
        sys.exit(0)

    # Filter to items needing fetching (existing = already done)
    pending = [it for it in items if not already_done(it['videoId'])]
    if not pending:
        print('All items already fetched — nothing to do')
        sys.exit(0)

    to_process = pending[:MAX_ITEMS]
    print(f'Processing {len(to_process)} of {len(pending)} pending items')

    for item in to_process:
        fetch_one(item['videoId'])

    print('Done')


if __name__ == '__main__':
    main()