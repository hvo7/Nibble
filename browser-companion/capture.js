// Self-contained: Chrome serializes this function into the active tab's isolated world.
// It reads existing DOM only. No network requests, navigation, storage, cookies, or form values.
export function captureRecipePage() {
  const source = new URL(location.href);
  if (source.protocol !== 'https:' || source.username || source.password) throw new Error('Open the recipe on an HTTPS website first.');
  source.hash = '';
  // Avoid retaining tracking parameters or login tokens in the exported source link.
  for (const key of [...source.searchParams.keys()]) if (/^(utm_|fbclid|gclid|token|access_token|auth|session|code)/i.test(key)) source.searchParams.delete(key);
  const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const records = [], refs = new Map();
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    if ((script.textContent || '').length > 1000000) continue;
    try {
      const stack = [{ value: JSON.parse(script.textContent), depth: 0 }];
      while (stack.length && records.length < 20000) {
        const { value, depth } = stack.pop();
        if (!value || typeof value !== 'object' || depth > 24) continue;
        if (Array.isArray(value)) { for (const child of value) stack.push({ value: child, depth: depth + 1 }); continue; }
        records.push(value);
        if (typeof value['@id'] === 'string' && Object.keys(value).length > Object.keys(refs.get(value['@id']) || {}).length) refs.set(value['@id'], value);
        for (const [key, child] of Object.entries(value)) if (key !== '@context') stack.push({ value: child, depth: depth + 1 });
      }
    } catch { /* Malformed metadata does not prevent reading the visible recipe. */ }
  }
  const keys = new Set(['@type', 'name', 'description', 'recipeIngredient', 'recipeInstructions', 'recipeYield', 'nutrition', 'author', 'prepTime', 'cookTime', 'totalTime', 'itemListElement', 'text', 'item', 'value', 'unitText', 'unitCode', 'calories', 'proteinContent', 'carbohydrateContent', 'fatContent', 'servingSize']);
  let metadataVisits = 0, metadataSize = 0;
  function safeMetadata(value, depth = 0, seen = new Set()) {
    if (++metadataVisits > 20000) throw new Error('Recipe metadata is too complex. Use the print recipe view or screenshots.');
    if (depth > 20 || seen.has(value)) return undefined;
    if (typeof value === 'string' || typeof value === 'number') {
      metadataSize += String(value).length;
      if (metadataSize > 800000) throw new Error('Recipe metadata is too large. Use the print recipe view or screenshots.');
      return value;
    }
    if (!value || typeof value !== 'object') return undefined;
    const next = new Set(seen); next.add(value);
    if (Array.isArray(value)) return value.map(item => safeMetadata(item, depth + 1, next));
    const resolved = typeof value['@id'] === 'string' ? { ...(refs.get(value['@id']) || {}), ...value } : value;
    return Object.fromEntries(Object.entries(resolved).filter(([key]) => keys.has(key)).map(([key, child]) => [key, safeMetadata(child, depth + 1, next)]));
  }
  const structured = records.filter(value => [value['@type']].flat().some(type => typeof type === 'string' && type.split(/[\/#]/).pop() === 'Recipe')).slice(0, 20).map(value => safeMetadata(value));
  const cardSelector = '[itemtype$="/Recipe"],.wprm-recipe-container,.tasty-recipes,.easyrecipe,.mv-create-card,.recipe-card';
  const cards = [...document.querySelectorAll(cardSelector)].filter(node => !node.parentElement?.closest(cardSelector));
  const heading = [...document.querySelectorAll('h1,h2,h3,h4,strong,b')].find(node => /^ingredients\s*:?$/i.test(node.textContent.trim()));
  const root = heading?.closest('article,main,.entry-content,.post-content,.recipe-content,[itemprop="articleBody"],#recipe') || document.querySelector('article,main');
  // Never fall back to the entire body: account, message, and unrelated page content is not a recipe.
  const roots = cards.length ? cards : root && heading ? [root] : [];
  let visited = 0, size = 0;
  const omitted = /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|IFRAME|OBJECT|EMBED|FORM|INPUT|TEXTAREA|SELECT|BUTTON|NAV|FOOTER|ASIDE|SVG|IMG|VIDEO|AUDIO)$/;
  const clutter = /(?:^|[\s_-])(comments?|reply|newsletter|related|social|sharing|ratings?|reviews?|cookie|advertisement|sidebar|recommendations?)(?:$|[\s_-])/i;
  const kept = /^(H[1-6]|P|DIV|SECTION|ARTICLE|MAIN|UL|OL|LI|SPAN|STRONG|B|EM|I|BR|TABLE|TBODY|TR|TD|TH|DL|DT|DD)$/;
  function serialize(node, depth = 0) {
    if (++visited > 50000 || depth > 80) throw new Error('This page is too complex. Use its print recipe view or screenshots instead.');
    if (node.nodeType === Node.TEXT_NODE) { const value = escape(node.textContent || ''); size += value.length; if (size > 800000) throw new Error('This recipe is too large. Use its print recipe view.'); return value; }
    if (!(node instanceof Element) || omitted.test(node.tagName) || node.hasAttribute('hidden') || node.getAttribute('aria-hidden') === 'true' || node.hasAttribute('contenteditable') || clutter.test(`${node.id} ${node.className}`)) return '';
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return '';
    const parts = [];
    for (const child of node.childNodes) {
      if (child instanceof Element && /^H[1-6]$/.test(child.tagName) && /^(?:comments?|reviews?|leave a (?:comment|reply)|related recipes|you may also like|buy (?:this recipe.s )?ingredients)\b/i.test(child.textContent.trim())) break;
      parts.push(serialize(child, depth + 1));
    }
    const content = parts.join('');
    if (!kept.test(node.tagName)) return content;
    const tag = /^(STRONG|B)$/.test(node.tagName) && /^(ingredients?|directions?|instructions?|method|nutrition(?: facts)?)\s*:?$/i.test(node.textContent.trim()) ? 'h2' : node.tagName.toLowerCase();
    const attrs = ['class', 'itemprop', 'itemtype', 'itemscope'].filter(name => node.hasAttribute(name)).map(name => ` ${name}="${escape(node.getAttribute(name).slice(0, 1000))}"`).join('');
    return tag === 'br' ? '<br>' : `<${tag}${attrs}>${content}</${tag}>`;
  }
  const title = (document.querySelector('h1')?.textContent || document.title || '').trim().slice(0, 300);
  const metadata = structured.length ? `<script type="application/ld+json">${JSON.stringify(structured).replaceAll('<', '\\u003c')}</script>` : '';
  const html = `<html><head><title>${escape(title)}</title>${metadata}</head><body><h1>${escape(title)}</h1>${roots.map(node => serialize(node)).join('\n')}</body></html>`;
  if (!structured.length && !roots.length) throw new Error('No recipe card or ingredient section was found. Open the full recipe first, or use screenshots.');
  if (html.length > 1000000) throw new Error('This recipe is too large. Use its print recipe view.');
  return { format: 'nibble-browser-recipe', version: 1, url: source.href, title, capturedAt: new Date().toISOString(), html };
}
