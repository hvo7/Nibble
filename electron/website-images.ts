import { attr, children, clutter, nodes, tag, textOf, tokens, type HtmlNode } from './website-dom';

export type WebsiteImage = { url: string; reason: string; score: number; width?: number; height?: number; alt?: string };
const unwanted = /(?:^|[\s/_.-])(logo|avatar|gravatar|icon|sprite|placeholder|spacer|pixel|tracking|advertisement|ads?|banner|badge|author|profile|related|recommended|newsletter|social|pinterest)(?:$|[\s/_.-])/i;
const processPhoto = /(?:step[-\s]*(?:by[-\s]*step|\d+)|ingredients?[-\s]*(?:shot|photo|laid|needed)|process[-\s]*(?:shot|photo)|collage)/i;
const dimension = (value: unknown): number | undefined => { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : undefined; };
const record = (value: unknown): Record<string, unknown> | undefined => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const words = (value: string) => new Set(value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').split(/\s+/).filter(w => w.length > 2 && !['recipe','recipes','the','with','and','easy','best','www','com','jpg','jpeg','webp','png'].includes(w)));
function matches(title: string, value: string) {
  const a = words(title), b = words(value); return a.size > 0 && [...a].filter(w => b.has(w)).length / a.size >= .6;
}
function parent(node: HtmlNode): HtmlNode | null { return 'parentNode' in node ? node.parentNode ?? null : null; }
function imageClutter(node: HtmlNode) {
  return clutter(node) || unwanted.test(`${attr(node, 'class')} ${attr(node, 'id')}`) || /display\s*:\s*none|visibility\s*:\s*hidden/i.test(attr(node, 'style'));
}
/** Only inert metadata is read; reference resolution is local, bounded and cycle-safe. */
export function structuredImages(value: unknown, resolve: (value: unknown) => unknown): WebsiteImage[] {
  const result: WebsiteImage[] = [], seen = new Set<unknown>();
  function visit(raw: unknown, depth = 0) {
    if (depth > 6 || result.length >= 24 || seen.has(raw)) return;
    seen.add(raw);
    if (Array.isArray(raw)) { raw.slice(0, 24).forEach(item => visit(item, depth + 1)); return; }
    if (typeof raw === 'string') { result.push({ url: raw, reason: 'Recipe metadata', score: 120 }); return; }
    const item = record(resolve(raw)); if (!item) return;
    const width = dimension(record(item.width)?.value ?? item.width), height = dimension(record(item.height)?.value ?? item.height);
    for (const key of ['contentUrl', 'url']) if (typeof item[key] === 'string') result.push({ url: item[key], reason: 'Recipe metadata', score: 120, width, height });
  }
  visit(value); return result.slice(0, 24);
}
function variants(node: HtmlNode, reason: string, score: number): WebsiteImage[] {
  const result: WebsiteImage[] = [];
  const width = dimension(attr(node, 'width')), height = dimension(attr(node, 'height')), alt = attr(node, 'alt');
  const add = (url: string, w = width, h = height) => { if (url && result.length < 20) result.push({ url, reason, score, width: w, height: h, alt }); };
  // Lazy values precede placeholders. Prefer a useful srcset resolution without rewriting signed CDN URLs.
  const sets = [attr(node,'data-srcset'), attr(node,'srcset')];
  if (tag(parent(node) ?? node) === 'picture') for (const source of children(parent(node)!).filter(n => tag(n) === 'source')) sets.push(attr(source,'data-srcset'), attr(source,'srcset'));
  for (const set of sets) for (const entry of set.split(',').slice(0, 20)) {
    const match = entry.trim().match(/^(\S+)\s+(\d+(?:\.\d+)?)(w|x)$/);
    if (match) { const w = match[3] === 'w' ? Number(match[2]) : width ? width * Number(match[2]) : undefined; add(match[1], w, w && width && height ? w * height / width : undefined); }
  }
  for (const key of ['data-src','data-lazy-src','data-original','data-lazy','src']) {
    if (key !== 'src' && /^data:image/i.test(attr(node,'src')) && ((width ?? 200) < 200 || (height ?? 160) < 160)) result.push({ url: attr(node,key), reason, score, alt });
    else add(attr(node,key));
  }
  return result;
}
/** Images belonging to a recipe card/microdata scope; cooking-step images are excluded. */
export function scopedRecipeImages(root: HtmlNode): WebsiteImage[] {
  const all = nodes(root, node => imageClutter(node) || (node !== root && tokens(node,'itemtype').some(t => t.endsWith('/Recipe'))));
  return all.flatMap(node => {
    const context = `${attr(node,'class')} ${attr(node,'id')} ${attr(node,'alt')}`;
    if (processPhoto.test(context)) return [];
    let ancestor = parent(node);
    while (ancestor && ancestor !== root) { if (/instruction|directions|ingredient|howto-step/i.test(`${attr(ancestor,'class')} ${attr(ancestor,'itemprop')}`)) return []; ancestor = parent(ancestor); }
    if (tag(node) === 'img') return variants(node, 'Recipe card photo', 112);
    if (tokens(node,'itemprop').some(p => ['image','contentUrl'].includes(p)) || tokens(node,'property').some(p => /(?:^|:)(image|contentUrl)$/.test(p))) {
      const url = attr(node,'content') || attr(node,'href') || attr(node,'resource');
      return url ? [{ url, reason: 'Recipe image property', score: 116 }] : [];
    }
    return [];
  }).slice(0, 80);
}
/** Rank page evidence, not image recognition. Ambiguous/unrelated images stay unselected. */
export function rankRecipeImages(document: HtmlNode, pageUrl: string, title: string, explicit: WebsiteImage[], soleRecipe: boolean): WebsiteImage[] {
  const all = nodes(document, imageClutter);
  const h1 = all.find(n => tag(n) === 'h1');
  const headingMatches = h1 && matches(title, textOf(h1));
  const meta = (name: string) => all.find(n => tag(n) === 'meta' && (attr(n,'property') || attr(n,'name')).toLowerCase() === name);
  const metaValue = (name: string) => { const node = meta(name); return node ? attr(node,'content') : ''; };
  const pageTitle = metaValue('og:title') || (h1 ? textOf(h1) : '');
  const isMain = !!headingMatches || (soleRecipe && (!pageTitle || matches(title,pageTitle)));
  const candidates = [...explicit];
  if (isMain) for (const name of ['og:image:secure_url','og:image','twitter:image','twitter:image:src']) {
    const url = metaValue(name); if (url) candidates.push({ url, reason: 'Featured page photo', score: 94, alt: metaValue(name.startsWith('og:') ? 'og:image:alt' : 'twitter:image:alt') });
  }
  let imageIndex = 0;
  for (const node of all) {
    if (tag(node) !== 'img' || imageIndex++ > 150) continue;
    const context = `${attr(node,'alt')} ${attr(node,'class')} ${attr(node,'id')}`;
    let inContent = false, blocked = false, scopedElsewhere = false, ancestor = parent(node);
    for (let depth = 0; ancestor && depth < 80; depth++, ancestor = parent(ancestor)) {
      const cls = `${attr(ancestor,'class')} ${attr(ancestor,'id')} ${attr(ancestor,'itemprop')}`;
      if (/instruction|directions|recipe-ingredient|howto-step/i.test(cls)) blocked = true;
      if (tokens(ancestor,'itemtype').some(v => v.endsWith('/Recipe')) || /(?:wprm-recipe-container|tasty-recipes|recipe-card)/.test(cls)) scopedElsewhere = true;
      if (/^(article|main)$/.test(tag(ancestor)) || /entry-content|post-content|articleBody/.test(cls)) inContent = true;
      if (tag(ancestor) === 'header' && !inContent && !/entry|post|article/.test(cls)) blocked = true;
    }
    if (blocked || scopedElsewhere || processPhoto.test(context)) continue;
    const related = matches(title, `${attr(node,'alt')} ${attr(node,'src')} ${attr(node,'data-src')}`);
    if (!isMain && !related) continue;
    const prominent = /hero|featured|post-thumbnail|entry-image/i.test(context);
    const score = (inContent ? 44 : 25) + (related ? 32 : 0) + (prominent ? 25 : 0) + (isMain && imageIndex <= 3 ? 26 - imageIndex * 2 : 0);
    if (score >= 66) candidates.push(...variants(node, related ? 'Photo matching the dish title' : 'Prominent article photo', score));
  }
  const best = new Map<string, WebsiteImage>();
  for (const candidate of candidates.slice(0, 400)) {
    const raw = candidate.url.trim();
    if (!raw || raw.startsWith('#')) continue;
    let url: URL;
    try { url = new URL(raw, pageUrl); } catch { continue; }
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || url.href.length > 2000) continue;
    url.hash = '';
    if (unwanted.test(`${url.hostname}${url.pathname} ${candidate.alt ?? ''}`) || processPhoto.test(`${url.pathname} ${candidate.alt ?? ''}`) || /\.(svg|gif|ico)(?:$|\?)/i.test(url.pathname)) continue;
    const { width: w, height: h } = candidate;
    if ((w && w < 200) || (h && h < 160) || (w && h && (w/h > 3.2 || h/w > 3.2))) continue;
    const quality = w ? Math.min(w, 1400) / 140 - Math.max(0, w - 2400) / 500 : 0;
    const ranked = { ...candidate, url: url.href, score: candidate.score + quality };
    if (ranked.score > (best.get(url.href)?.score ?? -1)) best.set(url.href, ranked);
  }
  return [...best.values()].sort((a,b) => b.score - a.score).slice(0, 6);
}
