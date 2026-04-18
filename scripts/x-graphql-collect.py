#!/usr/bin/env python3
"""Fetch tweets from X accounts using the GraphQL API with guest token."""
import json, urllib.request, urllib.parse, base64, sys, time

BEARER = "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA"

def get_guest_token():
    req = urllib.request.Request(
        'https://api.x.com/1.1/guest/activate.json',
        method='POST',
        headers={
            'Authorization': f'Bearer {BEARER}',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Content-Length': '0',
            'Accept': '*/*'
        }
    )
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read())
    return data['guest_token']

GRAPHQL_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
}

def graphql_get(url, bearer, gt):
    headers = dict(GRAPHQL_HEADERS)
    headers['Authorization'] = f'Bearer {bearer}'
    headers['x-guest-token'] = gt
    headers['x-csrf-token'] = '00000000000000000000000000000000'
    headers['Cookie'] = f'gt={gt}; ct0=00000000000000000000000000000000'
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())

def get_user_id(screen_name, bearer, gt):
    features = {
        'hidden_profile_subscriptions_enabled': True,
        'rweb_tipjar_consumption_enabled': True,
        'responsive_web_graphql_exclude_directive_enabled': True,
        'verified_phone_label_enabled': False,
        'highlights_tweets_tab_ui_enabled': True,
        'responsive_web_twitter_article_notes_tab_enabled': True,
        'subscriptions_feature_can_gift_premium': True,
        'creator_subscriptions_tweet_preview_api_enabled': True,
        'responsive_web_graphql_timeline_navigation_enabled': True,
        'responsive_web_graphql_skip_user_profile_image_extensions_enabled': False,
        'responsive_web_enhance_cards_enabled': False,
    }
    variables = json.dumps({'screen_name': screen_name, 'withSafetyModeUserFields': True})
    params = urllib.parse.urlencode({'variables': variables, 'features': json.dumps(features)})
    url = f'https://api.x.com/graphql/IGgvgiOx4QZndDHuD3x9TQ/UserByScreenName?{params}'
    data = graphql_get(url, bearer, gt)
    bid = data['data']['user']['result']['id']
    uid = base64.b64decode(bid).decode().split(':')[-1]
    name = data['data']['user']['result'].get('core', {}).get('name', '')
    return uid, name

def get_user_tweets(user_id, bearer, gt, count=20):
    features = {
        'rweb_tipjar_consumption_enabled': True,
        'responsive_web_graphql_exclude_directive_enabled': True,
        'verified_phone_label_enabled': False,
        'highlights_tweets_tab_ui_enabled': True,
        'responsive_web_twitter_article_notes_tab_enabled': True,
        'subscriptions_feature_can_gift_premium': True,
        'creator_subscriptions_tweet_preview_api_enabled': True,
        'responsive_web_graphql_timeline_navigation_enabled': True,
        'responsive_web_graphql_skip_user_profile_image_extensions_enabled': False,
        'responsive_web_enhance_cards_enabled': False,
        'creator_subscriptions_quote_tweet_preview_enabled': False,
        'communities_web_enable_tweet_community_results_fetch': True,
        'c9s_tweet_anatomy_moderator_badge_enabled': True,
        'articles_preview_enabled': True,
        'responsive_web_edit_tweet_api_enabled': True,
        'graphql_is_translatable_rweb_tweet_is_translatable_enabled': True,
        'view_counts_everywhere_api_enabled': True,
        'longform_content_consumption_enabled': True,
        'responsive_web_twitter_article_tweet_consumption_enabled': True,
        'tweet_awards_web_tipping_enabled': False,
        'freedom_of_speech_not_reach_fetch_enabled': True,
        'standardized_nft_pinned_accounts_enabled': False,
        'tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled': True,
        'rweb_video_timestamps_enabled': True,
        'longform_content_scribing_enabled': False,
        'tweet_with_visibility_results_prefer_gql_media_interstitial_enabled': False,
    }
    variables = json.dumps({
        'userId': user_id,
        'count': count,
        'includePromotedContent': False,
        'withQuickPromoteEligibilityTweetFields': False,
        'withVoice': False,
        'withV2Timeline': True
    })
    params = urllib.parse.urlencode({'variables': variables, 'features': json.dumps(features)})
    url = f'https://api.x.com/graphql/6fWQaBPK51aGyC_VC7t9GQ/UserTweets?{params}'
    data = graphql_get(url, bearer, gt)
    return data

def extract_tweets_from_timeline(data):
    tweets = []
    try:
        instructions = data['data']['user']['result']['timeline_v2']['timeline']['instructions']
    except (KeyError, TypeError):
        return tweets
    
    for inst in instructions:
        entries = inst.get('entries', [])
        for entry in entries:
            content = entry.get('content', {})
            ctype = content.get('__typename', '')
            
            if ctype == 'TimelineTimelineItem':
                ic = content.get('itemContent', {})
                if ic.get('__typename') == 'TimelineTweet':
                    tr = ic.get('tweet_results', {}).get('result', {})
                    legacy = tr.get('legacy', {})
                    core = tr.get('core', {}).get('user_results', {}).get('result', {})
                    core_legacy = core.get('legacy', {})
                    tweet_id = tr.get('rest_id', '')
                    
                    # Check for quoted tweet  
                    quoted_post_url = None
                    quoted = tr.get('quoted_status_id_str') or legacy.get('quoted_status_id_str')
                    if quoted:
                        quoted_post_url = f'https://x.com/i/status/{quoted}'
                    
                    # Check if retweet
                    is_repost = 'retweeted_status_id_str' in legacy and legacy.get('retweeted_status_id_str')
                    if is_repost:
                        rt_id = legacy['retweeted_status_id_str']
                        # The original tweet info might be inside
                        rt_result = tr.get('quotedRefResult', {}) or {}
                    
                    # Media
                    media_urls = []
                    entities = legacy.get('entities', {})
                    me = legacy.get('extended_entities', {}).get('media', [])
                    for m in me:
                        if m.get('media_url_https'):
                            media_urls.append(m['media_url_https'])
                    
                    handle = core_legacy.get('screen_name', '')
                    display_name = core_legacy.get('name', '')
                    raw_text = legacy.get('full_text', '')
                    posted_at = legacy.get('created_at', '')
                    post_url = f'https://x.com/{handle}/status/{tweet_id}'
                    
                    if tweet_id and raw_text:
                        tweets.append({
                            'handle': handle,
                            'displayName': display_name,
                            'rawText': raw_text,
                            'postedAtText': posted_at,
                            'postUrl': post_url,
                            'postId': tweet_id,
                            'isRepost': bool(is_repost),
                            'mediaUrls': media_urls,
                            'quotedPostUrl': quoted_post_url
                        })
            
            elif ctype == 'TimelineTimelineModule':
                # Pinned tweet or conversation
                for item in content.get('items', []):
                    ic = item.get('item', {}).get('itemContent', {})
                    if ic.get('__typename') == 'TimelineTweet':
                        tr = ic.get('tweet_results', {}).get('result', {})
                        legacy = tr.get('legacy', {})
                        core = tr.get('core', {}).get('user_results', {}).get('result', {})
                        core_legacy = core.get('legacy', {})
                        tweet_id = tr.get('rest_id', '')
                        handle = core_legacy.get('screen_name', '')
                        display_name = core_legacy.get('name', '')
                        raw_text = legacy.get('full_text', '')
                        posted_at = legacy.get('created_at', '')
                        post_url = f'https://x.com/{handle}/status/{tweet_id}'
                        
                        is_repost = bool(legacy.get('retweeted_status_id_str'))
                        quoted_post_url = None
                        if legacy.get('quoted_status_id_str'):
                            quoted_post_url = f'https://x.com/i/status/{legacy["quoted_status_id_str"]}'
                        
                        media_urls = []
                        me = legacy.get('extended_entities', {}).get('media', [])
                        for m in me:
                            if m.get('media_url_https'):
                                media_urls.append(m['media_url_https'])
                        
                        if tweet_id and raw_text:
                            tweets.append({
                                'handle': handle,
                                'displayName': display_name,
                                'rawText': raw_text,
                                'postedAtText': posted_at,
                                'postUrl': post_url,
                                'postId': tweet_id,
                                'isRepost': is_repost,
                                'mediaUrls': media_urls,
                                'quotedPostUrl': quoted_post_url
                            })
    return tweets

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python x-graphql-collect.py <handle1> [handle2] ...")
        sys.exit(1)
    
    handles = sys.argv[1:]
    gt = get_guest_token()
    all_tweets = []
    
    for handle in handles:
        try:
            uid, name = get_user_id(handle, BEARER, gt)
            print(f"@{handle} → rest_id={uid} ({name})", file=sys.stderr)
            data = get_user_tweets(uid, BEARER, gt, count=20)
            tweets = extract_tweets_from_timeline(data)
            if not tweets:
                print(f"  → 0 tweets (possibly blocked for guest)", file=sys.stderr)
            for t in tweets:
                t['handle'] = handle  # ensure correct casing
                all_tweets.append(t)
                print(f"  → {t['postId']}: {t['rawText'][:60]}...", file=sys.stderr)
            time.sleep(1)  # rate limit courtesy
        except Exception as e:
            print(f"  → Error: {e}", file=sys.stderr)
    
    print(json.dumps(all_tweets, indent=2))