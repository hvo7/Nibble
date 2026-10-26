# Website recipe imports

This implementation is a staging candidate. It has not replaced the existing desktop build.

## Extraction contract

`electron/website.ts` converts bounded HTML into separate recipe drafts and preserved source evidence. It does not execute scripts, retrieve remote JSON-LD contexts, log in, solve access challenges, or infer a recipe from an access-denied page.

Extraction order:

1. Recipe JSON-LD, including arrays, `@graph`, local `@id` references, instruction sections, and structured ingredients.
2. Recipe-scoped Microdata and RDFa. Nested author/nutrition scopes cannot supply the recipe's title.
3. Common recipe-card markup: WP Recipe Maker, Tasty Recipes, EasyRecipe, and supported Create/generic card classes. These are best-effort adapters, not guarantees for every plugin version or theme.
4. Main/article text with explicit ingredient and instruction headings. Navigation, comments, related recipes, and scripts are excluded.

Matching page representations fill absent fields; the importer does not concatenate competing ingredient lists. Different structured recipes remain choices. A same-title structured variant with different ingredients remains separate. Duplicate representations preserve their source records for comparison.

The parser bounds HTML size, traversal, graph depth, candidate count, field lengths, and ingredient/instruction counts. Empty or unrecognized pages become incomplete review drafts with a paste/screenshot fallback. An unrecognized website is not sent to local AI as recipe evidence; explicitly supplied text/media can still use the existing local organizer.

## Servings and yield

- `servings`: a positive serving count when explicitly recognized; ranges stay unknown.
- `yieldText`: original yield statements, including units such as cookies, bowls, or loaves.
- `servingSize`: original portion description, such as `1 bowl (300 g)`.
- Structured yield units are preserved. Twelve cookies are not assumed to be twelve servings.
- Conflicting serving counts produce a review decision. Choosing **Leave unknown** is supported.

`websiteImport.sources` records extraction method, field, and raw values. `websiteImport.conflicts` retains alternatives and resolution status. Unresolved conflicts are rejected by both the editor and SQLite save boundary. Resolving them never deletes the alternatives.

## Nutrition

Published calories, protein, carbohydrate, and fat are stored separately from ingredient estimates. Supported explicit units include kcal/kJ and g/mg/kg. Unknown, negative, range, inequality, and ambiguous decimal-comma values are not silently converted into exact amounts. Clear thousands separators are supported.

The basis is **per serving**, **per 100 g**, **whole recipe**, or **unknown**. A recipe's serving count alone does not establish the nutrition basis. A published serving-size field or explicit basis label is required. Conflicting nutrition records remain unselected until reviewed.

Published nutrition retains its original serving count and portion description. Switching the display between per-serving and whole-recipe uses that original count. Scaling or repartitioning the user's recipe does not rewrite the author's published values. Per-100g nutrition is not converted into recipe totals without a known recipe weight.

Optional estimates use the existing free USDA FoodData Central integration. The user enters their own key in Settings. Requests carry the key in a header; the key is encrypted by Electron safeStorage and is excluded from backups. The UI requires a food match and a usable weight for each included ingredient. Raw/cooked, drained/undrained, branded/generic, and edible-weight choices remain the user's responsibility. No AI-generated macros are accepted.

Nutrient amounts are calculated from confirmed grams and food nutrients per 100 g. Volume is never assumed to equal mass. Missing matches, weights, or individual nutrients produce a clearly labeled partial estimate; missing values remain null. Food records are cached. Rate limits, wrong records, malformed responses, unsupported units, and bounded response sizes are handled without silently substituting another food.

## Network boundary

`electron/network.ts` accepts public HTTPS URLs without credentials/custom ports. Each redirect repeats DNS validation, all returned addresses must be public, and the connection is pinned to the validated address. Private, loopback, link-local, and reserved addresses are blocked.

The entire operation has a 30-second deadline, sockets have a 15-second inactivity timeout, and redirects are limited to four. HTML/XHTML only; both compressed and decoded bodies are limited to 4 MiB. Gzip, deflate, and Brotli are supported. Character encoding comes from HTTP headers or an early HTML charset declaration, with UTF-8 as the fallback. Cancellation also stops waiting for DNS.

## Compatibility and tests

New fields use validation defaults. Existing JSON recipes are normalized when read; no destructive SQL migration is required. Existing production builds and data are not touched by staging.

The test suite uses authored fixtures and mocked remote responses, with real SQLite persistence and restart checks. Fixtures cover structured metadata, local references, recipe cards, RDFa/Microdata, page-text fallback, duplicate/multiple recipes, conflicts, units, missing values, malformed input, redirects, compression, cancellation, USDA caching/rate limits, and legacy records.

Live imports still depend on a site's accessibility and markup. Client-rendered recipes, unusual widgets, ambiguous locales, and blocked pages may require pasted text or screenshots. A successful fixture suite does not establish compatibility with every website.

Primary references: [Schema.org Recipe](https://schema.org/Recipe), [NutritionInformation](https://schema.org/NutritionInformation), and [USDA API guide](https://fdc.nal.usda.gov/api-guide/).
