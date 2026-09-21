// Validation-only "build" step.
//
// نبضة DJ is a self-contained, dependency-free static app: every Auto DJ /
// DSP feature runs client-side in the browser inside index.html. There is
// nothing to bundle or transpile, so this script's job is not to transform
// anything — it's to catch a broken index.html *before* it ever reaches
// production, using the same syntax check used throughout development.
const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'index.html');

if (!fs.existsSync(indexPath)) {
  console.error('BUILD FAILED: index.html not found at repo root.');
  process.exit(1);
}

const html = fs.readFileSync(indexPath, 'utf8');

if (html.trim().length === 0) {
  console.error('BUILD FAILED: index.html is empty.');
  process.exit(1);
}

// Extract every inline <script>...</script> block (there are no external
// script files — everything is inlined) and syntax-check each one.
const scriptBlocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);

if (scriptBlocks.length === 0) {
  console.error('BUILD FAILED: no inline <script> block found in index.html.');
  process.exit(1);
}

let ok = true;
scriptBlocks.forEach((code, i) => {
  try {
    // eslint-disable-next-line no-new-func
    new Function(code);
  } catch (err) {
    ok = false;
    console.error(`BUILD FAILED: syntax error in <script> block #${i + 1}: ${err.message}`);
  }
});

if (!ok) process.exit(1);

console.log(
  `Build check passed: index.html is present (${(html.length / 1024).toFixed(1)} KB) and ${scriptBlocks.length} inline script block(s) parse cleanly.`
);
console.log('This is a static, dependency-free app — no bundling step is needed; index.html is served as-is.');
