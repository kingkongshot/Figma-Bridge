// 混合策略（方案 A）：
// 阶段 1：纯正则处理 - 数值归一化、矩阵分解、CSS 简写（无序列化问题）
// 阶段 2：DOM 操作 - 仅针对复杂场景，只返回 body.innerHTML（避免完整序列化）
// 当前启用：阶段 1（正则已覆盖大部分需求）

export type NormalizeHtmlOptions = { mode?: 'dev-readable' | 'minify' };

export type NormalizeHtmlReport = {
  steps: string[];
  warnings: string[];
  changed: boolean;
  stats: {
    elementsProcessed: number;
    valuesNormalized: number;
  };
};

// 注意：本文件专注于对字符串中的数值进行归一化，
// 不维护任何属性白名单，避免死代码与重复逻辑。

// 单值归一化辅助：提供给正则回调与矩阵分解使用

function normalizeSingleAngle(angle: number): string {
  let a = angle;
  a = ((a % 360) + 360) % 360;
  if (Math.abs(a) < 1e-10) return '0deg';
  const rounded = Math.round(a);
  if (Math.abs(a - rounded) < 1e-3) return `${rounded}deg`;
  const fixed = parseFloat(a.toFixed(2));
  return `${fixed}deg`;
}

// 分解矩阵为 TRS（仅处理简单可识别的模式）
// 返回分解后的值，如果无法分解返回原 matrix 字符串
function decomposeMatrix(a: number, b: number, c: number, d: number, e: number, f: number): string {
  const EPSILON = 1e-6;
  const isClose = (x: number, target: number) => Math.abs(x - target) < EPSILON;

  if (isIdentityMatrix(a, b, c, d, e, f, isClose)) return '';

  const t = tryDecomposeAsTranslation(a, b, c, d, e, f, isClose);
  if (t) return t;

  const s = tryDecomposeAsUniformScale(a, b, c, d, e, f, isClose);
  if (s) return s;

  const r = tryDecomposeAsRotation(a, b, c, d, e, f, isClose);
  if (r) return r;

  const rs = tryDecomposeAsRotationScale(a, b, c, d, e, f, isClose, EPSILON);
  if (rs) return rs;

  return fallbackMatrix(a, b, c, d, e, f);
}

function isIdentityMatrix(a: number, b: number, c: number, d: number, e: number, f: number, isClose: (x:number,t:number)=>boolean): boolean {
  return isClose(a, 1) && isClose(b, 0) && isClose(c, 0) && isClose(d, 1) && isClose(e, 0) && isClose(f, 0);
}

function tryDecomposeAsTranslation(a: number, b: number, c: number, d: number, e: number, f: number, isClose: (x:number,t:number)=>boolean): string | null {
  if (isClose(a, 1) && isClose(b, 0) && isClose(c, 0) && isClose(d, 1)) {
    const txStr = normalizeSingleLength(e);
    const tyStr = normalizeSingleLength(f);
    if (txStr === '0' && tyStr === '0') return '';
    return `translate(${txStr}, ${tyStr})`;
  }
  return null;
}

function tryDecomposeAsUniformScale(a: number, b: number, c: number, d: number, e: number, f: number, isClose: (x:number,t:number)=>boolean): string | null {
  if (isClose(b, 0) && isClose(c, 0) && isClose(a, d) && a > 0) {
    const scale = a;
    const txStr = normalizeSingleLength(e);
    const tyStr = normalizeSingleLength(f);
    if (isClose(scale, 1)) {
      if (txStr === '0' && tyStr === '0') return '';
      return `translate(${txStr}, ${tyStr})`;
    }
    const scaleStr = normalizeScaleValue(scale);
    if (txStr === '0' && tyStr === '0') return `scale(${scaleStr})`;
    return `translate(${txStr}, ${tyStr}) scale(${scaleStr})`;
  }
  return null;
}

function tryDecomposeAsRotation(a: number, b: number, c: number, d: number, e: number, f: number, isClose: (x:number,t:number)=>boolean): string | null {
  if (isClose(a, d) && isClose(b, -c)) {
    const cos = a;
    const sin = b;
    const magnitude = cos * cos + sin * sin;
    if (isClose(magnitude, 1)) {
      const angleDegRaw = Math.atan2(sin, cos) * (180 / Math.PI);
      let angleDeg = angleDegRaw;
      while (angleDeg > 180) angleDeg -= 360;
      while (angleDeg <= -180) angleDeg += 360;
      const roundedAngle = Math.round(angleDeg);
      if (Math.abs(angleDeg - roundedAngle) < 1e-3) angleDeg = roundedAngle; else angleDeg = parseFloat(angleDeg.toFixed(2));
      const txStr = normalizeSingleLength(e);
      const tyStr = normalizeSingleLength(f);
      if (isClose(angleDeg, 0)) {
        if (txStr === '0' && tyStr === '0') return '';
        return `translate(${txStr}, ${tyStr})`;
      }
      if (txStr === '0' && tyStr === '0') return `rotate(${angleDeg}deg)`;
      return `translate(${txStr}, ${tyStr}) rotate(${angleDeg}deg)`;
    }
  }
  return null;
}

function tryDecomposeAsRotationScale(a: number, b: number, c: number, d: number, e: number, f: number, isClose: (x:number,t:number)=>boolean, EPSILON: number): string | null {
  if (isClose(a, d) && isClose(b, -c)) {
    const cos = a;
    const sin = b;
    const magnitude = Math.sqrt(cos * cos + sin * sin);
    const scale = magnitude;
    if (scale > EPSILON && !isClose(scale, 1)) {
      const normCos = cos / scale;
      const normSin = sin / scale;
      const normMag = normCos * normCos + normSin * normSin;
      if (isClose(normMag, 1)) {
        const angleRad = Math.atan2(normSin, normCos);
        let angleDeg = angleRad * (180 / Math.PI);
        while (angleDeg > 180) angleDeg -= 360;
        while (angleDeg <= -180) angleDeg += 360;
        const roundedAngle = Math.round(angleDeg);
        if (Math.abs(angleDeg - roundedAngle) < 1e-3) angleDeg = roundedAngle; else angleDeg = parseFloat(angleDeg.toFixed(2));
        const txStr = normalizeSingleLength(e);
        const tyStr = normalizeSingleLength(f);
        const scaleStr = normalizeScaleValue(scale);
        const parts: string[] = [];
        if (txStr !== '0' || tyStr !== '0') parts.push(`translate(${txStr}, ${tyStr})`);
        if (!isClose(angleDeg, 0)) parts.push(`rotate(${angleDeg}deg)`);
        parts.push(`scale(${scaleStr})`);
        if (parts.length === 0) return '';
        return parts.join(' ');
      }
    }
  }
  return null;
}

function fallbackMatrix(a: number, b: number, c: number, d: number, e: number, f: number): string {
  const an = normalizeScaleValue(a);
  const bn = normalizeScaleValue(b);
  const cn = normalizeScaleValue(c);
  const dn = normalizeScaleValue(d);
  const en = normalizeSingleLength(e).replace('px', '');
  const fn = normalizeSingleLength(f).replace('px', '');
  return `matrix(${an},${bn},${cn},${dn},${en},${fn})`;
}

// 归一化单个长度数值（返回带 px 的字符串或 '0'）
function normalizeSingleLength(value: number): string {
  if (Math.abs(value) < 1e-10) return '0';
  
  const rounded = Math.round(value);
  if (Math.abs(value - rounded) < 1e-3) return `${rounded}px`;
  
  const fixed = parseFloat(value.toFixed(3));
  return `${fixed}px`;
}

// 归一化缩放值
function normalizeScaleValue(value: number): string {
  const rounded = Math.round(value);
  if (Math.abs(value - rounded) < 1e-3) return `${rounded}`;
  
  const fixed = parseFloat(value.toFixed(3));
  return `${fixed}`;
}

// 归一化 CSS 文本（用于 <style> 标签内容）
// 删除未使用的 normalizeCssText，避免重复实现与死代码。

export function normalizeHtml(html: string, opts: NormalizeHtmlOptions = {}) {
  const report: NormalizeHtmlReport = {
    steps: [],
    warnings: [],
    changed: false,
    stats: {
      elementsProcessed: 0,
      valuesNormalized: 0,
    },
  };

  // 仅在 CSS 上下文内做数值归一化，禁止修改 class 名称等非 CSS 文本
  try {
    let result = html;
    let totalChanges = 0;
    let elementsProcessed = 0;

    function normalizeCssBlob(css: string): { text: string; changes: number } {
      let changes = 0;
      let text = css;

      // px 值
      text = text.replace(/(-?\d+\.?\d*)px/g, (m, numStr) => {
        const after = normalizeSingleLength(parseFloat(numStr));
        if (after !== m) changes++;
        return after;
      });

      // deg 值
      text = text.replace(/(-?\d+\.?\d*)deg/g, (m, numStr) => {
        const after = normalizeSingleAngle(parseFloat(numStr));
        if (after !== m) changes++;
        return after;
      });

      // matrix() 分解
      text = text.replace(/matrix\(([^)]+)\)/g, (match, params) => {
        const nums = params.split(',').map((s: string) => parseFloat(s.trim()));
        if (nums.length !== 6 || nums.some(isNaN)) return match;
        const [a, b, c, d, e, f] = nums;
        const decomposed = decomposeMatrix(a, b, c, d, e, f);
        if (decomposed !== match) {
          changes++;
          return decomposed;
        }
        return match;
      });

      // 四值缩写（仅 CSS 文本）
      text = text.replace(
        /(padding|margin|border-radius):\s*([^\s;]+)\s+\2\s+\2\s+\2/g,
        (_match, prop, value) => {
          changes++;
          return `${prop}: ${value}`;
        }
      );

      // 清理空声明
      const before = text;
      text = text.replace(/[a-z-]+:\s*;/g, '');
      if (text !== before) changes++;

      return { text, changes };
    }

    // 1) 处理 style="..."（双引号）
    result = result.replace(/style="([^"]*)"/g, (m, styleText) => {
      const { text, changes } = normalizeCssBlob(styleText);
      if (changes) {
        totalChanges += changes;
        elementsProcessed++;
      }
      return `style="${text}"`;
    });

    // 2) 处理 style='...'
    result = result.replace(/style='([^']*)'/g, (m, styleText) => {
      const { text, changes } = normalizeCssBlob(styleText);
      if (changes) {
        totalChanges += changes;
        elementsProcessed++;
      }
      return `style='${text}'`;
    });

    // 3) 处理 <style ...>...</style>
    result = result.replace(/<style([^>]*)>([\s\S]*?)<\/style>/gi, (m, attrs, cssText) => {
      const { text, changes } = normalizeCssBlob(cssText);
      if (changes) {
        totalChanges += changes;
        elementsProcessed++;
      }
      return `<style${attrs}>${text}</style>`;
    });

    report.stats.valuesNormalized = totalChanges;
    report.stats.elementsProcessed = elementsProcessed;
    if (totalChanges > 0) {
      report.changed = true;
      report.steps.push(`Regex normalization: ${totalChanges} values`);
      report.steps.push('Normalization completed successfully');
    } else {
      report.steps.push('No changes needed');
    }

    return { html: result, report };

  } catch (error) {
    report.warnings.push(`Normalization failed: ${error instanceof Error ? error.message : String(error)}`);
    report.steps.push('Fallback to original HTML');
    return { html, report };
  }
}
