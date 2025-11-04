import fs from 'fs';
import path from 'path';
import { UPLOAD_DIR } from './imageService';
import { SVG_DIR } from './svgService';

export type CacheStats = {
  images: {
    count: number;
    totalSize: number;
  };
  svgs: {
    count: number;
    totalSize: number;
  };
  total: {
    count: number;
    totalSize: number;
  };
};

function getDirectoryStats(dirPath: string): { count: number; totalSize: number } {
  if (!fs.existsSync(dirPath)) {
    return { count: 0, totalSize: 0 };
  }

  try {
    const files = fs.readdirSync(dirPath);
    let count = 0;
    let totalSize = 0;

    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);
      if (stats.isFile()) {
        count++;
        totalSize += stats.size;
      }
    }

    return { count, totalSize };
  } catch (e) {
    return { count: 0, totalSize: 0 };
  }
}

export function getCacheStats(): CacheStats {
  const images = getDirectoryStats(UPLOAD_DIR);
  const svgs = getDirectoryStats(SVG_DIR);

  return {
    images,
    svgs,
    total: {
      count: images.count + svgs.count,
      totalSize: images.totalSize + svgs.totalSize,
    },
  };
}

function clearDirectory(dirPath: string): { deleted: number; errors: number } {
  if (!fs.existsSync(dirPath)) {
    return { deleted: 0, errors: 0 };
  }

  let deleted = 0;
  let errors = 0;

  try {
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      try {
        const filePath = path.join(dirPath, file);
        const stats = fs.statSync(filePath);
        if (stats.isFile()) {
          fs.unlinkSync(filePath);
          deleted++;
        }
      } catch (e) {
        errors++;
      }
    }
  } catch (e) {
    errors++;
  }

  return { deleted, errors };
}

export function clearCache(): { deleted: number; errors: number } {
  const imagesResult = clearDirectory(UPLOAD_DIR);
  const svgsResult = clearDirectory(SVG_DIR);

  return {
    deleted: imagesResult.deleted + svgsResult.deleted,
    errors: imagesResult.errors + svgsResult.errors,
  };
}
