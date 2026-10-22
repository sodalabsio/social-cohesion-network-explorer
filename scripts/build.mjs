import { mkdir, rm, copyFile, writeFile, lstat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { checkData, root } from './check-data.mjs';

try {
  await checkData();
  const dist = resolve(root, 'dist');
  if (dirname(dist) !== resolve(root)) throw new Error('Refusing to build outside the showcase folder');
  // Only this project's generated dist directory is replaced. No parent files are touched.
  await rm(dist, { recursive: true, force: true });
  await mkdir(resolve(dist, 'data'), { recursive: true });
  // An explicit allowlist prevents source archives, scripts or working data from entering the public site.
  for (const name of ['index.html', 'app.js', 'styles.css', 'timeline.js', 'timeline.css', 'data/showcase.json', 'data/network.json', 'data/timeline.json']) {
    const source = resolve(root, 'src', name);
    if (!(await lstat(source)).isFile()) throw new Error(`Build input is not an ordinary file: ${name}`);
    await copyFile(source, resolve(dist, name));
  }
  await writeFile(resolve(dist, '.nojekyll'), '');
  console.log('Static build ready in dist (9 public files; network metadata, weekly measures and curated excerpts only).');
} catch (error) {
  console.error(`Build failed: ${error.message}`);
  process.exitCode = 1;
}
