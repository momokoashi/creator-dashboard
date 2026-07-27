// ============================================================
// Quick-add — paste a handle or profile URL, get a creator back.
//
// parseHandleInput: figures out which platform a pasted string belongs
// to and extracts the clean handle. Bare "@handle" defaults to Instagram
// (our most common outreach channel).
//
// fetchProfile / videosToStore: shared with Analytics so a quick-added
// creator lands with the same data shape as a manual "Fetch live".
// ============================================================

/** @returns {{platform:string, handle:string}|null} */
export function parseHandleInput(raw) {
  const s = (raw || '').trim();
  if (!s) return null;

  let platform = 'instagram';
  if (/tiktok\.com/i.test(s)) platform = 'tiktok';
  else if (/youtu\.?be/i.test(s)) platform = 'youtube';
  else if (/instagram\.com/i.test(s)) platform = 'instagram';

  let handle = s;
  const m = s.match(/(?:instagram\.com|tiktok\.com|youtube\.com)\/(@?[\w.-]+)/i);
  if (m) handle = m[1];
  handle = handle.replace(/^@/, '').split('?')[0].split('/')[0];
  if (!handle) return null;
  return { platform, handle };
}

/** Fetch live stats for a platform/handle from our own API. Throws on failure. */
export async function fetchProfile(platform, handleOrUrl) {
  const url =
    platform === 'youtube'
      ? `/api/youtube/channel?url=${encodeURIComponent(
          handleOrUrl.startsWith('http') ? handleOrUrl : 'https://www.youtube.com/@' + handleOrUrl
        )}`
      : platform === 'tiktok'
        ? `/api/tiktok/profile?username=${encodeURIComponent(handleOrUrl)}`
        : `/api/instagram/profile?username=${encodeURIComponent(handleOrUrl)}`;
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Fetch failed');
  return json;
}

/** Keep the full video objects so the UI can list the last 10, not just count them. */
export function videosToStore(videos) {
  return (videos || []).map((v) => ({
    title: v.title || '',
    views: Number(v.views) || 0,
    likes: Number(v.likes) || 0,
    comments: Number(v.comments) || 0,
    publishedAt: v.publishedAt || null,
    ...(v.sponsored != null ? { sponsored: v.sponsored } : {}),
  }));
}

/**
 * Carry manual sponsored tags across a re-fetch: match the fresh videos to
 * the previously stored ones (by publish date, falling back to title) and
 * keep any true/false tag the user set by hand.
 */
export function carryManualTags(freshVideos, oldVideos) {
  const old = oldVideos || [];
  return (freshVideos || []).map((v) => {
    const match = old.find(
      (o) =>
        o.sponsored != null &&
        ((o.publishedAt && v.publishedAt && o.publishedAt === v.publishedAt) ||
          (o.title && v.title && o.title === v.title))
    );
    return match ? { ...v, sponsored: match.sponsored } : v;
  });
}

/** Build the platforms patch for one fetched payload (fills Shorts too for YouTube). */
export function platformPatchFromFetch(platform, json, existingPlatforms = {}) {
  const base = {
    followers: json.followers ?? 0,
    engagementRate: json.engagementRate ?? 0,
    bio: json.bio || '',
    videos: carryManualTags(videosToStore(json.videos), existingPlatforms[platform]?.videos),
    viewsAreLikes: !!json.viewsAreLikes,
    fetchedAt: json.fetchedAt || Date.now(),
  };
  const patch = { [platform]: { ...(existingPlatforms[platform] || {}), ...base } };
  if (platform === 'youtube' && json.shorts?.length) {
    patch.youtubeShorts = {
      ...(existingPlatforms.youtubeShorts || {}),
      followers: base.followers,
      engagementRate: base.engagementRate,
      videos: carryManualTags(videosToStore(json.shorts), existingPlatforms.youtubeShorts?.videos),
      fetchedAt: base.fetchedAt,
    };
  }
  return patch;
}
