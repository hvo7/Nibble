import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { isUtf8 } from 'node:buffer';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Run this from the normal Windows session. It does not alter build/data folders,
// force-push, rewrite existing commits, or bypass Git authentication/permissions.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const remote = 'https://github.com/hvo7/Nibble.git';
const tag = 'v1.0.0';
function git(args, allowFailure = false) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) throw new Error(result.stderr.trim() || `git ${args[0]} failed (${result.status}).`);
  return { code: result.status, text: result.stdout.trim(), error: result.stderr.trim() };
}
function publish() {
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (pkg.version !== '1.0.0') throw new Error('This publisher is only for the reviewed 1.0.0 source.');
  const inventory = JSON.parse(readFileSync(path.join(root, 'scripts/release-1.0.0-files.json'), 'utf8'));
  if (!Array.isArray(inventory) || inventory.length < 50 || new Set(inventory.map(entry => entry.path)).size !== inventory.length) throw new Error('Invalid release source manifest.');
  for (const entry of inventory) {
    if (typeof entry.path !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256) || entry.path.includes('\\') || entry.path.split('/').includes('..')) throw new Error('Invalid source-manifest entry.');
    const target = path.resolve(root, entry.path);
    if (!target.startsWith(root + path.sep) || /^(?:\.git(?:\/|$)|node_modules\/|dist(?:-electron)?\/|release\/|\.nibble-)/.test(entry.path)) throw new Error('Unexpected source-manifest path.');
    const bytes = readFileSync(target);
    // Git can normalize text line endings during add/checkout. Hash the same text
    // on either platform while retaining exact bytes for binary assets.
    const canonical = !bytes.includes(0) && isUtf8(bytes) ? Buffer.from(bytes.toString('utf8').replaceAll('\r\n', '\n')) : bytes;
    const digest = createHash('sha256').update(canonical).digest('hex');
    if (digest !== entry.sha256) throw new Error(`Source changed after release checks: ${entry.path}. Review it before publishing.`);
  }
  if (process.argv.includes('--check')) {
    console.log(`Verified ${inventory.length} prepared source files. No Git state was changed.`);
    return;
  }
  if (!existsSync(path.join(root, '.git'))) git(['init', '-b', 'main', '.']);
  if (path.resolve(git(['rev-parse', '--show-toplevel']).text).toLowerCase() !== root.toLowerCase()) throw new Error('This folder must have its own Git repository.');
  const origin = git(['remote', 'get-url', 'origin'], true);
  if (origin.code !== 0) git(['remote', 'add', 'origin', remote]);
  else if (origin.text.replace(/\/$/, '') !== remote) throw new Error('origin points somewhere else. Existing remote was preserved.');
  if (git(['symbolic-ref', '--short', 'HEAD']).text !== 'main') throw new Error('Switch to main before publishing this release.');
  if (!git(['config', 'user.name']).text || !git(['config', 'user.email']).text) throw new Error('Configure your Git author name and email first.');

  console.log('Checking hvo7/Nibble and preserving its existing history...');
  const refs = git(['ls-remote', '--heads', 'origin']).text;
  if (refs && !refs.split('\n').some(line => line.endsWith('\trefs/heads/main'))) throw new Error('Remote has another branch layout. No history was replaced.');
  const localHead = git(['rev-parse', '--verify', 'HEAD'], true);
  if (refs) {
    git(['fetch', 'origin', 'main']);
    if (localHead.code !== 0) {
      if (git(['rev-parse', 'origin/main']).text !== '02a18c51f91e037ca9fab5b70e2153b925f93be4') throw new Error('Remote main changed since release preparation. Review it before publishing.');
      if (git(['diff', '--cached', '--name-only']).text) throw new Error('The unborn repository already has staged files. Review the index before attaching remote history.');
      // Only an unborn local repository can be attached this way. --mixed updates
      // HEAD/index, leaving every working source file in place.
      const remotePaths = git(['ls-tree', '-r', '--name-only', 'origin/main']).text.split('\n');
      if (remotePaths.some(name => !['README.md', 'LICENSE'].includes(name))) throw new Error('Remote now contains application files. Integrate those changes before publishing.');
      const remoteLicense = git(['show', 'origin/main:LICENSE']).text;
      const localLicense = readFileSync(path.join(root, 'LICENSE'), 'utf8').trim();
      if (remoteLicense.replaceAll('\r\n', '\n') !== localLicense.replaceAll('\r\n', '\n')) throw new Error('The remote license changed. Review it before publishing.');
      git(['reset', '--mixed', 'origin/main']);
    } else if (git(['merge-base', '--is-ancestor', 'origin/main', 'HEAD'], true).code !== 0) {
      throw new Error('Remote main advanced or has unrelated history. No force-push will be used.');
    }
  }
  const stagePaths = inventory.map(entry => entry.path).concat('scripts/release-1.0.0-files.json');
  for (let i = 0; i < stagePaths.length; i += 30) git(['add', '--', ...stagePaths.slice(i, i + 30)]);
  const staged = git(['diff', '--cached', '--name-only']).text.split('\n').filter(Boolean);
  if (staged.some(name => !stagePaths.includes(name))) throw new Error('Other staged files are present. Review the Git index before publishing.');
  if (staged.length) git(['commit', '-m', 'Release Nibble v1.0.0']);
  const head = git(['rev-parse', 'HEAD']).text;
  const existingTag = git(['rev-parse', '--verify', `${tag}^{commit}`], true);
  if (existingTag.code === 0 && existingTag.text !== head) throw new Error('v1.0.0 already points to another commit. It was not changed.');
  if (existingTag.code !== 0) git(['tag', '-a', tag, '-m', 'Nibble 1.0.0 - initial application release']);
  console.log('Pushing main and v1.0.0 together; Git may request your GitHub sign-in.');
  git(['push', '--atomic', '-u', 'origin', 'HEAD:refs/heads/main', 'refs/tags/v1.0.0']);
  const pushed = git(['ls-remote', 'origin', 'refs/heads/main', 'refs/tags/v1.0.0^{}']).text;
  const lines = pushed.split('\n');
  if (!lines.some(line => line === `${head}\trefs/heads/main`) || !lines.some(line => line === `${head}\trefs/tags/v1.0.0^{}`)) throw new Error('Push returned but remote commit/tag verification did not match.');
  console.log(`Published and verified: https://github.com/hvo7/Nibble/tree/${tag}`);
  console.log(`Commit: ${head}`);
  try {
    mkdirSync(path.join(root, '.nibble-runtime'), { recursive: true });
    writeFileSync(path.join(root, '.nibble-runtime', 'publish-1.0.0.txt'), `Published ${new Date().toISOString()}\nCommit ${head}\n${remote}\n`, { flag: 'w' });
  } catch (error) { console.warn('Published successfully, but could not write the local receipt: ' + error.message); }
}
try { publish(); } catch (error) { console.error(error.message); process.exitCode = 1; }
