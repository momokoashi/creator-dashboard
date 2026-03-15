// ============================================================
// Creator Analytics Dashboard — Frontend Logic
// ============================================================

const STORAGE_KEY = 'creator-dashboard-data';

// State
let creators = [];
let selectedCreatorId = null;

// DOM references
const creatorListEl = document.getElementById('creatorList');
const emptyStateEl = document.getElementById('emptyState');
const creatorDetailEl = document.getElementById('creatorDetail');
const searchInput = document.getElementById('searchCreators');
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingText = document.getElementById('loadingText');
const toastEl = document.getElementById('toast');

// ============================================================
// LocalStorage
// ============================================================

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    creators = raw ? JSON.parse(raw) : [];
  } catch {
    creators = [];
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(creators));
}

// ============================================================
// Helpers
// ============================================================

function generateId() {
  return 'cr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
}

function formatNumber(n) {
  if (n == null || isNaN(n)) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

function parseNumberInput(val) {
  if (!val || val === '—') return 0;
  val = val.toString().replace(/,/g, '').trim();
  const multiplier = val.match(/([KkMm])$/);
  let num = parseFloat(val);
  if (isNaN(num)) return 0;
  if (multiplier) {
    const m = multiplier[1].toUpperCase();
    if (m === 'K') num *= 1000;
    if (m === 'M') num *= 1000000;
  }
  return Math.round(num);
}

function calcAverage(arr) {
  if (!arr.length) return 0;
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
}

function calcMedian(arr) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function calcMin(arr) {
  if (!arr.length) return 0;
  return Math.min(...arr);
}

function showToast(message, type = 'info') {
  toastEl.textContent = message;
  toastEl.className = 'toast ' + type;
  toastEl.style.display = 'block';
  clearTimeout(toastEl._timer);
  toastEl._timer = setTimeout(() => { toastEl.style.display = 'none'; }, 4000);
}

function showLoading(text) {
  loadingText.textContent = text || 'Loading...';
  loadingOverlay.style.display = 'flex';
}

function hideLoading() {
  loadingOverlay.style.display = 'none';
}

// ============================================================
// Render Sidebar
// ============================================================

function renderSidebar(filter = '') {
  const filtered = filter
    ? creators.filter(c => c.name.toLowerCase().includes(filter.toLowerCase()))
    : creators;

  creatorListEl.innerHTML = '';
  filtered.forEach(c => {
    const li = document.createElement('li');
    li.className = c.id === selectedCreatorId ? 'active' : '';
    li.onclick = () => selectCreator(c.id);

    const name = document.createElement('span');
    name.textContent = c.name;

    const dots = document.createElement('span');
    dots.className = 'creator-platforms';
    if (c.urls?.youtube) dots.innerHTML += '<span class="platform-dot yt"></span>';
    if (c.urls?.tiktok) dots.innerHTML += '<span class="platform-dot tt"></span>';
    if (c.urls?.instagram) dots.innerHTML += '<span class="platform-dot ig"></span>';
    if (c.urls?.podcast) dots.innerHTML += '<span class="platform-dot pod"></span>';

    li.appendChild(name);
    li.appendChild(dots);
    creatorListEl.appendChild(li);
  });
}

// ============================================================
// Select Creator & Render Detail
// ============================================================

function selectCreator(id) {
  selectedCreatorId = id;
  renderSidebar(searchInput.value);
  renderDetail();
}

function getSelectedCreator() {
  return creators.find(c => c.id === selectedCreatorId);
}

function renderDetail() {
  const creator = getSelectedCreator();
  if (!creator) {
    emptyStateEl.style.display = 'flex';
    creatorDetailEl.style.display = 'none';
    return;
  }

  emptyStateEl.style.display = 'none';
  creatorDetailEl.style.display = 'block';

  document.getElementById('detailName').textContent = creator.name;

  // Platform links
  setLink('ytLink', creator.urls?.youtube);
  setLink('ttLink', creator.urls?.tiktok ? `https://www.tiktok.com/@${cleanUsername(creator.urls.tiktok)}` : '');
  setLink('igLink', creator.urls?.instagram ? `https://www.instagram.com/${cleanUsername(creator.urls.instagram)}` : '');
  setLink('podLink', creator.urls?.podcast);

  // YouTube Shorts link (same channel, /shorts tab)
  setLink('ytsLink', creator.urls?.youtube ? creator.urls.youtube.replace(/\/$/, '') + '/shorts' : '');

  // Platform stats
  const platforms = ['youtube', 'youtube_shorts', 'tiktok', 'instagram', 'instagram_reels', 'podcast'];
  const prefixes = { youtube: 'yt', youtube_shorts: 'yts', tiktok: 'tt', instagram: 'ig', instagram_reels: 'igr', podcast: 'pod' };

  platforms.forEach(p => {
    const prefix = prefixes[p];
    const data = creator.platforms?.[p] || {};
    const videos = data.videos || [];
    const views = videos.map(v => v.views || 0);

    document.getElementById(`${prefix}Followers`).value = data.followers ? formatNumber(data.followers) : '';
    document.getElementById(`${prefix}Engagement`).value = data.engagementRate || '';
    document.getElementById(`${prefix}AvgViews`).value = views.length ? formatNumber(calcAverage(views)) : '';
    document.getElementById(`${prefix}MedianViews`).value = views.length ? formatNumber(calcMedian(views)) : '';
    document.getElementById(`${prefix}MinViews`).value = views.length ? formatNumber(calcMin(views)) : '';
  });

  renderVideoTables(creator);
  renderScreenshots(creator);
  renderCpmResults(creator);
}

function setLink(elId, url) {
  const el = document.getElementById(elId);
  if (url) {
    el.href = url.startsWith('http') ? url : 'https://' + url;
    el.style.display = 'inline';
  } else {
    el.href = '#';
    el.style.display = 'none';
  }
}

function cleanUsername(input) {
  return input.replace('@', '').replace(/https?:\/\/(www\.)?(tiktok|instagram)\.com\//i, '').split('/')[0].split('?')[0];
}

// ============================================================
// Video Tables
// ============================================================

function renderVideoTables(creator) {
  const container = document.getElementById('videoTablesContainer');
  container.innerHTML = '';

  const platforms = [
    { key: 'youtube', label: 'YouTube' },
    { key: 'youtube_shorts', label: 'YT Shorts' },
    { key: 'tiktok', label: 'TikTok' },
    { key: 'instagram', label: 'Instagram' },
    { key: 'instagram_reels', label: 'IG Reels' },
    { key: 'podcast', label: 'Podcast' }
  ];

  // Platforms that should show a Likes column
  const showLikes = ['tiktok', 'instagram', 'instagram_reels'];

  platforms.forEach(({ key, label }) => {
    const data = creator.platforms?.[key] || {};
    const videos = data.videos || [];
    const hasLikes = showLikes.includes(key);

    // Always show the table so user can manually add data
    const card = document.createElement('div');
    card.className = 'video-table-card';
    card.dataset.platform = key;

    const views = videos.map(v => v.views || 0);
    const avg = views.length ? calcAverage(views) : 0;
    const median = views.length ? calcMedian(views) : 0;

    let rows = '';
    for (let i = 0; i < 10; i++) {
      const v = videos[i] || {};
      const title = v.title || '';
      const viewCount = v.views || '';
      const likeCount = v.likes || '';
      rows += `
        <tr>
          <td>${i + 1}</td>
          <td><input type="text" value="${escapeHtml(title)}" data-platform="${key}" data-index="${i}" data-field="title" class="video-edit"></td>
          <td><input type="text" value="${viewCount ? formatNumber(viewCount) : ''}" data-platform="${key}" data-index="${i}" data-field="views" class="video-edit video-views-input"></td>
          ${hasLikes ? `<td><input type="text" value="${likeCount ? formatNumber(likeCount) : ''}" data-platform="${key}" data-index="${i}" data-field="likes" class="video-edit video-views-input"></td>` : ''}
        </tr>`;
    }

    card.innerHTML = `
      <h4>${label} — Last 10</h4>
      <table class="video-table">
        <thead>
          <tr><th>#</th><th>Title</th><th>Views</th>${hasLikes ? '<th>Likes</th>' : ''}</tr>
        </thead>
        <tbody>
          ${rows}
          <tr class="summary-row">
            <td></td>
            <td>Average</td>
            <td>${views.length ? formatNumber(avg) : '—'}</td>
            ${hasLikes ? '<td></td>' : ''}
          </tr>
          <tr class="summary-row">
            <td></td>
            <td>Median</td>
            <td>${views.length ? formatNumber(median) : '—'}</td>
            ${hasLikes ? '<td></td>' : ''}
          </tr>
          <tr class="summary-row">
            <td></td>
            <td>Min</td>
            <td>${views.length ? formatNumber(calcMin(views)) : '—'}</td>
            ${hasLikes ? '<td></td>' : ''}
          </tr>
        </tbody>
      </table>`;

    container.appendChild(card);
  });

  // Attach change listeners for video edit inputs
  container.querySelectorAll('.video-edit').forEach(input => {
    input.addEventListener('change', handleVideoEdit);
  });
}

function handleVideoEdit(e) {
  const creator = getSelectedCreator();
  if (!creator) return;

  const { platform, index, field } = e.target.dataset;
  const idx = parseInt(index);

  if (!creator.platforms) creator.platforms = {};
  if (!creator.platforms[platform]) creator.platforms[platform] = {};
  if (!creator.platforms[platform].videos) creator.platforms[platform].videos = [];

  // Ensure array has enough entries
  while (creator.platforms[platform].videos.length <= idx) {
    creator.platforms[platform].videos.push({ title: '', views: 0 });
  }

  if (field === 'views') {
    creator.platforms[platform].videos[idx].views = parseNumberInput(e.target.value);
  } else {
    creator.platforms[platform].videos[idx][field] = e.target.value;
  }

  saveData();
  renderDetail(); // Re-render to update avg/median
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ============================================================
// Platform Stat Editing
// ============================================================

document.querySelectorAll('.stat-input[data-field]').forEach(input => {
  input.addEventListener('change', (e) => {
    const creator = getSelectedCreator();
    if (!creator) return;

    const platform = e.target.closest('.platform-card').dataset.platform;
    const field = e.target.dataset.field;

    if (!creator.platforms) creator.platforms = {};
    if (!creator.platforms[platform]) creator.platforms[platform] = {};

    if (field === 'followers') {
      creator.platforms[platform].followers = parseNumberInput(e.target.value);
    } else if (field === 'engagementRate') {
      creator.platforms[platform].engagementRate = parseFloat(e.target.value) || 0;
    }

    saveData();
  });
});

// ============================================================
// CPM Calculator
// ============================================================

document.getElementById('calculateCpmBtn').addEventListener('click', () => {
  const creator = getSelectedCreator();
  if (!creator) return;

  const cost = parseFloat(document.getElementById('cpmCost').value) || 0;
  if (cost <= 0) {
    showToast('Please enter a valid cost', 'error');
    return;
  }

  const selectedPlatforms = [];
  ['cpmYoutube', 'cpmYoutubeShorts', 'cpmTiktok', 'cpmInstagram', 'cpmInstagramReels', 'cpmPodcast'].forEach(id => {
    const cb = document.getElementById(id);
    if (cb.checked) selectedPlatforms.push(cb.value);
  });

  if (selectedPlatforms.length === 0) {
    showToast('Please select at least one platform', 'error');
    return;
  }

  // Save CPM settings to creator
  creator.cpmCost = cost;
  creator.cpmPlatforms = selectedPlatforms;
  saveData();

  renderCpmResults(creator);
});

function renderCpmResults(creator) {
  const cost = creator?.cpmCost || parseFloat(document.getElementById('cpmCost').value) || 0;
  const selectedPlatforms = creator?.cpmPlatforms || [];

  if (!cost || !selectedPlatforms.length) {
    document.getElementById('cpmResults').style.display = 'none';
    // Restore saved CPM settings if they exist
    if (creator?.cpmCost) document.getElementById('cpmCost').value = creator.cpmCost;
    if (creator?.cpmPlatforms) {
      ['cpmYoutube', 'cpmYoutubeShorts', 'cpmTiktok', 'cpmInstagram', 'cpmInstagramReels', 'cpmPodcast'].forEach(id => {
        const cb = document.getElementById(id);
        cb.checked = creator.cpmPlatforms.includes(cb.value);
      });
    }
    return;
  }

  // Restore form state
  document.getElementById('cpmCost').value = cost;
  ['cpmYoutube', 'cpmYoutubeShorts', 'cpmTiktok', 'cpmInstagram', 'cpmInstagramReels', 'cpmPodcast'].forEach(id => {
    const cb = document.getElementById(id);
    cb.checked = selectedPlatforms.includes(cb.value);
  });

  let totalAvgViews = 0;
  let totalMedianViews = 0;
  const perPlatform = [];

  selectedPlatforms.forEach(p => {
    const data = creator.platforms?.[p] || {};
    const views = (data.videos || []).map(v => v.views || 0).filter(v => v > 0);
    const avg = views.length ? calcAverage(views) : 0;
    const median = views.length ? calcMedian(views) : 0;

    totalAvgViews += avg;
    totalMedianViews += median;

    perPlatform.push({
      platform: p,
      avgViews: avg,
      medianViews: median,
      avgCpm: avg > 0 ? (cost / avg * 1000).toFixed(2) : '—',
      medianCpm: median > 0 ? (cost / median * 1000).toFixed(2) : '—'
    });
  });

  const combinedAvgCpm = totalAvgViews > 0 ? (cost / totalAvgViews * 1000).toFixed(2) : '—';
  const combinedMedianCpm = totalMedianViews > 0 ? (cost / totalMedianViews * 1000).toFixed(2) : '—';

  document.getElementById('cpmAverage').textContent = combinedAvgCpm !== '—' ? `$${combinedAvgCpm}` : '—';
  document.getElementById('cpmMedian').textContent = combinedMedianCpm !== '—' ? `$${combinedMedianCpm}` : '—';

  document.getElementById('cpmAvgBreakdown').textContent =
    `$${cost.toLocaleString()} / ${formatNumber(totalAvgViews)} avg views × 1000`;
  document.getElementById('cpmMedianBreakdown').textContent =
    `$${cost.toLocaleString()} / ${formatNumber(totalMedianViews)} median views × 1000`;

  // Per-platform breakdown
  const perPlatformEl = document.getElementById('perPlatformCpm');
  perPlatformEl.innerHTML = '';

  const platformLabels = { youtube: 'YouTube', youtube_shorts: 'YT Shorts', tiktok: 'TikTok', instagram: 'Instagram', instagram_reels: 'IG Reels', podcast: 'Podcast' };

  perPlatform.forEach(pp => {
    perPlatformEl.innerHTML += `
      <div class="per-platform-cpm-card">
        <h5>${platformLabels[pp.platform] || pp.platform}</h5>
        <div>Avg: <span class="value">${pp.avgViews > 0 ? formatNumber(pp.avgViews) + ' views' : 'No data'}</span></div>
        <div>Median: <span class="value">${pp.medianViews > 0 ? formatNumber(pp.medianViews) + ' views' : 'No data'}</span></div>
        <div style="margin-top:6px;">CPM (Avg): <strong>${pp.avgCpm !== '—' ? '$' + pp.avgCpm : '—'}</strong></div>
        <div>CPM (Median): <strong>${pp.medianCpm !== '—' ? '$' + pp.medianCpm : '—'}</strong></div>
      </div>`;
  });

  document.getElementById('cpmResults').style.display = 'grid';
}

// ============================================================
// Screenshots
// ============================================================

function renderScreenshots(creator) {
  const gallery = document.getElementById('screenshotGallery');
  const screenshots = creator.screenshots || [];

  if (!screenshots.length) {
    gallery.innerHTML = '<p class="muted">No screenshots captured yet. Click "Capture Screenshot" above.</p>';
    return;
  }

  gallery.innerHTML = '';
  screenshots.forEach((s, i) => {
    const item = document.createElement('div');
    item.className = 'screenshot-item';
    item.innerHTML = `
      <img src="${s.url}" alt="Screenshot" loading="lazy" onclick="window.open('${s.url}', '_blank')">
      <div class="screenshot-meta">
        <span>${s.label || new Date(s.timestamp).toLocaleDateString()}</span>
        <button class="screenshot-delete" data-index="${i}">Remove</button>
      </div>`;
    gallery.appendChild(item);
  });

  gallery.querySelectorAll('.screenshot-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.target.dataset.index);
      creator.screenshots.splice(idx, 1);
      saveData();
      renderScreenshots(creator);
    });
  });
}

document.getElementById('captureScreenshotBtn').addEventListener('click', async () => {
  const creator = getSelectedCreator();
  if (!creator) return;

  // Collect all URLs to screenshot — navigate to videos/posts pages to show view counts
  const urls = [];
  if (creator.urls?.youtube) {
    // Navigate to the Videos tab to show recent uploads with view counts
    const ytUrl = creator.urls.youtube.replace(/\/$/, '');
    urls.push({ url: `${ytUrl}/videos`, label: 'YouTube' });
  }
  if (creator.urls?.tiktok) {
    const user = cleanUsername(creator.urls.tiktok);
    urls.push({ url: `https://www.tiktok.com/@${user}`, label: 'TikTok' });
  }
  if (creator.urls?.instagram) {
    const user = cleanUsername(creator.urls.instagram);
    urls.push({ url: `https://www.instagram.com/${user}/`, label: 'Instagram' });
  }
  if (creator.urls?.podcast) urls.push({ url: creator.urls.podcast, label: 'Podcast' });

  if (!urls.length) {
    showToast('No platform URLs configured for this creator', 'error');
    return;
  }

  showLoading('Capturing screenshots...');
  if (!creator.screenshots) creator.screenshots = [];

  for (const { url, label } of urls) {
    try {
      loadingText.textContent = `Capturing ${label}...`;
      const res = await fetch('/api/screenshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const data = await res.json();
      if (data.success) {
        creator.screenshots.push({
          url: data.url,
          label: label,
          timestamp: Date.now()
        });
      } else if (res.status === 501) {
        // Puppeteer not available (cloud deployment)
        showToast('Screenshots are only available when running locally (not on cloud hosting)', 'error');
        hideLoading();
        return; // Stop trying other platforms too
      } else {
        showToast(`Screenshot failed for ${label}: ${data.error}`, 'error');
      }
    } catch (err) {
      showToast(`Screenshot failed for ${label}: ${err.message}`, 'error');
    }
  }

  saveData();
  hideLoading();
  renderScreenshots(creator);
  showToast('Screenshots captured!', 'success');
});

// ============================================================
// Fetch Data from APIs
// ============================================================

document.getElementById('fetchDataBtn').addEventListener('click', async () => {
  const creator = getSelectedCreator();
  if (!creator) return;

  showLoading('Fetching creator data...');

  if (!creator.platforms) creator.platforms = {};

  const tasks = [];

  // YouTube
  if (creator.urls?.youtube) {
    tasks.push(fetchYouTubeData(creator));
  }

  // TikTok
  if (creator.urls?.tiktok) {
    tasks.push(fetchTikTokData(creator));
  }

  // Instagram
  if (creator.urls?.instagram) {
    tasks.push(fetchInstagramData(creator));
  }

  if (tasks.length === 0) {
    hideLoading();
    showToast('No platform URLs configured. Add URLs by clicking Edit.', 'error');
    return;
  }

  await Promise.allSettled(tasks);

  saveData();
  hideLoading();
  renderDetail();
  showToast('Data fetch complete!', 'success');
});

async function fetchYouTubeData(creator) {
  try {
    loadingText.textContent = 'Fetching YouTube data...';
    const res = await fetch(`/api/youtube/channel?url=${encodeURIComponent(creator.urls.youtube)}`);
    const data = await res.json();

    if (res.ok) {
      if (!creator.platforms.youtube) creator.platforms.youtube = {};
      creator.platforms.youtube.followers = data.followers;
      creator.platforms.youtube.engagementRate = data.engagementRate;
      creator.platforms.youtube.videos = data.videos;
      creator.platforms.youtube.channelName = data.channelName;
      creator.platforms.youtube.profileImage = data.profileImage;
      creator.platforms.youtube.autoFetched = true;

      // Store YouTube Shorts separately (same channel, same followers)
      if (data.shorts && data.shorts.length > 0) {
        if (!creator.platforms.youtube_shorts) creator.platforms.youtube_shorts = {};
        creator.platforms.youtube_shorts.followers = data.followers;
        creator.platforms.youtube_shorts.videos = data.shorts;
        creator.platforms.youtube_shorts.autoFetched = true;
      }
    } else {
      showToast(`YouTube: ${data.error}`, 'error');
    }
  } catch (err) {
    showToast(`YouTube fetch failed: ${err.message}`, 'error');
  }
}

async function fetchTikTokData(creator) {
  try {
    loadingText.textContent = 'Fetching TikTok data...';
    const username = cleanUsername(creator.urls.tiktok);
    const res = await fetch(`/api/tiktok/profile?username=${encodeURIComponent(username)}`);
    const data = await res.json();

    if (res.ok) {
      if (!creator.platforms.tiktok) creator.platforms.tiktok = {};
      creator.platforms.tiktok.followers = data.followers;
      creator.platforms.tiktok.engagementRate = data.engagementRate;
      creator.platforms.tiktok.videos = data.videos;
      creator.platforms.tiktok.channelName = data.channelName;
      creator.platforms.tiktok.autoFetched = true;
    } else {
      showToast(`TikTok: ${data.error}`, 'error');
    }
  } catch (err) {
    showToast(`TikTok fetch failed: ${err.message}`, 'error');
  }
}

async function fetchInstagramData(creator) {
  try {
    loadingText.textContent = 'Fetching Instagram data...';
    const username = cleanUsername(creator.urls.instagram);
    const res = await fetch(`/api/instagram/profile?username=${encodeURIComponent(username)}`);
    const data = await res.json();

    if (res.ok) {
      if (!creator.platforms.instagram) creator.platforms.instagram = {};
      creator.platforms.instagram.followers = data.followers;
      creator.platforms.instagram.engagementRate = data.engagementRate;
      creator.platforms.instagram.videos = data.videos;
      creator.platforms.instagram.channelName = data.channelName;
      creator.platforms.instagram.autoFetched = true;

      // Store IG Reels as a separate platform section
      if (data.reels && data.reels.length > 0) {
        if (!creator.platforms.instagram_reels) creator.platforms.instagram_reels = {};
        creator.platforms.instagram_reels.followers = data.followers;
        creator.platforms.instagram_reels.videos = data.reels;
        creator.platforms.instagram_reels.autoFetched = true;
      }
    } else {
      showToast(`Instagram: ${data.error}`, 'error');
    }
  } catch (err) {
    showToast(`Instagram fetch failed: ${err.message}`, 'error');
  }
}

// ============================================================
// Add / Edit / Delete Creator
// ============================================================

const modal = document.getElementById('creatorModal');
const modalTitle = document.getElementById('modalTitle');
const form = document.getElementById('creatorForm');
let editingCreatorId = null;

document.getElementById('addCreatorBtn').addEventListener('click', () => {
  editingCreatorId = null;
  modalTitle.textContent = 'Add Creator';
  form.reset();
  modal.style.display = 'flex';
});

document.getElementById('editCreatorBtn').addEventListener('click', () => {
  const creator = getSelectedCreator();
  if (!creator) return;

  editingCreatorId = creator.id;
  modalTitle.textContent = 'Edit Creator';
  document.getElementById('formName').value = creator.name;
  document.getElementById('formYoutube').value = creator.urls?.youtube || '';
  document.getElementById('formTiktok').value = creator.urls?.tiktok || '';
  document.getElementById('formInstagram').value = creator.urls?.instagram || '';
  document.getElementById('formPodcast').value = creator.urls?.podcast || '';
  modal.style.display = 'flex';
});

document.getElementById('modalCloseBtn').addEventListener('click', () => { modal.style.display = 'none'; });
document.getElementById('modalCancelBtn').addEventListener('click', () => { modal.style.display = 'none'; });

modal.addEventListener('click', (e) => {
  if (e.target === modal) modal.style.display = 'none';
});

form.addEventListener('submit', (e) => {
  e.preventDefault();

  const name = document.getElementById('formName').value.trim();
  if (!name) return;

  const urls = {
    youtube: document.getElementById('formYoutube').value.trim(),
    tiktok: document.getElementById('formTiktok').value.trim(),
    instagram: document.getElementById('formInstagram').value.trim(),
    podcast: document.getElementById('formPodcast').value.trim()
  };

  if (editingCreatorId) {
    const creator = creators.find(c => c.id === editingCreatorId);
    if (creator) {
      creator.name = name;
      creator.urls = urls;
    }
  } else {
    const newCreator = {
      id: generateId(),
      name,
      urls,
      platforms: {},
      screenshots: [],
      cpmCost: 0,
      cpmPlatforms: []
    };
    creators.push(newCreator);
    selectedCreatorId = newCreator.id;
  }

  saveData();
  modal.style.display = 'none';
  renderSidebar(searchInput.value);
  renderDetail();
  showToast(editingCreatorId ? 'Creator updated!' : 'Creator added!', 'success');
});

// Auto-fill URLs from creator name
document.getElementById('autoFillUrlsBtn').addEventListener('click', () => {
  const name = document.getElementById('formName').value.trim();
  if (!name) {
    showToast('Enter a creator name first', 'error');
    return;
  }

  // Generate a clean handle: lowercase, remove spaces/special chars
  const handle = name.replace(/\s+/g, '').toLowerCase();
  const handleOriginal = name.replace(/\s+/g, '');

  // Auto-fill only empty fields (don't overwrite user-entered URLs)
  const ytField = document.getElementById('formYoutube');
  const ttField = document.getElementById('formTiktok');
  const igField = document.getElementById('formInstagram');

  if (!ytField.value) ytField.value = `https://youtube.com/@${handleOriginal}`;
  if (!ttField.value) ttField.value = `@${handle}`;
  if (!igField.value) igField.value = `@${handle}`;

  showToast('URLs auto-filled from name. Edit if needed.', 'success');
});

document.getElementById('deleteCreatorBtn').addEventListener('click', () => {
  const creator = getSelectedCreator();
  if (!creator) return;

  if (!confirm(`Delete "${creator.name}"? This cannot be undone.`)) return;

  creators = creators.filter(c => c.id !== creator.id);
  selectedCreatorId = creators.length ? creators[0].id : null;

  saveData();
  renderSidebar(searchInput.value);
  renderDetail();
  showToast('Creator deleted', 'success');
});

// ============================================================
// Tab Navigation
// ============================================================

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;

    // Update active tab button
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // Show/hide tab content
    document.querySelectorAll('.tab-content').forEach(tc => {
      tc.style.display = tc.dataset.tab === tab ? 'block' : 'none';
      tc.classList.toggle('active', tc.dataset.tab === tab);
    });

    // When switching to summary, populate cost fields from saved data
    if (tab === 'summary') {
      loadSummaryCosts();
    }
  });
});

// ============================================================
// Summary Tab — Cost & Whitelisting Management
// ============================================================

// Cost field IDs mapped to creator data keys
const costFieldMap = {
  costIgReel: 'costIgReel',
  costTiktok: 'costTiktok',
  costYoutube: 'costYoutube',
  costPodcast: 'costPodcast',
  costBundleIgTt: 'costBundleIgTt',
  costBundleAll: 'costBundleAll',
  wlIg: 'wlIg',
  wlTiktok: 'wlTiktok',
  wlYoutube: 'wlYoutube',
  wlBundle: 'wlBundle'
};

// Auto-save cost inputs on change
Object.keys(costFieldMap).forEach(fieldId => {
  const el = document.getElementById(fieldId);
  if (el) {
    el.addEventListener('change', () => {
      const creator = getSelectedCreator();
      if (!creator) return;
      if (!creator.costs) creator.costs = {};
      creator.costs[costFieldMap[fieldId]] = parseFloat(el.value) || 0;
      saveData();
    });
  }
});

// Load saved cost values into the summary form
function loadSummaryCosts() {
  const creator = getSelectedCreator();
  if (!creator) return;
  const costs = creator.costs || {};

  Object.keys(costFieldMap).forEach(fieldId => {
    const el = document.getElementById(fieldId);
    if (el) {
      el.value = costs[costFieldMap[fieldId]] || '';
    }
  });
}

// ============================================================
// Summary Generation
// ============================================================

document.getElementById('generateSummaryBtn').addEventListener('click', () => {
  const creator = getSelectedCreator();
  if (!creator) return;
  generateSummary(creator);
});

document.getElementById('copySummaryBtn').addEventListener('click', () => {
  const content = document.getElementById('summaryContent');
  // Get plain text version for clipboard
  const text = getSummaryPlainText();
  navigator.clipboard.writeText(text).then(() => {
    showToast('Summary copied to clipboard!', 'success');
  }).catch(() => {
    // Fallback: select and copy
    const range = document.createRange();
    range.selectNodeContents(content);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand('copy');
    showToast('Summary copied to clipboard!', 'success');
  });
});

function generateSummary(creator) {
  const costs = creator.costs || {};
  const platforms = creator.platforms || {};

  // Gather view data for active platforms
  const platformData = {};
  const platformLabels = { instagram: 'IG', tiktok: 'TikTok', instagram_reels: 'IG Reels', youtube: 'YouTube', youtube_shorts: 'YT Shorts', podcast: 'Podcast' };
  const platformNames = { instagram: 'Instagram', tiktok: 'TikTok', instagram_reels: 'IG Reels', youtube: 'YouTube', youtube_shorts: 'YT Shorts', podcast: 'Podcast' };

  ['instagram', 'instagram_reels', 'tiktok', 'youtube', 'youtube_shorts', 'podcast'].forEach(p => {
    const data = platforms[p] || {};
    const videos = (data.videos || []).map(v => v.views || 0).filter(v => v > 0);
    if (videos.length > 0 || data.followers) {
      platformData[p] = {
        avg: videos.length ? calcAverage(videos) : 0,
        median: videos.length ? calcMedian(videos) : 0,
        min: videos.length ? calcMin(videos) : 0,
        followers: data.followers || 0
      };
    }
  });

  // Build the Instagram link for display
  const igUrl = creator.urls?.instagram
    ? `https://www.instagram.com/${cleanUsername(creator.urls.instagram)}/`
    : '';

  // Build HTML summary matching the screenshot format
  let html = '';

  // Creator name + link
  html += `<div class="summary-creator-name">${escapeHtml(creator.name)}`;
  if (igUrl) {
    html += ` <a href="${igUrl}" target="_blank">(${igUrl})</a>`;
  }
  html += '</div>';

  html += '<ul>';

  // === COST SECTION ===
  html += '<li><span class="section-label">Cost</span>';
  html += '<ul>';
  if (costs.costIgReel) html += `<li>1x Dedicated IG reel: <span class="value-highlight">$${Number(costs.costIgReel).toLocaleString()}</span></li>`;
  if (costs.costTiktok) html += `<li>1x Dedicated TikTok: <span class="value-highlight">$${Number(costs.costTiktok).toLocaleString()}</span></li>`;
  if (costs.costYoutube) html += `<li>1x Dedicated YouTube: <span class="value-highlight">$${Number(costs.costYoutube).toLocaleString()}</span></li>`;
  if (costs.costPodcast) html += `<li>1x Dedicated Podcast: <span class="value-highlight">$${Number(costs.costPodcast).toLocaleString()}</span></li>`;
  if (costs.costBundleIgTt) html += `<li>Reel & TikTok Bundle: <span class="value-highlight">$${Number(costs.costBundleIgTt).toLocaleString()}</span></li>`;
  if (costs.costBundleAll) html += `<li>Full Bundle (All Platforms): <span class="value-highlight">$${Number(costs.costBundleAll).toLocaleString()}</span></li>`;
  // If no costs entered
  if (!costs.costIgReel && !costs.costTiktok && !costs.costYoutube && !costs.costPodcast && !costs.costBundleIgTt && !costs.costBundleAll) {
    html += '<li><em>No costs entered</em></li>';
  }
  html += '</ul></li>';

  // === WHITELISTING SECTION ===
  const hasWl = costs.wlIg || costs.wlTiktok || costs.wlYoutube || costs.wlBundle;
  if (hasWl) {
    html += '<li><span class="section-label">Whitelisting (Additional)</span>';
    html += '<ul>';
    if (costs.wlIg) html += `<li>IG Whitelisting: <span class="value-highlight">$${Number(costs.wlIg).toLocaleString()}</span></li>`;
    if (costs.wlTiktok) html += `<li>TikTok Whitelisting: <span class="value-highlight">$${Number(costs.wlTiktok).toLocaleString()}</span></li>`;
    if (costs.wlYoutube) html += `<li>YouTube Whitelisting: <span class="value-highlight">$${Number(costs.wlYoutube).toLocaleString()}</span></li>`;
    if (costs.wlBundle) html += `<li>Full Whitelisting Bundle: <span class="value-highlight">$${Number(costs.wlBundle).toLocaleString()}</span></li>`;
    html += '</ul></li>';
  }

  // === VIEWS SECTION ===
  html += '<li><span class="section-label">Views</span>';
  html += '<ul>';
  ['instagram', 'tiktok', 'youtube', 'podcast'].forEach(p => {
    const d = platformData[p];
    if (d && (d.avg > 0 || d.median > 0)) {
      html += `<li><span class="sub-label">${platformLabels[p]}</span>`;
      html += '<ul>';
      html += `<li>Last 10 videos view average: <span class="value-highlight">${Number(d.avg).toLocaleString()}</span></li>`;
      html += `<li>Last 10 videos view median: <span class="value-highlight">${Number(d.median).toLocaleString()}</span></li>`;
      html += `<li>Last 10 videos view minimum: <span class="value-highlight">${Number(d.min).toLocaleString()}</span></li>`;
      html += '</ul></li>';
    }
  });
  if (!Object.values(platformData).some(d => d.avg > 0 || d.median > 0)) {
    html += '<li><em>No view data available</em></li>';
  }
  html += '</ul></li>';

  // === CPM SECTION ===
  html += '<li><span class="section-label">CPM</span>';
  html += '<ul>';
  let hasCpm = false;

  // Per-platform CPM calculations
  const cpmEntries = [
    { label: 'IG post', costKey: 'costIgReel', platform: 'instagram' },
    { label: 'IG Reel', costKey: 'costIgReels', platform: 'instagram_reels' },
    { label: 'TikTok reel', costKey: 'costTiktok', platform: 'tiktok' },
    { label: 'YouTube video', costKey: 'costYoutube', platform: 'youtube' },
    { label: 'YT Short', costKey: 'costYtShorts', platform: 'youtube_shorts' },
    { label: 'Podcast episode', costKey: 'costPodcast', platform: 'podcast' }
  ];

  cpmEntries.forEach(({ label, costKey, platform }) => {
    const cost = costs[costKey] || 0;
    const d = platformData[platform];
    if (cost > 0 && d) {
      if (d.avg > 0) {
        const cpm = (cost / d.avg * 1000).toFixed(2);
        html += `<li>1 x ${label} based on average: <span class="value-highlight">$${cpm}</span></li>`;
        hasCpm = true;
      }
      if (d.median > 0) {
        const cpm = (cost / d.median * 1000).toFixed(2);
        html += `<li>1 x ${label} based on median: <span class="value-highlight">$${cpm}</span></li>`;
        hasCpm = true;
      }
      if (d.min > 0) {
        const cpm = (cost / d.min * 1000).toFixed(2);
        html += `<li>1 x ${label} based on minimum: <span class="value-highlight">$${cpm}</span></li>`;
        hasCpm = true;
      }
    }
  });

  // Bundle CPM: IG + TikTok
  if (costs.costBundleIgTt && platformData.instagram && platformData.tiktok) {
    const bundleCost = costs.costBundleIgTt;
    const combinedAvg = (platformData.instagram.avg || 0) + (platformData.tiktok.avg || 0);
    const combinedMedian = (platformData.instagram.median || 0) + (platformData.tiktok.median || 0);
    const combinedMin = (platformData.instagram.min || 0) + (platformData.tiktok.min || 0);
    if (combinedAvg > 0) {
      html += `<li>1 x IG & TikTok reel based on average: <span class="value-highlight">$${(bundleCost / combinedAvg * 1000).toFixed(2)}</span></li>`;
      hasCpm = true;
    }
    if (combinedMedian > 0) {
      html += `<li>1 x IG & TikTok reel based on median: <span class="value-highlight">$${(bundleCost / combinedMedian * 1000).toFixed(2)}</span></li>`;
      hasCpm = true;
    }
    if (combinedMin > 0) {
      html += `<li>1 x IG & TikTok reel based on minimum: <span class="value-highlight">$${(bundleCost / combinedMin * 1000).toFixed(2)}</span></li>`;
      hasCpm = true;
    }
  }

  // Full bundle CPM
  if (costs.costBundleAll) {
    const bundleCost = costs.costBundleAll;
    let totalAvg = 0, totalMedian = 0, totalMin = 0;
    Object.values(platformData).forEach(d => {
      totalAvg += d.avg || 0;
      totalMedian += d.median || 0;
      totalMin += d.min || 0;
    });
    if (totalAvg > 0) {
      html += `<li>Full bundle based on average: <span class="value-highlight">$${(bundleCost / totalAvg * 1000).toFixed(2)}</span></li>`;
      hasCpm = true;
    }
    if (totalMedian > 0) {
      html += `<li>Full bundle based on median: <span class="value-highlight">$${(bundleCost / totalMedian * 1000).toFixed(2)}</span></li>`;
      hasCpm = true;
    }
    if (totalMin > 0) {
      html += `<li>Full bundle based on minimum: <span class="value-highlight">$${(bundleCost / totalMin * 1000).toFixed(2)}</span></li>`;
      hasCpm = true;
    }
  }

  if (!hasCpm) {
    html += '<li><em>Enter costs and fetch view data to calculate CPM</em></li>';
  }

  html += '</ul></li>';
  html += '</ul>';

  document.getElementById('summaryContent').innerHTML = html;
  document.getElementById('summaryOutput').style.display = 'block';
  document.getElementById('copySummaryBtn').style.display = 'inline-flex';
}

// Build plain text version for clipboard copy
function getSummaryPlainText() {
  const creator = getSelectedCreator();
  if (!creator) return '';

  const costs = creator.costs || {};
  const platforms = creator.platforms || {};
  const platformLabels = { instagram: 'IG', tiktok: 'TikTok', instagram_reels: 'IG Reels', youtube: 'YouTube', youtube_shorts: 'YT Shorts', podcast: 'Podcast' };

  const igUrl = creator.urls?.instagram
    ? `https://www.instagram.com/${cleanUsername(creator.urls.instagram)}/`
    : '';

  // Gather view data
  const platformData = {};
  ['instagram', 'instagram_reels', 'tiktok', 'youtube', 'youtube_shorts', 'podcast'].forEach(p => {
    const data = platforms[p] || {};
    const videos = (data.videos || []).map(v => v.views || 0).filter(v => v > 0);
    if (videos.length > 0 || data.followers) {
      platformData[p] = {
        avg: videos.length ? calcAverage(videos) : 0,
        median: videos.length ? calcMedian(videos) : 0,
        min: videos.length ? calcMin(videos) : 0
      };
    }
  });

  let text = `${creator.name}`;
  if (igUrl) text += ` (${igUrl})`;
  text += '\n';

  // Cost
  text += '\n• Cost\n';
  if (costs.costIgReel) text += `    ○ 1x Dedicated IG reel: $${Number(costs.costIgReel).toLocaleString()}\n`;
  if (costs.costTiktok) text += `    ○ 1x Dedicated TikTok: $${Number(costs.costTiktok).toLocaleString()}\n`;
  if (costs.costYoutube) text += `    ○ 1x Dedicated YouTube: $${Number(costs.costYoutube).toLocaleString()}\n`;
  if (costs.costPodcast) text += `    ○ 1x Dedicated Podcast: $${Number(costs.costPodcast).toLocaleString()}\n`;
  if (costs.costBundleIgTt) text += `    ○ Reel & TikTok Bundle: $${Number(costs.costBundleIgTt).toLocaleString()}\n`;
  if (costs.costBundleAll) text += `    ○ Full Bundle (All Platforms): $${Number(costs.costBundleAll).toLocaleString()}\n`;

  // Whitelisting
  const hasWl = costs.wlIg || costs.wlTiktok || costs.wlYoutube || costs.wlBundle;
  if (hasWl) {
    text += '\n• Whitelisting (Additional)\n';
    if (costs.wlIg) text += `    ○ IG Whitelisting: $${Number(costs.wlIg).toLocaleString()}\n`;
    if (costs.wlTiktok) text += `    ○ TikTok Whitelisting: $${Number(costs.wlTiktok).toLocaleString()}\n`;
    if (costs.wlYoutube) text += `    ○ YouTube Whitelisting: $${Number(costs.wlYoutube).toLocaleString()}\n`;
    if (costs.wlBundle) text += `    ○ Full Whitelisting Bundle: $${Number(costs.wlBundle).toLocaleString()}\n`;
  }

  // Views
  text += '\n• Views\n';
  ['instagram', 'tiktok', 'youtube', 'podcast'].forEach(p => {
    const d = platformData[p];
    if (d && (d.avg > 0 || d.median > 0)) {
      text += `    ○ ${platformLabels[p]}\n`;
      text += `        ■ Last 10 videos view average: ${Number(d.avg).toLocaleString()}\n`;
      text += `        ■ Last 10 videos view median: ${Number(d.median).toLocaleString()}\n`;
      text += `        ■ Last 10 videos view minimum: ${Number(d.min).toLocaleString()}\n`;
    }
  });

  // CPM
  text += '\n• CPM\n';
  const cpmEntries2 = [
    { label: 'IG post', costKey: 'costIgReel', platform: 'instagram' },
    { label: 'IG Reel', costKey: 'costIgReels', platform: 'instagram_reels' },
    { label: 'TikTok reel', costKey: 'costTiktok', platform: 'tiktok' },
    { label: 'YouTube video', costKey: 'costYoutube', platform: 'youtube' },
    { label: 'YT Short', costKey: 'costYtShorts', platform: 'youtube_shorts' },
    { label: 'Podcast episode', costKey: 'costPodcast', platform: 'podcast' }
  ];

  cpmEntries2.forEach(({ label, costKey, platform }) => {
    const cost = costs[costKey] || 0;
    const d = platformData[platform];
    if (cost > 0 && d) {
      if (d.avg > 0) text += `    ○ 1 x ${label} based on average: $${(cost / d.avg * 1000).toFixed(2)}\n`;
      if (d.median > 0) text += `    ○ 1 x ${label} based on median: $${(cost / d.median * 1000).toFixed(2)}\n`;
      if (d.min > 0) text += `    ○ 1 x ${label} based on minimum: $${(cost / d.min * 1000).toFixed(2)}\n`;
    }
  });

  if (costs.costBundleIgTt && platformData.instagram && platformData.tiktok) {
    const bundleCost = costs.costBundleIgTt;
    const combinedAvg = (platformData.instagram.avg || 0) + (platformData.tiktok.avg || 0);
    const combinedMedian = (platformData.instagram.median || 0) + (platformData.tiktok.median || 0);
    const combinedMin = (platformData.instagram.min || 0) + (platformData.tiktok.min || 0);
    if (combinedAvg > 0) text += `    ○ 1 x IG & TikTok reel based on average: $${(bundleCost / combinedAvg * 1000).toFixed(2)}\n`;
    if (combinedMedian > 0) text += `    ○ 1 x IG & TikTok reel based on median: $${(bundleCost / combinedMedian * 1000).toFixed(2)}\n`;
    if (combinedMin > 0) text += `    ○ 1 x IG & TikTok reel based on minimum: $${(bundleCost / combinedMin * 1000).toFixed(2)}\n`;
  }

  if (costs.costBundleAll) {
    const bundleCost = costs.costBundleAll;
    let totalAvg = 0, totalMedian = 0, totalMin = 0;
    Object.values(platformData).forEach(d => { totalAvg += d.avg || 0; totalMedian += d.median || 0; totalMin += d.min || 0; });
    if (totalAvg > 0) text += `    ○ Full bundle based on average: $${(bundleCost / totalAvg * 1000).toFixed(2)}\n`;
    if (totalMedian > 0) text += `    ○ Full bundle based on median: $${(bundleCost / totalMedian * 1000).toFixed(2)}\n`;
    if (totalMin > 0) text += `    ○ Full bundle based on minimum: $${(bundleCost / totalMin * 1000).toFixed(2)}\n`;
  }

  return text.trim();
}

// ============================================================
// Search
// ============================================================

searchInput.addEventListener('input', () => {
  renderSidebar(searchInput.value);
});

// ============================================================
// Init
// ============================================================

loadData();
renderSidebar();

if (creators.length > 0) {
  selectedCreatorId = creators[0].id;
  renderDetail();
}
