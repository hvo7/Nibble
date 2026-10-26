// Self-contained for chrome.scripting. Read accessible pixels; never capture the screen.
export async function capturePagePhoto(candidates) {
  const deadline = AbortSignal.timeout(12000);
  const allowed = value => {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return null;
      // No loopback, local network, or link-local destinations.
      if (/^(localhost|.*\.localhost|.*\.local|.*\.internal|\[.*\]|\d+(?:\.\d+){3})$/i.test(url.hostname) || !url.hostname.includes('.')) return null;
      return url;
    } catch { return null; }
  };
  const encode = (image, width, height) => {
    if (width < 200 || height < 160 || width * height > 40000000 || Math.max(width / height, height / width) > 3.2) throw new Error('Not a suitable dish photo.');
    const scale = Math.min(1, 1200 / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
    if (canvas.width < 200 || canvas.height < 160) throw new Error('Photo is too narrow.');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image conversion is unavailable.');
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [.86, .7, .5]) {
      const encoded = canvas.toDataURL('image/jpeg', quality);
      if (!encoded.startsWith('data:image/jpeg;base64,')) throw new Error('Image conversion failed.');
      const data = encoded.slice(23);
      if (data.length <= 1398104) return { mime: 'image/jpeg', data, width: canvas.width, height: canvas.height };
    }
    throw new Error('Photo is too large.');
  };
  for (const candidate of candidates.slice(0, 6)) {
    if (deadline.aborted) break;
    const url = allowed(candidate.url);
    if (!url) continue;
    try {
      const loaded = [...document.images].filter(image => image.complete && image.naturalWidth && [image.currentSrc, image.src].includes(url.href));
      for (const image of loaded) {
        try { return { coverPhoto: { ...encode(image, image.naturalWidth, image.naturalHeight), sourceUrl: url.href, reason: candidate.reason } }; }
        catch { /* Cross-origin pixels may be protected, or this rendition may be unsuitable. */ }
      }
      // Page-origin only: no new persistent host permissions, cookies, or redirects.
      if (url.origin !== location.origin) continue;
      const response = await fetch(url.href, { credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', signal: deadline });
      if (!response.ok || !/^image\/(jpeg|png|webp)(?:;|$)/i.test(response.headers.get('content-type') || '') || !response.body) continue;
      const limit = 8 * 1024 * 1024;
      if (Number(response.headers.get('content-length')) > limit) { await response.body.cancel(); continue; }
      const reader = response.body.getReader(), chunks = []; let size = 0;
      try {
        while (true) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > limit) throw new Error('Photo is too large.'); chunks.push(value); }
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      deadline.throwIfAborted();
      const bitmap = await createImageBitmap(new Blob(chunks, { type: response.headers.get('content-type').split(';')[0] }));
      try {
        deadline.throwIfAborted();
        return { coverPhoto: { ...encode(bitmap, bitmap.width, bitmap.height), sourceUrl: url.href, reason: candidate.reason } };
      } finally { bitmap.close(); }
    } catch { /* Try the next ranked dish photo; the recipe itself is still useful. */ }
  }
  return { photoNote: candidates.length ? 'The website protected or could not provide a readable dish photo. Copy the food image, then paste it in Nibble using Change cover photo.' : 'No clear dish photo was found. You can paste a cover photo in Nibble.' };
}
