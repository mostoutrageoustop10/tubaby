const fs = require('fs');
const path = require('path');

const sourceDir = 'C:\\Users\\gman\\Desktop\\ACCESSORIES';
const destDir = path.join(__dirname, 'public', 'images');

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

const files = fs.readdirSync(sourceDir);

let count = 0;
for (const file of files) {
  const sourcePath = path.join(sourceDir, file);
  const stat = fs.statSync(sourcePath);
  if (!stat.isFile()) continue;

  const ext = path.extname(file).toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'].includes(ext)) {
    const safeFileName = file
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9_.-]/g, "");

    const destPath = path.join(destDir, safeFileName);
    fs.copyFileSync(sourcePath, destPath);
    console.log(`Copied ${file} -> ${safeFileName}`);
    count++;
  }
}

console.log(`Done. Copied ${count} images.`);
