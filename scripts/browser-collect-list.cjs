// Browser-based X list collection via individual account scraping
// Used when the X list page requires login
const fs = require('fs');
const path = require('path');

const ACCOUNTS = [
  'Morecryptoonl','cz_binance','elonmusk','IvanOnTech','scottmelker',
  'cryptorover','coinbureau','KobeissiLetter','sentdefender','milesdeutscher',
  'AshCrypto','CryptoWendyO','pierre_crypt0','intocryptoverse','WholeMarsBlog',
  'saeed_xbt','CryptoCred','hasufl','ysiu','Eljaboom',
  'ZssBecker','TrueGemHunter','whalefud','ctoLarsson','StaniKulechov',
  'cryptomanran','coinmamba','danheld','sashahodler','trader1sz',
  'dvorahfr','justinsuntron','SchiffGold','AlexMAstley','CryptoTony__',
  'MarkWerling5','Vito_168','WOLF_Bitcoin_','IamCryptoWolf','KAPOTHEGOAT01',
  'bull_bnb','DegenerateNews','Eunicedwong','MartiniGuyYT','ColdBloodShill',
  'CryptoDefiLord','CryptoGodJohn','FluminenseFC','NGSuper_Falcons','Pontifex',
  'ShardiB2','_CryptoSurf','AJEnglish','churchofengland','ArthurMacwaters',
  'Bullrun_Gravano'
];

// Sort by activity priority (most important first)
const PRIORITY = ['Morecryptoonl','cz_binance','KobeissiLetter','sentdefender','scottmelker','milesdeutscher','cryptorover','coinbureau','AshCrypto','CryptoWendyO','IvanOnTech','intocryptoverse','pierre_crypt0','elonmusk'];
ACCOUNTS.sort((a, b) => {
  const ai = PRIORITY.indexOf(a);
  const bi = PRIORITY.indexOf(b);
  if (ai !== -1 && bi !== -1) return ai - bi;
  if (ai !== -1) return -1;
  if (bi !== -1) return 1;
  return 0;
});

const EXTRACT_SCRIPT = `
(() => {
  const tweets = [];
  const articles = document.querySelectorAll('article[data-testid="tweet"]');
  articles.forEach(article => {
    try {
      const textEl = article.querySelector('[data-testid="tweetText"]') || article.querySelector('div[lang]');
      const timeEl = article.querySelector('time');
      const allStatusLinks = article.querySelectorAll('a[href*="/status/"]');
      const repostEl = article.querySelector('[data-testid="socialContext"]');
      const imgEls = article.querySelectorAll('img[src*="pbs.twimg.com/media"]');
      
      // Handle
      const userLink = article.querySelector('[data-testid="UserAvatar-Container-undefined"] a, [data-testid="User-Names"] a[href^="/"]');
      const pageHandle = document.location.pathname.substring(1).split('/')[0];
      
      // Post URL - first status link in the time area is the main post
      let postUrl = '';
      let postId = '';
      const timeLink = timeEl ? timeEl.closest('a') : null;
      if (timeLink) {
        const href = timeLink.getAttribute('href');
        postUrl = 'https://x.com' + href;
        const m = href.match(/status\\/(\\d+)/);
        if (m) postId = m[1];
      } else if (allStatusLinks.length > 0) {
        const href = allStatusLinks[0].getAttribute('href');
        postUrl = 'https://x.com' + href;
        const m = href.match(/status\\/(\\d+)/);
        if (m) postId = m[1];
      }
      
      // Quoted post (second status link)
      let quotedPostUrl = null;
      if (allStatusLinks.length > 1) {
        for (let i = 1; i < allStatusLinks.length; i++) {
          const href = allStatusLinks[i].getAttribute('href');
          if (href && href.includes('/status/') && !href.includes('/analytics')) {
            quotedPostUrl = 'https://x.com' + href;
            break;
          }
        }
      }
      
      // Is repost
      let isRepost = false;
      if (repostEl) {
        const txt = repostEl.textContent.toLowerCase();
        isRepost = txt.includes('reposted') || txt.includes('repost');
      }
      
      // Display name  
      let displayName = '';
      const nameContainer = article.querySelector('[data-testid="User-Names"]');
      if (nameContainer) {
        const spans = nameContainer.querySelectorAll('span');
        for (const s of spans) {
          const t = s.textContent.trim();
          if (t && !t.startsWith('@') && t !== '·' && t !== 'Verified account' && t.length > 1) {
            displayName = t;
            break;
          }
        }
      }
      
      tweets.push({
        handle: pageHandle,
        displayName: displayName,
        rawText: textEl ? textEl.innerText : '',
        postedAtText: timeEl ? timeEl.innerText : '',
        postUrl: postUrl,
        postId: postId,
        isRepost: isRepost,
        mediaUrls: Array.from(imgEls).map(img => img.src),
        quotedPostUrl: quotedPostUrl
      });
    } catch(e) {}
  });
  return JSON.stringify(tweets);
})()
`;

console.log(JSON.stringify({ accounts: ACCOUNTS.slice(0, 15), extractScript: EXTRACT_SCRIPT.length }));