import { captureRecipePage } from './capture.js';
import { capturePagePhoto } from './photo-capture.js';
import { selectBrowserCover } from '../shared/browser-cover-selector';
const read = document.querySelector('#read'), status = document.querySelector('#status'), result = document.querySelector('#result'), save = document.querySelector('#save');
let downloadUrl;
read.addEventListener('click', async () => {
  result.hidden = true; read.disabled = true; status.textContent = 'Reading this page…';
  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('Open a recipe tab first.');
    const [response] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: captureRecipePage });
    if (response?.error) throw new Error(response.error.message || 'The recipe could not be read.');
    const capture = response?.result;
    if (!capture?.html) throw new Error('No recipe was returned. Open the full recipe and try again.');
    status.textContent = 'Choosing the food photo…';
    try {
      const selection = selectBrowserCover(capture);
      const [photo] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: capturePagePhoto, args: [selection.candidates] });
      if (photo?.result?.coverPhoto) capture.coverPhoto = { ...photo.result.coverPhoto, recipeTitle: selection.recipeTitle };
      else capture.photoNote = photo?.result?.photoNote || 'No photo could be saved. Paste one in Nibble using Change cover photo.';
    } catch { capture.photoNote = 'The recipe was captured, but its photo could not be saved. Paste one in Nibble using Change cover photo.'; }
    const image = document.querySelector('#photo'); image.hidden = !capture.coverPhoto;
    if (capture.coverPhoto) image.src = 'data:image/jpeg;base64,' + capture.coverPhoto.data; else image.removeAttribute('src');
    document.querySelector('#photo-status').textContent = capture.coverPhoto ? 'Food photo included in your recipe file.' : capture.photoNote;
    const blob = new Blob([JSON.stringify(capture, null, 2)], { type: 'application/json' });
    if (blob.size > 6 * 1024 * 1024) throw new Error('This saved page exceeds 6 MB. Use its print recipe view.');
    downloadUrl = URL.createObjectURL(blob); save.href = downloadUrl;
    save.download = (capture.title.replace(/[^a-z0-9 -]/gi, '').trim().slice(0, 80) || 'recipe') + '.nibble-recipe.json';
    document.querySelector('#title').textContent = capture.title;
    document.querySelector('#source').textContent = capture.url;
    // Show source as literal text; imported website markup never runs in the popup.
    const preview = new DOMParser().parseFromString(capture.html.replace(/<(?:img|meta)\b[^>]*>/gi, '').replace(/<\/(li|p|div|section|h[1-6])>/gi, '</$1>\n'), 'text/html');
    preview.querySelectorAll('script').forEach(node => node.remove());
    document.querySelector('#content').textContent = preview.body.textContent.trim() || 'Recipe metadata captured. Nibble will show the extracted ingredients and directions for review.';
    result.hidden = false; status.textContent = 'Page captured. Review it, then save the recipe file.';
  } catch (error) { status.textContent = error.message || 'Could not read this page. Try its print recipe view or screenshots.'; }
  finally { read.disabled = false; }
});
