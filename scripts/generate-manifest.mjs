import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Allow passing custom root audio folder via CLI arg, or fallback to auto-detection
const cliTarget = process.argv[2];
const candidates = [
  cliTarget,
  path.resolve(__dirname, '../Bibbia/Bibbia mp3 Interconfessionale - Copia'),
  path.resolve(__dirname, '../Bibbia'),
  path.resolve(process.cwd(), 'Bibbia/Bibbia mp3 Interconfessionale - Copia'),
  path.resolve(process.cwd(), 'Bibbia'),
  process.cwd()
].filter(Boolean);

let audioRoot = candidates.find((dir) => {
  try {
    if (!fs.existsSync(dir)) return false;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    return entries.some((e) => e.isDirectory() && /^\d{2}_/.test(e.name));
  } catch {
    return false;
  }
});

if (!audioRoot) {
  console.error('Error: Could not locate audio directory with 01_... to 66_... folders.');
  console.error('Usage: node scripts/generate-manifest.mjs <path-to-audio-folder>');
  process.exit(1);
}

console.log(`Scanning audio directory: ${audioRoot}`);

const publicDir = path.resolve(__dirname, '../public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

const entries = fs.readdirSync(audioRoot, { withFileTypes: true });
const bookDirs = entries
  .filter((e) => e.isDirectory() && /^\d{2}_/.test(e.name))
  .sort((a, b) => {
    const numA = parseInt(a.name.slice(0, 2), 10);
    const numB = parseInt(b.name.slice(0, 2), 10);
    return numA - numB;
  });

if (bookDirs.length === 0) {
  console.error('No book directories found matching format "XX_BookName".');
  process.exit(1);
}

const manifest = [];

for (const bookDir of bookDirs) {
  const folderName = bookDir.name;
  const id = folderName.slice(0, 2);
  const title = folderName.slice(3).trim();
  const dirPath = path.join(audioRoot, folderName);

  const fileEntries = fs.readdirSync(dirPath, { withFileTypes: true });
  const mp3Files = fileEntries
    .filter((f) => f.isFile() && f.name.toLowerCase().endsWith('.mp3'))
    .map((f) => f.name);

  // Extract chapter number or sort naturally
  const chapterList = mp3Files.map((filename) => {
    // Check for trailing number before .mp3 e.g. genesis_01.mp3, haggai02.mp3, sal_150.mp3
    const nameWithoutExt = filename.replace(/\.mp3$/i, '');
    const numMatch = nameWithoutExt.match(/(\d+)$/);
    const chapterNum = numMatch ? parseInt(numMatch[1], 10) : 1;
    return {
      chapter: chapterNum,
      file: filename
    };
  });

  // Sort chapters numerically by chapter number
  chapterList.sort((a, b) => a.chapter - b.chapter);

  // Handle single-chapter books or edge cases where multiple files might lack numbering
  if (chapterList.length === 1 && !chapterList[0].chapter) {
    chapterList[0].chapter = 1;
  }

  manifest.push({
    id,
    title,
    folder: folderName,
    chapters: chapterList
  });
}

const outputPath = path.join(publicDir, 'manifest.json');
fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2), 'utf-8');

console.log(`Successfully generated manifest with ${manifest.length} books at ${outputPath}`);
let totalChapters = 0;
manifest.forEach(b => { totalChapters += b.chapters.length; });
console.log(`Total chapters indexed: ${totalChapters}`);
