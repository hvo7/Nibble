import { parse, parseFragment, type DefaultTreeAdapterMap } from 'parse5';

export type HtmlNode = DefaultTreeAdapterMap['node'];
export const tag = (node: HtmlNode) => 'tagName' in node ? node.tagName : '';
export const children = (node: HtmlNode): HtmlNode[] => 'childNodes' in node ? node.childNodes : [];
export const attr = (node: HtmlNode, name: string) => 'attrs' in node ? node.attrs.find(a => a.name === name)?.value ?? '' : '';
export const tokens = (node: HtmlNode, name: string) => attr(node, name).split(/\s+/);
export const classes = (node: HtmlNode) => tokens(node, 'class');
export function clutter(node: HtmlNode): boolean {
  return /^(script|style|template|noscript|nav|footer|iframe|form|button|aside)$/.test(tag(node)) ||
    attr(node, 'aria-hidden') === 'true' || ('attrs' in node && node.attrs.some(a => a.name === 'hidden')) ||
    /(?:^|[\s_-])(comments?|reviews?|advertisement|social-share|related-recipes)(?:$|[\s_-])/.test(attr(node, 'class') + ' ' + attr(node, 'id'));
}
/** Iterative traversal bounds hostile/deep HTML without recursive stack growth. */
export function nodes(root: HtmlNode, skip: (node: HtmlNode) => boolean = () => false): HtmlNode[] {
  const result: HtmlNode[] = []; const stack = [root];
  while (stack.length && result.length < 100000) {
    const node = stack.pop()!;
    if (skip(node)) continue;
    result.push(node);
    const nested = children(node); for (let i = nested.length - 1; i >= 0; i--) stack.push(nested[i]);
  }
  return result;
}
export function textOf(root: HtmlNode, raw = false): string {
  if (raw) return nodes(root).map(node => node.nodeName === '#text' && 'value' in node ? node.value : '').join('');
  const text: string[] = [];
  for (const node of nodes(root, raw ? () => false : clutter)) {
    if (node.nodeName === '#text' && 'value' in node) text.push(node.value);
    else if (/^(p|li|div|section|h[1-6]|br|tr|dt|dd)$/.test(tag(node))) text.push('\n');
  }
  return text.join(' ').replace(/[^\S\n]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{2,}/g, '\n').trim();
}
export function clean(value: unknown, max = 20000): string {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  return typeof value === 'string' ? textOf(parseFragment(value.slice(0, max))).replace(/\s+/g, ' ').trim().slice(0, max) : '';
}
export function documentFor(html: string) {
  if (new TextEncoder().encode(html).byteLength > 4 * 1024 * 1024) throw new Error('This page is too large to parse safely.');
  return parse(html);
}
export const valueOf = (node: HtmlNode) => clean(attr(node, 'content') || attr(node, 'datetime') || textOf(node));
