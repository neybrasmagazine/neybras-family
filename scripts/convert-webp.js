// One-off: convert images/content/**/*.{jpg,png} to WebP for smaller page weight.
// Originals are kept on disk (harmless, just unreferenced) in case of rollback.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..', 'images', 'content');

function walk(dir) {
  let files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files = files.concat(walk(full));
    else if (/\.(jpe?g|png)$/i.test(entry.name)) files.push(full);
  }
  return files;
}

async function main() {
  const files = walk(ROOT);
  let totalBefore = 0, totalAfter = 0;
  for (const file of files) {
    const before = fs.statSync(file).size;
    const out = file.replace(/\.(jpe?g|png)$/i, '.webp');
    await sharp(file).webp({ quality: 80 }).toFile(out);
    const after = fs.statSync(out).size;
    totalBefore += before;
    totalAfter += after;
    console.log(path.basename(file), (before / 1024).toFixed(0) + 'KB', '->', (after / 1024).toFixed(0) + 'KB');
  }
  console.log(`\nTotal: ${(totalBefore / 1024 / 1024).toFixed(2)}MB -> ${(totalAfter / 1024 / 1024).toFixed(2)}MB`);
}

main();
