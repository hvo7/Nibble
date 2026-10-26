import { describe, expect, it } from 'vitest';
import { extractWebsite } from '../electron/website';
import { singleImportDraft } from '../src/shared/import-draft';
import { uid, recipeSchema } from '../src/shared/model';
import { sourceRecipe, jsonLd } from './fixtures/website';
const url = 'https://example.com/recipes/carrot-ginger-soup';
const parse = (html: string) => extractWebsite(html, url, uid());
const choices = (html: string) => { const data = parse(html); return data.images[data.recipes[0].id]; };
const body = '<h2>Ingredients</h2><ul><li>200 g carrots</li></ul><h2>Instructions</h2><p>Simmer.</p>';

describe('Dish photo selection', () => {
  it('uses the selected recipe image instead of page logos or related dishes', () => {
    const result = parse(`<meta property="og:image" content="/site-logo.png">${jsonLd([
      { ...sourceRecipe, image: '/photos/soup.jpg' },
      { ...sourceRecipe, name: 'Banana bread', image: '/photos/bread.jpg', recipeIngredient: Array.from({length:20},(_,i)=>`${i+1} g flour`) },
      { '@type': 'Organization', image: '/brand.jpg', logo: '/logo.jpg' }
    ])}`);
    const [main] = singleImportDraft(result.recipes, 'Carrot ginger soup');
    expect(result.images[main.id][0].url).toBe('https://example.com/photos/soup.jpg');
    expect(result.images[main.id].some(p=>/bread|brand|logo/.test(p.url))).toBe(false);
    expect(recipeSchema.safeParse(main).success).toBe(true);
  });
  it('resolves local ImageObject references and chooses a usable image over thumbnails', () => {
    const html = jsonLd({ '@graph': [
      { ...sourceRecipe, image: [{ '@id': '#tiny' }, { '@id': '#dish' }] },
      { '@id': '#tiny', '@type': 'ImageObject', url: '/tiny.jpg', width: 80, height: 80 },
      { '@id': '#dish', '@type': 'ImageObject', contentUrl: '//cdn.example.com/dish.webp?sig=a%2Bb', width: 1200, height: 900 }
    ] });
    expect(choices(html)[0]).toMatchObject({ url: 'https://cdn.example.com/dish.webp?sig=a%2Bb', reason: 'Recipe metadata' });
    expect(choices(html)).toHaveLength(1);
  });
  it('reads recipe microdata and skips nested recommendations and method photos', () => {
    const html = `<main itemscope itemtype="https://schema.org/Recipe"><h1 itemprop="name">Carrot soup</h1><div itemprop="image" itemscope itemtype="https://schema.org/ImageObject"><meta itemprop="contentUrl" content="/soup.jpg"></div><p itemprop="recipeIngredient">200 g carrots</p><div class="recipe-instructions"><img src="/chopping.jpg"></div><div class="related-recipes"><img src="/cake.jpg"></div></main>`;
    expect(choices(html).map(p=>p.url)).toEqual(['https://example.com/soup.jpg']);
  });
  it('uses recipe-card lazy loading and responsive images, excluding tiny placeholders', () => {
    const html = `<div class="wprm-recipe-container"><h2 class="wprm-recipe-name">Carrot soup</h2><img src="/placeholder.png" data-src="/soup.jpg" data-srcset="/small.jpg 80w, /medium.jpg 600w, /large.jpg 1200w" width="600" height="400"><p class="wprm-recipe-ingredient">200 g carrots</p></div>`;
    expect(choices(html)[0].url).toBe('https://example.com/large.jpg');
    expect(choices(html).some(p=>/placeholder|small/.test(p.url))).toBe(false);
  });
  it('reads picture sources and does not rewrite CDN parameters', () => {
    const html = `<article><h1>Carrot soup</h1><picture><source srcset="/carrot-soup.webp?w=1200&amp;token=xyz 1200w"><img src="/carrot-soup.jpg" width="600" height="400" alt="Carrot soup"></picture>${body}</article>`;
    expect(choices(html)[0].url).toBe('https://example.com/carrot-soup.webp?w=1200&token=xyz');
  });
  it('uses a featured image when the recipe has no explicit image', () => {
    const html = `<meta property="og:title" content="Carrot &amp; ginger soup"><meta property="og:image" content="/featured.jpg">${jsonLd(sourceRecipe)}`;
    expect(choices(html)[0]).toMatchObject({ url: 'https://example.com/featured.jpg', reason: 'Featured page photo' });
  });
  it('finds a prominent article photo near the heading without structured metadata', () => {
    const html = `<header><img src="/logo.jpg"></header><article><h1>Carrot soup</h1><img class="featured-image" src="/dinner.jpg" width="1200" height="900">${body}</article><aside><img src="/related.jpg"></aside>`;
    expect(choices(html)[0].url).toBe('https://example.com/dinner.jpg');
  });
  it('leaves logos, portraits, ads, icons, steps and unrelated recommendations unselected', () => {
    const html = `${jsonLd(sourceRecipe)}<header><img src="/logo.jpg"></header><aside><img src="/carrot-soup.jpg"></aside><article><h1>Carrot &amp; ginger soup</h1><div class="author-profile"><img src="/portrait.jpg"></div><img src="/pixel.png" width="1" height="1"><img src="/soup-step-1.jpg" alt="Carrot soup step 1"><div class="advertisement"><img src="/product.jpg"></div><div class="related-recipes"><img src="/soup.jpg"></div></article>`;
    expect(choices(html)).toHaveLength(0);
  });
  it('does not give another recipe the main page image on multi-recipe pages', () => {
    const result = parse(`<meta property="og:title" content="Carrot ginger soup"><meta property="og:image" content="/soup.jpg">${jsonLd([sourceRecipe,{...sourceRecipe,name:'Banana bread',recipeIngredient:['1 banana']}])}`);
    const bread = result.recipes.find(r=>r.title==='Banana bread')!;
    expect(result.images[bread.id]).toEqual([]);
  });
  it('rejects executable/local/credentialed URLs and extreme image shapes', () => {
    const image = ['javascript:alert(1)','file:///private.png','data:image/png;base64,abc','http://example.com/soup.jpg','https://u:p@example.com/x.jpg','https://example.com:8080/x.jpg','#photo',{url:'/wide.jpg',width:1400,height:200},{url:'/tiny.jpg',width:100,height:100},'/vector.svg'];
    expect(choices(jsonLd({...sourceRecipe,image}))).toEqual([]);
  });
  it('resolves relative photos against the final page URL and ignores HTML base injection', () => {
    expect(choices(`<base href="https://other.example/">${jsonLd({...sourceRecipe,image:'soup.jpg'})}`)[0].url).toBe('https://example.com/recipes/soup.jpg');
  });
  it('bounds cyclic, oversized image lists and repeated duplicate URLs', () => {
    const image = [...Array(60).fill('/soup.jpg'), {'@id':'#cycle'}];
    expect(choices(jsonLd({'@graph':[{...sourceRecipe,image},{'@id':'#cycle',image:{'@id':'#cycle'}}]}))).toHaveLength(1);
  });
});

it('does not mistake lazy placeholder dimensions for the full dish photo',()=>{
  const html=`<div class="recipe-card"><h2>Carrot soup</h2><img src="data:image/gif;base64,AA" width="1" height="1" data-lazy-src="/carrot-soup.jpg"><ul class="ingredients"><li>1 carrot</li></ul></div>`;
  expect(choices(html)[0].url).toBe('https://example.com/carrot-soup.jpg');
});
