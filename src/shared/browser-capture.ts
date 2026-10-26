import { z } from 'zod';

export const MAX_CAPTURE_BYTES = 2 * 1024 * 1024;
export const browserCaptureSchema = z.object({
  format: z.literal('nibble-browser-recipe'), version: z.literal(1),
  url: z.string().max(2000).url().refine(value => {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  }, 'Use a recipe from an HTTPS webpage.'),
  title: z.string().max(300), capturedAt: z.string().datetime(),
  html: z.string().min(1).max(1000000),
}).strict();
export type BrowserCapture = z.infer<typeof browserCaptureSchema>;
export function readBrowserCapture(contents: string): BrowserCapture {
  if (new TextEncoder().encode(contents).length > MAX_CAPTURE_BYTES) throw new Error('This recipe file is too large (maximum 2 MB).');
  try { return browserCaptureSchema.parse(JSON.parse(contents)); }
  catch { throw new Error('Choose a .nibble-recipe.json file saved by the Nibble browser companion. This file is invalid or uses an unsupported version.'); }
}
