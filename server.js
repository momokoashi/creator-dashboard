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

    // Get last 20 videos, take top 10 by date
    const videosRes = await axios.get('https://www.googleapis.com/youtube/v3/search', {
      params: { part: 'id', channelId, maxResults: 20, order: 'date', type: 'video', key: apiKey }
    });

    const videoIds = videosRes.data.items.map(v => v.id.videoId).filter(Boolean);
    let videos = [];

    if (videoIds.length > 0) {
      const detailsRes = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
        params: { part: 'statistics,snippet', id: videoIds.join(','), key: apiKey }
      });

      videos = detailsRes.data.items
        .sort((a, b) => new Date(b.snippet.publishedAt) - new Date(a.snippet.publishedAt))
        .slice(0, 10)
        .map(v => ({
          title: v.snippet.title,
          views: parseInt(v.statistics.viewCount) || 0,
          likes: parseInt(v.statistics.likeCount) || 0,
          comments: parseInt(v.statistics.commentCount) || 0,
          publishedAt: v.snippet.publishedAt,
          videoId: v.id
        }));
    }

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
      videos
    });
  } catch (err) {
    console.error('YouTube API error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to fetch YouTube data: ' + (err.response?.data?.error?.message || err.message) });
  }
});

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
// Instagram API (Direct — FREE, no RapidAPI needed)
// Uses Instagram's public web API for public profile data
// ============================================================

app.get('/api/instagram/profile', async (req, res) => {
  const { username } = req.query;

  if (!username) {
    return res.status(400).json({ error: 'Username parameter required' });
  }

  try {
    const cleanUsername = username.replace('@', '').replace('https://www.instagram.com/', '').split('/')[0].split('?')[0];

    // Fetch profile + recent posts from Instagram's public web API
    const profileRes = await axios.get('https://www.instagram.com/api/v1/users/web_profile_info/', {
      params: { username: cleanUsername },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'X-IG-App-ID': '936619743392459'
      }
    });

    const userData = profileRes.data?.data?.user;
    if (!userData) {
      return res.status(404).json({ error: 'Instagram user not found' });
    }

    // Extract recent posts from the profile response (returns up to 12)
    const rawPosts = userData.edge_owner_to_timeline_media?.edges || [];

    // Filter out pinned posts and take last 10
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

    res.json({
      platform: 'instagram',
      channelName: userData.full_name || cleanUsername,
      profileImage: userData.profile_pic_url || '',
      followers: followers,
      engagementRate: parseFloat(engagementRate),
      videos: posts
    });
  } catch (err) {
    console.error('Instagram API error:', err.response?.data || err.message);
    const status = err.response?.status === 404 ? 404 : 500;
    const msg = err.response?.status === 404
      ? 'Instagram user not found'
      : 'Failed to fetch Instagram data: ' + (err.response?.data?.message || err.message);
    res.status(status).json({ error: msg });
  }
});

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
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for dynamic content

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
