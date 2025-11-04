/*
 Compare two images and generate a diff visualization.
 Usage: npm run diff-images -- <image1> <image2> [--output <diff.png>]
 
 Example:
   npm run diff-images -- debug/logs/figma-render.png debug/logs/html-render.png
   npm run diff-images -- debug/logs/figma-render.png debug/logs/html-render.png --output debug/logs/diff.png
*/

import fs from 'fs';
import path from 'path';
// @ts-ignore - pngjs has no types
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

type Args = {
  image1: string | null;
  image2: string | null;
  output: string | null;
  sizeTolerancePercent: number;
};

function parseArgs(argv: string[]): Args {
  let image1: string | null = null;
  let image2: string | null = null;
  let output: string | null = null;
  let sizeTolerancePercent = 2.5;

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--output' || arg === '-o') {
      output = argv[i + 1];
      i++;
    } else if (arg === '--size-tolerance-percent' || arg === '--max-size-delta-percent') {
      const v = argv[i + 1];
      sizeTolerancePercent = v ? Number(v) : sizeTolerancePercent;
      i++;
    } else if (!image1) {
      image1 = arg;
    } else if (!image2) {
      image2 = arg;
    }
  }

  return { image1, image2, output, sizeTolerancePercent };
}

function resolvePath(filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
}

function loadPng(filePath: string): PNG {
  const buffer = fs.readFileSync(filePath);
  return PNG.sync.read(buffer);
}

function savePng(png: PNG, filePath: string): void {
  const buffer = PNG.sync.write(png);
  fs.writeFileSync(filePath, buffer);
}

function resizeNearest(src: PNG, targetW: number, targetH: number): PNG {
  const dst = new PNG({ width: targetW, height: targetH });
  const sx = src.width / targetW;
  const sy = src.height / targetH;
  for (let y = 0; y < targetH; y++) {
    const syIdx = Math.min(src.height - 1, Math.max(0, Math.floor(y * sy)));
    for (let x = 0; x < targetW; x++) {
      const sxIdx = Math.min(src.width - 1, Math.max(0, Math.floor(x * sx)));
      const si = (syIdx * src.width + sxIdx) * 4;
      const di = (y * targetW + x) * 4;
      dst.data[di] = src.data[si];
      dst.data[di + 1] = src.data[si + 1];
      dst.data[di + 2] = src.data[si + 2];
      dst.data[di + 3] = src.data[si + 3];
    }
  }
  return dst;
}

async function main() {
  const args = parseArgs(process.argv);

  if (!args.image1 || !args.image2) {
    console.error('Usage: npm run diff-images -- <image1> <image2> [--output <diff.png>]');
    console.error('');
    console.error('Example:');
    console.error('  npm run diff-images -- debug/logs/figma-render.png debug/logs/html-render.png');
    console.error('  npm run diff-images -- img1.png img2.png --output diff.png');
    process.exit(1);
  }

  const path1 = resolvePath(args.image1);
  const path2 = resolvePath(args.image2);

  if (!fs.existsSync(path1)) {
    console.error(`Error: Image 1 not found: ${path1}`);
    process.exit(1);
  }

  if (!fs.existsSync(path2)) {
    console.error(`Error: Image 2 not found: ${path2}`);
    process.exit(1);
  }

  console.log('Loading images...');
  const img1 = loadPng(path1);
  const img2 = loadPng(path2);

  console.log(`Image 1: ${img1.width}x${img1.height}`);
  console.log(`Image 2: ${img2.width}x${img2.height}`);

  if (img1.width !== img2.width || img1.height !== img2.height) {
    const widthDiff = Math.abs(img1.width - img2.width);
    const heightDiff = Math.abs(img1.height - img2.height);
    const wPct = img1.width > 0 ? (widthDiff / img1.width) * 100 : 100;
    const hPct = img1.height > 0 ? (heightDiff / img1.height) * 100 : 100;
    if (wPct <= args.sizeTolerancePercent && hPct <= args.sizeTolerancePercent) {
      console.warn(`⚠️  Images have minor size difference (${widthDiff}x${heightDiff}px)`);
      console.warn('   Aligning by resizing Image 2 to match Image 1 for comparison...');
      const targetW = img1.width;
      const targetH = img1.height;
      const r2 = resizeNearest(img2, targetW, targetH);
      img2.data = r2.data; img2.width = targetW; img2.height = targetH;
      console.log(`   Resized Image 2 to: ${targetW}x${targetH}`);
      console.log('');
    } else {
      console.error('Error: Images have significantly different dimensions');
      console.error(`  Image 1: ${img1.width}x${img1.height}`);
      console.error(`  Image 2: ${img2.width}x${img2.height}`);
      console.error(`  Difference: ${widthDiff}x${heightDiff}px (Δw=${wPct.toFixed(2)}%, Δh=${hPct.toFixed(2)}%)`);
      process.exit(1);
    }
  }

  const { width, height } = img1;
  const diff = new PNG({ width, height });

  console.log('Comparing images...');
  const numDiffPixels = pixelmatch(
    img1.data,
    img2.data,
    diff.data,
    width,
    height,
    { threshold: 0.15 }
  );

  const totalPixels = width * height;
  const diffPercent = ((numDiffPixels / totalPixels) * 100).toFixed(2);

  console.log('');
  console.log('=== Comparison Result ===');
  console.log(`Total pixels:      ${totalPixels.toLocaleString()}`);
  console.log(`Different pixels:  ${numDiffPixels.toLocaleString()}`);
  console.log(`Difference:        ${diffPercent}%`);
  console.log('');

  if (numDiffPixels === 0) {
    console.log('✅ Images are identical!');
  } else if (parseFloat(diffPercent) < 0.01) {
    console.log('✅ Images are nearly identical (< 0.01% difference)');
  } else if (parseFloat(diffPercent) < 1) {
    console.log('⚠️  Images have minor differences (< 1%)');
  } else {
    console.log('❌ Images have significant differences');
  }

  const outputPath = args.output
    ? resolvePath(args.output)
    : path.join(path.dirname(path1), 'diff.png');

  console.log('');
  console.log(`Saving diff image to: ${outputPath}`);
  savePng(diff, outputPath);
  console.log('✅ Done!');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
