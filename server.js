require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const axios = require('axios');
// Puppeteer is optional — only available locally, not on cloud hosts
let puppeteer;
try { puppeteer = require('puppeteer'); } catch { puppeteer = null; }
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/screenshots', express.static(path.join(__dirname, 'screenshots')));

// Ensure screenshots directory exists
const screenshotsDir = path.join(__dirname, 'screenshots');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

// ============================================================
// YouTube API (Official — FREE, no RapidAPI cost)
// ============================================================

app.get('/api/youtube/channel', async (req, res) => {
  const { url } = req.query;
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    return res.status(400).json({ error: 'YouTube API key not configured. Add YOUTUBE_API_KEY to .env' });
  }
  if (!url) {
    return res.status(400).json({ error: 'URL parameter required' });
  }

  try {
    const channelId = await resolveYouTubeChannel(url, apiKey);
    if (!channelId) {
      return res.status(404).json({ error: 'Could not resolve YouTube channel from URL' });
    }

    // Get channel stats
    const channelRes = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
      params: { part: 'statistics,snippet', id: channelId, key: apiKey }
    });

    if (!channelRes.data.items?.length) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    const channel = channelRes.data.items[0];
    const stats = channel.statistics;

    // Use the channel's uploads playlist for reliable chronological order
    // The Search API skips videos; PlaylistItems returns ALL uploads in order
    const uploadsPlaylistId = 'UU' + channelId.substring(2); // UC... -> UU...
    let videos = [];
    let shorts = [];
    let nextPageToken = null;
    const maxPages = 4; // Up to 200 results to ensure 10 of each type

    for (let page = 0; page < maxPages; page++) {
      if (videos.length >= 10 && shorts.length >= 10) break;

      const playlistParams = { part: 'contentDetails', playlistId: uploadsPlaylistId, maxResults: 50, key: apiKey };
      if (nextPageToken) playlistParams.pageToken = nextPageToken;

      const playlistRes = await axios.get('https://www.googleapis.com/youtube/v3/playlistItems', { params: playlistParams });
      const videoIds = playlistRes.data.items.map(v => v.contentDetails.videoId).filter(Boolean);
      nextPageToken = playlistRes.data.nextPageToken || null;

      if (videoIds.length === 0) break;

      // Fetch statistics, snippet, AND contentDetails to get video duration
      const detailsRes = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
        params: { part: 'statistics,snippet,contentDetails', id: videoIds.join(','), key: apiKey }
      });

      // Keep original playlist order (newest first) by sorting by publish date
      const allItems = detailsRes.data.items
        .sort((a, b) => new Date(b.snippet.publishedAt) - new Date(a.snippet.publishedAt));

      // Split into long-form videos and Shorts based on duration
      // YouTube Shorts can be up to 3 minutes (180s) since late 2024
      for (const v of allItems) {
        const duration = v.contentDetails?.duration || '';
        const seconds = parseDuration(duration);
        const item = {
          title: v.snippet.title,
          views: parseInt(v.statistics.viewCount) || 0,
          likes: parseInt(v.statistics.likeCount) || 0,
          comments: parseInt(v.statistics.commentCount) || 0,
          publishedAt: v.snippet.publishedAt,
          videoId: v.id
        };

        if (seconds <= 180) {
          if (shorts.length < 10) shorts.push(item);
        } else {
          if (videos.length < 10) videos.push(item);
        }
      }

      if (!nextPageToken) break;
    }

    // Engagement rate based on long-form videos
    const totalLikes = videos.reduce((sum, v) => sum + v.likes, 0);
    const totalComments = videos.reduce((sum, v) => sum + v.comments, 0);
    const totalVideoViews = videos.reduce((sum, v) => sum + v.views, 0);
    const engagementRate = totalVideoViews > 0
      ? ((totalLikes + totalComments) / totalVideoViews * 100).toFixed(2) : 0;

    res.json({
      platform: 'youtube',
      channelName: channel.snippet.title,
      profileImage: channel.snippet.thumbnails.default.url,
      followers: parseInt(stats.subscriberCount) || 0,
      totalViews: parseInt(stats.viewCount) || 0,
      engagementRate: parseFloat(engagementRate),
      videos,
      shorts
    });
  } catch (err) {
    console.error('YouTube API error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to fetch YouTube data: ' + (err.response?.data?.error?.message || err.message) });
  }
});

// Parse YouTube ISO 8601 duration (e.g., "PT30M4S") to total seconds
function parseDuration(iso) {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1]) || 0;
  const minutes = parseInt(match[2]) || 0;
  const seconds = parseInt(match[3]) || 0;
  return hours * 3600 + minutes * 60 + seconds;
}

async function resolveYouTubeChannel(url, apiKey) {
  const patterns = [
    /youtube\.com\/channel\/(UC[\w-]+)/,
    /youtube\.com\/@([\w.-]+)/,
    /youtube\.com\/c\/([\w.-]+)/,
    /youtube\.com\/user\/([\w.-]+)/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      const id = match[1];
      if (id.startsWith('UC')) return id;

      try {
        // Try forHandle (for @username)
        const handleRes = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
          params: { part: 'id', forHandle: id.replace('@', ''), key: apiKey }
        });
        if (handleRes.data.items?.length) return handleRes.data.items[0].id;

        // Fallback: search
        const searchRes = await axios.get('https://www.googleapis.com/youtube/v3/search', {
          params: { part: 'snippet', q: id, type: 'channel', maxResults: 1, key: apiKey }
        });
        if (searchRes.data.items?.length) return searchRes.data.items[0].snippet.channelId;
      } catch (err) {
        console.error('Channel resolve error:', err.message);
      }
    }
  }
  return null;
}

// ============================================================
// TikTok API (via RapidAPI)
// ============================================================

app.get('/api/tiktok/profile', async (req, res) => {
  const { username } = req.query;
  const rapidApiKey = process.env.RAPIDAPI_KEY;

  if (!rapidApiKey) {
    return res.status(400).json({ error: 'RapidAPI key not configured. Add RAPIDAPI_KEY to .env' });
  }
  if (!username) {
    return res.status(400).json({ error: 'Username parameter required' });
  }

  try {
    // Using TikTok API on RapidAPI
    const cleanUsername = username.replace('@', '').replace('https://www.tiktok.com/', '').split('/')[0].split('?')[0];

    const profileRes = await axios.get('https://tiktok-scraper7.p.rapidapi.com/user/info', {
      params: { unique_id: cleanUsername },
      headers: {
        'x-rapidapi-key': rapidApiKey,
        'x-rapidapi-host': 'tiktok-scraper7.p.rapidapi.com'
      }
    });

    const userData = profileRes.data?.data?.user;
    const userStats = profileRes.data?.data?.stats;

    if (!userData) {
      return res.status(404).json({ error: 'TikTok user not found' });
    }

    // Get user videos
    const videosRes = await axios.get('https://tiktok-scraper7.p.rapidapi.com/user/posts', {
      params: { unique_id: cleanUsername, count: 15 },
      headers: {
        'x-rapidapi-key': rapidApiKey,
        'x-rapidapi-host': 'tiktok-scraper7.p.rapidapi.com'
      }
    });

    const rawVideos = videosRes.data?.data?.videos || [];

    // Filter out pinned videos and take last 10
    const videos = rawVideos
      .filter(v => !v.is_top) // is_top = pinned
      .slice(0, 10)
      .map(v => ({
        title: v.title || 'Untitled',
        views: v.play_count || v.stats?.playCount || 0,
        likes: v.digg_count || v.stats?.diggCount || 0,
        comments: v.comment_count || v.stats?.commentCount || 0,
        shares: v.share_count || v.stats?.shareCount || 0,
        publishedAt: v.create_time ? new Date(v.create_time * 1000).toISOString() : null
      }));

    const followers = userStats?.followerCount || 0;
    const totalLikes = videos.reduce((sum, v) => sum + v.likes + v.comments + v.shares, 0);
    const totalViews = videos.reduce((sum, v) => sum + v.views, 0);
    const engagementRate = totalViews > 0 ? ((totalLikes / totalViews) * 100).toFixed(2) : 0;

    res.json({
      platform: 'tiktok',
      channelName: userData.nickname || cleanUsername,
      profileImage: userData.avatarThumb || '',
      followers: followers,
      engagementRate: parseFloat(engagementRate),
      videos: videos
    });
  } catch (err) {
    console.error('TikTok API error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to fetch TikTok data: ' + (err.response?.data?.message || err.message) });
  }
});

// ============================================================
// Instagram API (Instagram Looter on RapidAPI)
// Primary: instagram-looter2.p.rapidapi.com (by IRROR Systems)
// Fallback: Instagram's public web API (rate-limited)
// ============================================================

app.get('/api/instagram/profile', async (req, res) => {
  const { username } = req.query;
  const rapidApiKey = process.env.RAPIDAPI_KEY;

  if (!username) {
    return res.status(400).json({ error: 'Username parameter required' });
  }

  const cleanUser = username.replace('@', '').replace('https://www.instagram.com/', '').split('/')[0].split('?')[0];

  // Strategy 1: Instagram Looter API on RapidAPI (reliable, paid)
  if (rapidApiKey) {
    try {
      const result = await fetchInstagramViaLooter(cleanUser, rapidApiKey);
      if (result) return res.json(result);
    } catch (err) {
      console.error('Instagram Looter API error:', err.response?.data?.message || err.message);
      // Fall through to direct API
    }
  }

  // Strategy 2: Instagram's direct public web API (free but rate-limited)
  try {
    const result = await fetchInstagramDirect(cleanUser);
    if (result) return res.json(result);
    return res.status(404).json({ error: 'Instagram user not found' });
  } catch (err) {
    console.error('Instagram direct API error:', err.response?.data || err.message);
    const status = err.response?.status === 429 ? 429 : (err.response?.status === 404 ? 404 : 500);
    const msg = status === 429
      ? 'Instagram rate limited. Try again in a few minutes.'
      : status === 404
        ? 'Instagram user not found'
        : 'Failed to fetch Instagram data: ' + (err.response?.data?.message || err.message);
    res.status(status).json({ error: msg });
  }
});

// Instagram Looter API by IRROR Systems (RapidAPI)
// Host: instagram-looter2.p.rapidapi.com
// Profile endpoint: GET /profile?username={username} — returns profile + last 12 posts
// Reels endpoint: GET /reels?id={user_id} — returns latest reels with view counts
async function fetchInstagramViaLooter(username, rapidApiKey) {
  const host = 'instagram-looter2.p.rapidapi.com';
  const headers = { 'x-rapidapi-key': rapidApiKey, 'x-rapidapi-host': host };

  // Step 1: Fetch profile data (includes posts)
  console.log(`Instagram Looter: fetching profile for ${username}`);
  const res = await axios.get(`https://${host}/profile`, {
    params: { username },
    headers,
    timeout: 15000
  });

  const data = res.data;
  if (!data || data.status === false) {
    console.log('Instagram Looter: no data returned');
    return null;
  }

  const followers = data.edge_followed_by?.count || data.follower_count || 0;
  const fullName = data.full_name || username;
  const profilePic = data.profile_pic_url_hd || data.profile_pic_url || '';
  const userId = data.id || data.pk || null;

  // Extract posts from profile response (up to 12 posts with likes/comments)
  let posts = [];
  const rawPosts = data.edge_owner_to_timeline_media?.edges || [];
  if (rawPosts.length > 0) {
    posts = rawPosts
      .filter(p => !p.node?.pinned_for_users?.length)
      .slice(0, 10)
      .map(p => {
        const node = p.node;
        const caption = node.edge_media_to_caption?.edges?.[0]?.node?.text || '';
        return {
          title: caption.substring(0, 80) || 'Untitled',
          views: node.video_view_count || node.edge_media_preview_like?.count || node.edge_liked_by?.count || 0,
          likes: node.edge_media_preview_like?.count || node.edge_liked_by?.count || 0,
          comments: node.edge_media_to_comment?.count || 0,
          publishedAt: node.taken_at_timestamp ? new Date(node.taken_at_timestamp * 1000).toISOString() : null
        };
      });
    console.log(`Instagram Looter: got ${posts.length} posts`);
  }

  // Step 2: Fetch reels with view counts (separate API call)
  let reels = [];
  if (userId) {
    try {
      console.log(`Instagram Looter: fetching reels for user ID ${userId}`);
      const reelsRes = await axios.get(`https://${host}/reels`, {
        params: { id: userId },
        headers,
        timeout: 15000
      });
      const rawReels = reelsRes.data?.items || [];
      // Log first reel structure to help debug pinned detection
      // Log count of pinned reels filtered out
      const pinnedCount = rawReels.filter(item => {
        const m = item.media || item;
        return m.timeline_pinned_user_ids?.length > 0 || m.clips_tab_pinned_user_ids?.length > 0 || m.is_artist_pick === true;
      }).length;
      if (pinnedCount > 0) console.log(`Instagram Looter: filtered out ${pinnedCount} pinned reel(s)`);
      reels = rawReels
        // Filter out pinned reels (timeline or clips/reels tab)
        .filter(item => {
          const m = item.media || item;
          const pinned = m.timeline_pinned_user_ids?.length > 0
            || m.clips_tab_pinned_user_ids?.length > 0
            || m.is_pinned === true
            || m.is_artist_pick === true
            || m.pinned_for_users?.length > 0;
          return !pinned;
        })
        .slice(0, 10)
        .map(item => {
          const m = item.media || item;
          const caption = m.caption?.text || '';
          return {
            title: caption.substring(0, 80) || 'Untitled',
            views: m.play_count || m.view_count || 0,
            likes: m.like_count || 0,
            comments: m.comment_count || 0,
            publishedAt: m.taken_at ? new Date(m.taken_at * 1000).toISOString() : null
          };
        });
      console.log(`Instagram Looter: got ${reels.length} reels`);
    } catch (err) {
      console.log(`Instagram Looter: reels fetch failed — ${err.response?.status || err.message}`);
    }
  }

  const totalEngagement = posts.reduce((sum, p) => sum + p.likes + p.comments, 0);
  const engagementRate = followers > 0 && posts.length > 0
    ? ((totalEngagement / posts.length / followers) * 100).toFixed(2)
    : 0;

  return {
    platform: 'instagram',
    channelName: fullName,
    profileImage: profilePic,
    followers: followers,
    engagementRate: parseFloat(engagementRate),
    videos: posts,
    reels: reels
  };
}

// Direct Instagram public web API (free, no key needed, but rate-limited)
async function fetchInstagramDirect(username) {
  const profileRes = await axios.get('https://www.instagram.com/api/v1/users/web_profile_info/', {
    params: { username },
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'X-IG-App-ID': '936619743392459'
    }
  });

  const userData = profileRes.data?.data?.user;
  if (!userData) return null;

  const rawPosts = userData.edge_owner_to_timeline_media?.edges || [];
  const posts = rawPosts
    .filter(p => !p.node?.pinned_for_users?.length)
    .slice(0, 10)
    .map(p => {
      const node = p.node;
      const caption = node.edge_media_to_caption?.edges?.[0]?.node?.text || '';
      return {
        title: caption.substring(0, 80),
        views: node.video_view_count || node.edge_liked_by?.count || 0,
        likes: node.edge_liked_by?.count || 0,
        comments: node.edge_media_to_comment?.count || 0,
        publishedAt: node.taken_at_timestamp ? new Date(node.taken_at_timestamp * 1000).toISOString() : null
      };
    });

  const followers = userData.edge_followed_by?.count || 0;
  const totalEngagement = posts.reduce((sum, p) => sum + p.likes + p.comments, 0);
  const engagementRate = followers > 0 && posts.length > 0
    ? ((totalEngagement / posts.length / followers) * 100).toFixed(2)
    : 0;

  return {
    platform: 'instagram',
    channelName: userData.full_name || username,
    profileImage: userData.profile_pic_url || '',
    followers: followers,
    engagementRate: parseFloat(engagementRate),
    videos: posts
  };
}

// ============================================================
// Screenshot Capture
// ============================================================

app.post('/api/screenshot', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  if (!puppeteer) {
    return res.status(501).json({ error: 'Screenshot capture is only available when running locally (Puppeteer not installed)' });
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions'
      ]
    });
    const page = await browser.newPage();
    // Taller viewport to capture more videos/posts with view counts
    await page.setViewport({ width: 1280, height: 1200 });
    // Set a realistic user agent so platforms don't block us
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    // Wait for video thumbnails and view counts to render
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Dismiss platform-specific popups/overlays that block content
    // Try clicking close/dismiss buttons first
    try {
      // Instagram: click the X button on the login popup
      const closeBtn = await page.$('[aria-label="Close"], [role="dialog"] button svg, button[type="button"]');
      if (closeBtn) await closeBtn.click();
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (e) { /* ignore click errors */ }

    await page.evaluate(() => {
      // Remove all dialogs, modals, overlays
      document.querySelectorAll('[role="presentation"], [role="dialog"]').forEach(el => el.remove());
      // Remove any fixed/sticky overlays blocking content (login walls, cookie banners, CAPTCHAs)
      document.querySelectorAll('body > div, body > section').forEach(el => {
        const style = window.getComputedStyle(el);
        if (style.position === 'fixed' || style.position === 'sticky') {
          // Keep the main content container, remove overlays
          if (parseInt(style.zIndex) > 1 || style.backgroundColor?.includes('rgba')) {
            el.remove();
          }
        }
      });
      // Re-enable scrolling if body was locked by a modal
      document.body.style.overflow = 'auto';
      document.documentElement.style.overflow = 'auto';
      document.body.style.position = 'static';
    });
    await new Promise(resolve => setTimeout(resolve, 500));

    // Scroll down slightly to trigger lazy-loaded content
    await page.evaluate(() => window.scrollBy(0, 300));
    await new Promise(resolve => setTimeout(resolve, 2000));
    // Scroll back to top for clean screenshot
    await page.evaluate(() => window.scrollTo(0, 0));
    await new Promise(resolve => setTimeout(resolve, 500));

    const filename = `screenshot-${Date.now()}.png`;
    const filepath = path.join(screenshotsDir, filename);
    await page.screenshot({ path: filepath, fullPage: false });

    await browser.close();
    res.json({ success: true, url: `/screenshots/${filename}` });
  } catch (err) {
    if (browser) await browser.close();
    console.error('Screenshot error:', err.message);
    res.status(500).json({ error: 'Failed to capture screenshot: ' + err.message });
  }
});

// ============================================================
// Start Server
// ============================================================

app.listen(PORT, () => {
  console.log(`Creator Dashboard running at http://localhost:${PORT}`);
  console.log(`YouTube API: ${process.env.YOUTUBE_API_KEY ? 'Configured ✓ (free)' : 'NOT configured'}`);
  console.log(`RapidAPI Key: ${process.env.RAPIDAPI_KEY ? 'Configured ✓ (TikTok + IG)' : 'NOT configured — add RAPIDAPI_KEY to .env'}`);
});
