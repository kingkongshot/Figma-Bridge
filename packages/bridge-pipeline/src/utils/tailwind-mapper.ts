import { TailwindConverter } from 'css-to-tailwindcss';
import type { LayoutInfo } from '../pipeline/types';

/**
 * Tailwind 类名映射模块
 *
 * === 不转换的 CSS 属性（保持行内样式）===
 *
 * 以下属性由于精度敏感或 Tailwind 支持有限，不会转换为类名：
 *
 * 1. 变换属性：transform, transform-origin
 *    - 变换矩阵包含复杂数值组合，如 matrix(1, 0, 0, 1, 0, 0)
 *    - rotate/scale/translate 组合转换后难以还原
 *
 * 2. 滤镜属性：filter, backdrop-filter（包括 blur）
 *    - 滤镜值可能包含多个函数组合，如 blur(4px) brightness(1.2)
 *    - Tailwind 仅支持单一滤镜函数，复合滤镜无法表达
 *
 * 3. 阴影属性（复杂场景）：text-shadow, 多重 box-shadow
 *    - text-shadow Tailwind 不支持任意值
 *    - 多重阴影（逗号分隔）超出 Tailwind 任意值能力
 *
 * 4. 混合模式：mix-blend-mode, background-blend-mode
 *    - 需要精确控制渲染层叠，类名表达不完整
 *
 * 5. 复杂背景：background-image（渐变/图片 URL）
 *    - 渐变语法复杂，URL 路径不适合类名
 */

export type UtilityMapResult = {
  classNames: string[];
  remainingCss: string;
};

/**
 * 类名策略
 * - conservative: 保守策略，仅使用当前白名单
 * - aggressive: 激进策略，扩展白名单（颜色、透明度、z-index、边框、阴影）
 */
export type ClassStrategy = 'conservative' | 'aggressive';

type Entry = [key: string, value: string];

function parseCssEntries(css: string): Entry[] {
  if (!css) return [];
  const out: Entry[] = [];
  const parts = css.split(';');
  for (const raw of parts) {
    const t = raw.trim();
    if (!t) continue;
    const i = t.indexOf(':');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim().toLowerCase();
    const v = t.slice(i + 1).trim();
    if (!k || !v) continue;
    out.push([k, v]);
  }
  return out;
}

function stringifyCss(entries: Entry[]): string {
  return entries.map(([k, v]) => `${k}:${v};`).join('');
}

// TailwindConverter is async; keep a single instance and a small result cache
let _converter: TailwindConverter | null = null;
const _cache = new Map<string, UtilityMapResult>();

function getConverter(): TailwindConverter {
  if (_converter) return _converter;
  _converter = new TailwindConverter({
    remInPx: 16,
    arbitraryPropertiesIsEnabled: true,
    tailwindConfig: {
      // Avoid global resets if later we decide to include Tailwind CSS
      corePlugins: { preflight: false },
      theme: {},
      content: [],
    } as any,
  });
  return _converter!;
}

function isAllowedClass(tw: string, strategy: ClassStrategy = 'conservative'): boolean {
  if (!tw) return false;

  // === 保守策略白名单（现有功能）===
  if (tw === 'flex' || tw === 'inline-flex' || tw === 'flex-col') return true;
  if (tw === 'flex-wrap' || tw === 'flex-nowrap' || tw === 'flex-wrap-reverse') return true;
  if (tw === 'justify-center' || tw === 'justify-end' || tw === 'justify-between' || tw === 'justify-around' || tw === 'justify-evenly') return true;
  if (tw === 'items-start' || tw === 'items-center' || tw === 'items-end' || tw === 'items-baseline') return true;
  if (tw === 'self-start' || tw === 'self-end' || tw === 'self-center' || tw === 'self-stretch' || tw === 'self-baseline') return true;
  if (tw === 'shrink-0' || tw === 'grow') return true;
  if (/^gap-(?:\d+|\d+\.5)$/.test(tw)) return true;
  if (/^gap-\[(?:\d+(?:\.\d+)?)px\]$/.test(tw)) return true;
  if (/^gap-[xy]-(?:\d+|\d+\.5)$/.test(tw)) return true;
  if (/^gap-[xy]-\[(?:\d+(?:\.\d+)?)px\]$/.test(tw)) return true;
  if (/^w-\[(?:\d+(?:\.\d+)?)px\]$/.test(tw)) return true;
  if (/^h-\[(?:\d+(?:\.\d+)?)px\]$/.test(tw)) return true;
  // min-width/min-height: min-w-0, min-h-0, min-w-[Xpx], min-h-[Xpx]
  if (tw === 'min-w-0' || tw === 'min-h-0') return true;
  if (/^min-w-\[(?:\d+(?:\.\d+)?)px\]$/.test(tw)) return true;
  if (/^min-h-\[(?:\d+(?:\.\d+)?)px\]$/.test(tw)) return true;
  if (/^text-\[(?:\d+(?:\.\d+)?)px\]$/.test(tw)) return true;
  if (/^leading-\[(?:\d+(?:\.\d+)?)(?:px|%)\]$/.test(tw)) return true;
  if (/^tracking-\[[-]?(?:\d+(?:\.\d+)?)(?:px|em)\]$/.test(tw)) return true;
  if (/^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/.test(tw)) return true;
  if (/^font-\[\d+\]$/.test(tw)) return true;
  if (/^rounded-\[[^\]]+\]$/.test(tw)) return true;
  if (/^rounded-(tl|tr|br|bl)-\[[^\]]+\]$/.test(tw)) return true;
  if (/^outline-(?:\d+)$/.test(tw) || /^outline-offset-(?:\d+)$/.test(tw) || /^outline-\[.*\]$/.test(tw)) return true;
  if (tw === 'basis-0' || tw === 'basis-auto') return true;
  if (/^(p|px|py|pt|pr|pb|pl)-(?:\d+|\d+\.5)$/.test(tw)) return true;
  if (/^(p|px|py|pt|pr|pb|pl)-\[(?:\d+(?:\.\d+)?)px\]$/.test(tw)) return true;
  if (/^(m|mx|my|mt|mr|mb|ml)-(?:\d+|\d+\.5)$/.test(tw)) return true;
  if (/^-(m|mx|my|mt|mr|mb|ml)-(?:\d+|\d+\.5)$/.test(tw)) return true;
  if (/^(?:-)?(m|mx|my|mt|mr|mb|ml)-\[(?:\d+(?:\.\d+)?)px\]$/.test(tw)) return true;
  if (/^overflow-(visible|hidden|auto|scroll)$/.test(tw)) return true;
  if (/^overflow-[xy]-(visible|hidden|auto|scroll)$/.test(tw)) return true;
  if (tw === 'box-border' || tw === 'box-content') return true;
  if (tw === 'italic' || tw === 'not-italic') return true;
  if (tw === 'underline' || tw === 'line-through' || tw === 'no-underline') return true;
  // position: absolute, relative, fixed, sticky
  if (tw === 'absolute' || tw === 'relative' || tw === 'fixed' || tw === 'sticky') return true;
  // inset: inset-0, inset-[Xpx], inset-x-0, inset-y-0, inset-x-[Xpx], inset-y-[Xpx]
  if (tw === 'inset-0' || /^inset-\[-?\d+(?:\.\d+)?px\]$/.test(tw)) return true;
  if (/^inset-[xy]-0$/.test(tw) || /^inset-[xy]-\[-?\d+(?:\.\d+)?px\]$/.test(tw)) return true;
  // left/top/right/bottom: -0, -[Xpx], -auto
  if (/^(left|top|right|bottom)-0$/.test(tw)) return true;
  if (/^(left|top|right|bottom)-\[-?\d+(?:\.\d+)?px\]$/.test(tw)) return true;
  if (/^(left|top|right|bottom)-auto$/.test(tw)) return true;
  if (/^text-(left|center|right|justify)$/.test(tw)) return true;
  if (/^whitespace-(normal|nowrap|pre|pre-wrap)$/.test(tw)) return true;

  if (tw === 'block') return true;
  if (tw === 'w-full' || tw === 'h-full') return true;
  if (tw === 'bg-center' || tw === 'bg-no-repeat' || tw === 'bg-auto' || tw === 'bg-cover') return true;
  // 透明度: opacity-[0.x]（所有策略可用）
  if (/^opacity-\[(?:0|1|0?\.\d+)\]$/.test(tw)) return true;
  // z-index: z-[n] 或 z-[-n]（所有策略可用）
  if (/^z-\[-?\d+\]$/.test(tw)) return true;
  // === 激进策略白名单（Epic1 新增）===
  if (strategy === 'aggressive') {
    // 文本颜色: text-[#hex] 或 text-[rgb(...)] 或 text-[rgba(...)]
    if (/^text-\[#[0-9a-fA-F]{3,8}\]$/.test(tw)) return true;
    if (/^text-\[rgba?\([^)]+\)\]$/.test(tw)) return true;

    // 背景颜色: bg-[#hex] 或 bg-[rgb(...)] 或 bg-[rgba(...)]
    if (/^bg-\[#[0-9a-fA-F]{3,8}\]$/.test(tw)) return true;
    if (/^bg-\[rgba?\([^)]+\)\]$/.test(tw)) return true;

    // 边框颜色: border-[#hex] 或 border-[rgb(...)]
    if (/^border-\[#[0-9a-fA-F]{3,8}\]$/.test(tw)) return true;
    if (/^border-\[rgba?\([^)]+\)\]$/.test(tw)) return true;

    // 边框宽度: border-[npx] 或 border-t/r/b/l-[npx]
    if (/^border-\[(?:\d+(?:\.\d+)?)px\]$/.test(tw)) return true;
    if (/^border-[trbl]-\[(?:\d+(?:\.\d+)?)px\]$/.test(tw)) return true;

    // 边框样式: border-solid
    if (tw === 'border-solid') return true;

    // 阴影: shadow-[...] - 排除 inset 阴影（边框模拟）
    if (/^shadow-\[.+\]$/.test(tw) && !tw.includes('inset')) return true;

    // === Epic1 补充：位置和尺寸（用户反馈需求）===
    // width/height: w-[Xpx], h-[Xpx] (已在上方通用逻辑中支持，这里确认一下)
    // left/top/right/bottom: left-[Xpx] (已在上方通用逻辑中支持)
    // absolute/relative (已在上方通用逻辑中支持)
  }

  return false;
}

function classListHasGapScale(classes: string[]): boolean {
  return classes.some(c =>
    /^gap-(?:\d+|\d+\.5)$/.test(c) ||
    /^gap-\[(?:\d+(?:\.\d+)?)px\]$/.test(c) ||
    /^gap-[xy]-(?:\d+|\d+\.5)$/.test(c) ||
    /^gap-[xy]-\[(?:\d+(?:\.\d+)?)px\]$/.test(c)
  );
}

export async function cssToTailwindClasses(css: string, strategy: ClassStrategy = 'conservative'): Promise<UtilityMapResult> {
  const key = `${css || ''}::${strategy}`;
  if (_cache.has(key)) return _cache.get(key)!;
  if (!css || !css.trim()) {
    const empty = { classNames: [], remainingCss: '' };
    _cache.set(key, empty);
    return empty;
  }

  // Wrap declarations into a temporary selector for the converter
  const input = `.x{${css}}`;
  const { nodes } = await getConverter().convertCSS(input);
  const twClasses: string[] = Array.isArray(nodes) && nodes.length ? (nodes[0].tailwindClasses || []) : [];
  const filtered = twClasses.filter(c => isAllowedClass(c, strategy));

  // Rebuild remaining CSS: drop properties that are represented by kept classes
  const kept: Entry[] = [];
  const classes = new Set(filtered);
  const entries = parseCssEntries(css);

  // 生成任意像素的 gap/padding/margin 的 bracket 类（如 gap-[9px], p-[17px], -mt-[4px]）
  function parsePx(v: string): number | null {
    const m = v.trim().match(/^(-)?(\d+(?:\.\d+)?)px$/i);
    if (!m) return null;
    const num = parseFloat(m[2]);
    return m[1] ? -num : num;
  }
  // Helpers to avoid generating duplicate arbitrary classes when a scale class already exists
  const hasGapScale = Array.from(classes).some(c => /^gap-(?:\d+|\d+\.5)$/.test(c));
  const hasPaddingScale = Array.from(classes).some(c => /^(p|px|py|pt|pr|pb|pl)-(?:\d+|\d+\.5)$/.test(c));
  const hasMarginScale = Array.from(classes).some(c => /^(?:-)?(m|mx|my|mt|mr|mb|ml)-(?:\d+|\d+\.5)$/.test(c));

  // === Epic1 新增：颜色值解析辅助函数 ===
  // 解析颜色值（支持 #hex, rgb(), rgba()），并进行归一化
  function parseColor(v: string): string | null {
    const trimmed = v.trim();
    // #hex 格式
    if (/^#[0-9a-fA-F]{3,8}$/.test(trimmed)) {
      // 归一化：#fff -> #ffffff
      if (trimmed.length === 4) {
        return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
      }
      return trimmed;
    }
    // rgb/rgba 格式
    const rgbMatch = trimmed.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
    if (rgbMatch) {
      // 归一化：rgb(r,g,b) -> rgba(r,g,b,1) 以保持一致性
      return `rgba(${rgbMatch[1]},${rgbMatch[2]},${rgbMatch[3]},1)`;
    }
    const rgbaMatch = trimmed.match(/^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([0-9.]+)\s*\)$/);
    if (rgbaMatch) {
      // 去除空格
      return `rgba(${rgbaMatch[1]},${rgbaMatch[2]},${rgbaMatch[3]},${rgbaMatch[4]})`;
    }
    return null;
  }

  // 解析透明度值（0-1 之间）
  function parseOpacity(v: string): string | null {
    const n = parseFloat(v);
    if (isNaN(n) || n < 0 || n > 1) return null;
    // 格式化为最简形式
    if (n === 0) return '0';
    if (n === 1) return '1';
    return n.toFixed(2).replace(/\.?0+$/, '');
  }

  // 解析 z-index（整数）
  function parseZIndex(v: string): number | null {
    const n = parseInt(v, 10);
    if (isNaN(n)) return null;
    return n;
  }

  // 规范化边框宽度（像素）：
  // - 保留两位小数，避免长尾小数污染类名
  // - 小于 0.5px 的宽度直接视为无边框（返回 null，不生成 border-[...] 类）
  function normalizeBorderWidth(n: number): number | null {
    if (!Number.isFinite(n) || n < 0) return null;
    const rounded = Math.round(n * 100) / 100; // 2dp
    if (rounded < 0.5) return null;
    return rounded;
  }

  // 检测是否为简单外阴影（非内阴影、非多重阴影）
  // ⚠️ 重要：不能使用 split(',') 判断多重阴影，因为 rgba() 内部也包含逗号
  function isSimpleOuterShadow(v: string): boolean {
    if (v.includes('inset')) return false;
    // 使用正则检测"顶层逗号"（不在括号内的逗号）= 多重阴影
    const hasTopLevelComma = /,(?![^(]*\))/.test(v);
    return !hasTopLevelComma;
  }

  // 转义阴影值用于 Tailwind 类名（空格→下划线，括号需要在选择器中转义）
  function escapeShadowForClass(v: string): string {
    return v.trim().replace(/\s+/g, '_');
  }

  for (const [k, vRaw] of entries) {
    const v = vRaw.trim();
    if (k === 'width') { if (v === '100%') { classes.add('w-full'); continue; } const n = parsePx(v); if (n !== null) { classes.add(`w-[${n}px]`); continue; } }
    if (k === 'height') { if (v === '100%') { classes.add('h-full'); continue; } const n = parsePx(v); if (n !== null) { classes.add(`h-[${n}px]`); continue; } }
    // min-width/min-height: 支持 0 和任意 px 值
    if (k === 'min-width') {
      if (v === '0' || v === '0px') { classes.add('min-w-0'); continue; }
      const n = parsePx(v); if (n !== null && n >= 0) { classes.add(`min-w-[${n}px]`); continue; }
    }
    if (k === 'min-height') {
      if (v === '0' || v === '0px') { classes.add('min-h-0'); continue; }
      const n = parsePx(v); if (n !== null && n >= 0) { classes.add(`min-h-[${n}px]`); continue; }
    }
    // position: absolute, relative, fixed, sticky
    if (k === 'position') {
      if (v === 'absolute' || v === 'relative' || v === 'fixed' || v === 'sticky') {
        classes.add(v);
        continue;
      }
    }
    // left/top/right/bottom: 支持 0, auto, px 值（含负值）
    if (k === 'left' || k === 'top' || k === 'right' || k === 'bottom') {
      if (v === '0' || v === '0px') { classes.add(`${k}-0`); continue; }
      if (v === 'auto') { classes.add(`${k}-auto`); continue; }
      const n = parsePx(v);
      if (n !== null) { classes.add(`${k}-[${n}px]`); continue; }
    }
    // inset: 支持 0, px 值
    if (k === 'inset') {
      if (v === '0' || v === '0px') { classes.add('inset-0'); continue; }
      const n = parsePx(v);
      if (n !== null) { classes.add(`inset-[${n}px]`); continue; }
    }
    if (k === 'font-size') { const n = parsePx(v); if (n !== null) { classes.add(`text-[${n}px]`); continue; } }
    if (k === 'line-height') {
      const mp = v.match(/^(\d+(?:\.\d+)?)%$/);
      if (mp) { classes.add(`leading-[${mp[1]}%]`); continue; }
      const n = parsePx(v);
      if (n !== null) { classes.add(`leading-[${n}px]`); continue; }
    }
    if (k === 'letter-spacing') {
      const mpx = v.match(/^(-?\d+(?:\.\d+)?)px$/i);
      const mem = v.match(/^(-?\d+(?:\.\d+)?)em$/i);
      if (mpx) { classes.add(`tracking-[${mpx[1]}px]`); continue; }
      if (mem) { classes.add(`tracking-[${mem[1]}em]`); continue; }
    }
    if (k === 'font-weight') {
      const n = parseInt(v, 10);
      const map: Record<number, string> = { 100: 'thin', 200: 'extralight', 300: 'light', 400: 'normal', 500: 'medium', 600: 'semibold', 700: 'bold', 800: 'extrabold', 900: 'black' };
      if (!Number.isNaN(n)) { if (map[n]) classes.add(`font-${map[n]}`); else classes.add(`font-[${n}]`); continue; }
    }
    if (k === 'border-radius') {
      const raw = v.trim();
      if (raw && !raw.includes('/')) {
        const parts = raw.split(/\s+/);
        if (parts.length >= 1 && parts.length <= 4) {
          const rawClass = `rounded-[${raw.replace(/\s+/g, '_')}]`;
          if (classes.has(rawClass)) classes.delete(rawClass);
          let tl = parts[0];
          let tr = parts[0];
          let br = parts[0];
          let bl = parts[0];
          if (parts.length === 2) {
            tl = br = parts[0];
            tr = bl = parts[1];
          } else if (parts.length === 3) {
            tl = parts[0];
            tr = bl = parts[1];
            br = parts[2];
          } else if (parts.length === 4) {
            [tl, tr, br, bl] = parts;
          }
          const allEqual = tl === tr && tl === br && tl === bl;
          if (allEqual) {
            classes.add(`rounded-[${tl}]`);
          } else {
            classes.add(`rounded-tl-[${tl}]`);
            classes.add(`rounded-tr-[${tr}]`);
            classes.add(`rounded-br-[${br}]`);
            classes.add(`rounded-bl-[${bl}]`);
          }
          continue;
        }
      }
    }
    if (k === 'border-top-left-radius' || k === 'border-top-right-radius' ||
        k === 'border-bottom-right-radius' || k === 'border-bottom-left-radius') {
      const token = v.trim();
      if (token && !token.includes(' ') && !token.includes('/')) {
        const map: Record<string, string> = {
          'border-top-left-radius': 'rounded-tl',
          'border-top-right-radius': 'rounded-tr',
          'border-bottom-right-radius': 'rounded-br',
          'border-bottom-left-radius': 'rounded-bl',
        };
        const base = map[k];
        if (base) {
          classes.add(`${base}-[${token}]`);
          continue;
        }
      }
    }
    if (k === 'outline') {
      const m = v.match(/^(\d+(?:\.\d+)?)px\s+solid\s+(.+)$/i);
      if (m) { classes.add(`outline-${parseFloat(m[1])}`); classes.add(`outline-[${m[2]}]`); continue; }
    }
    if (k === 'outline-offset') { const n = parsePx(v); if (n !== null) { classes.add(`outline-offset-${n}`); continue; } }
    if (k === 'gap') {
      const n = parsePx(v);
      if (n !== null && n >= 0 && !hasGapScale) { classes.add(`gap-[${n}px]`); continue; }
    }
    // display: block
    if (k === 'display') {
      if (v === 'block') { classes.add('block'); continue; }
    }
    // 文本对齐: text-align → text-left/center/right/justify
    if (k === 'text-align') {
      const norm = v.trim().toLowerCase();
      if (norm === 'left' || norm === 'center' || norm === 'right' || norm === 'justify') {
        classes.add(`text-${norm}`);
        continue;
      }
    }
    // 空白处理: white-space → whitespace-*
    if (k === 'white-space') {
      const norm = v.trim().toLowerCase().replace(/\s+/g, '');
      if (norm === 'normal' || norm === 'nowrap' || norm === 'pre' || norm === 'pre-wrap') {
        const suffix = norm === 'pre-wrap' ? 'pre-wrap' : norm;
        classes.add(`whitespace-${suffix}`);
        continue;
      }
    }
    // 滚动溢出: overflow-x/overflow-y → overflow-x/y-*
    if (k === 'overflow-x' || k === 'overflow-y') {
      const norm = v.trim().toLowerCase();
      if (norm === 'visible' || norm === 'hidden' || norm === 'auto' || norm === 'scroll') {
        const axis = k === 'overflow-x' ? 'x' : 'y';
        classes.add(`overflow-${axis}-${norm}`);
        continue;
      }
    }
    // 字体样式: font-style → italic / not-italic
    if (k === 'font-style') {
      const norm = v.trim().toLowerCase();
      if (norm === 'italic') {
        classes.add('italic');
        continue;
      }
      if (norm === 'normal') {
        classes.add('not-italic');
        continue;
      }
    }
    // 文本装饰: text-decoration → underline / line-through / no-underline
    if (k === 'text-decoration') {
      const norm = v.trim().toLowerCase();
      if (norm === 'underline') {
        classes.add('underline');
        continue;
      }
      if (norm === 'line-through') {
        classes.add('line-through');
        continue;
      }
      if (norm === 'none') {
        classes.add('no-underline');
        continue;
      }
    }
    // 背景容器相关：只处理简单可安全映射的模式
    if (k === 'background-position') {
      const norm = v.replace(/\s+/g, ' ');
      if (norm === 'center' || norm === 'center center' || norm === 'center, center') {
        classes.add('bg-center');
        continue;
      }
    }
    if (k === 'background-repeat') {
      const norm = v.replace(/\s+/g, ' ');
      if (norm === 'no-repeat' || norm === 'no-repeat, no-repeat') {
        classes.add('bg-no-repeat');
        continue;
      }
    }
    if (k === 'background-size') {
      const norm = v.replace(/\s+/g, ' ');
      if (norm === 'auto' || norm === 'auto auto' || norm === 'auto, auto') {
        classes.add('bg-auto');
        continue;
      }
      if (norm === 'cover' || norm === 'cover cover' || norm === 'cover, cover') {
        classes.add('bg-cover');
        continue;
      }
    }

    // 纯色背景: background-color / background（仅 #hex / rgb / rgba）→ bg-[...]
    if (k === 'background-color' || k === 'background') {
      // 移除由转换器生成的 bg-[...] 颜色类，统一使用归一化后的颜色类
      for (const c of Array.from(classes)) {
        if (/^bg-\[[0-9a-fA-F#]{3,8}\]$/.test(c) || /^bg-\[rgba?\([^)]+\)\]$/.test(c)) {
          classes.delete(c);
        }
      }
      const color = parseColor(v);
      if (color) { classes.add(`bg-[${color}]`); continue; }
    }

    // 基础视觉属性：透明度和 z-index（所有策略）
    if (k === 'opacity') {
      // 移除由转换器生成的原始 opacity-[...]，统一使用归一化后的数值
      for (const c of Array.from(classes)) {
        if (/^opacity-\[(?:0|1|0?\.\d+)\]$/.test(c)) {
          classes.delete(c);
        }
      }
      const op = parseOpacity(v);
      if (op !== null) { classes.add(`opacity-[${op}]`); continue; }
    }

    if (k === 'z-index') {
      const z = parseZIndex(v);
      if (z !== null) { classes.add(`z-[${z}]`); continue; }
    }

    // 边框颜色: border-color → border-[color]
    if (k === 'border-color') {
      // 移除由转换器生成的 border-[...] 颜色类，统一使用归一化颜色
      for (const c of Array.from(classes)) {
        if (/^border-\[[0-9a-fA-F#]{3,8}\]$/.test(c) || /^border-\[rgba?\([^)]+\)\]$/.test(c)) {
          classes.delete(c);
        }
      }
      const color = parseColor(v);
      if (color) { classes.add(`border-[${color}]`); continue; }
    }

    // 边框宽度: border-width → border-[npx]，并对极小值做清洗
    if (k === 'border-width') {
      const raw = parsePx(v);
      const n = raw !== null ? normalizeBorderWidth(raw) : null;
      if (n !== null) { classes.add(`border-[${n}px]`); }
      continue;
    }

    // 各方向边框宽度：应用归一化，过滤掉极小宽度
    if (k === 'border-top-width' || k === 'border-right-width' || k === 'border-bottom-width' || k === 'border-left-width') {
      const raw = parsePx(v);
      const n = raw !== null ? normalizeBorderWidth(raw) : null;
      if (n !== null) {
        const dirMap: Record<string, string> = {
          'border-top-width': 'border-t',
          'border-right-width': 'border-r',
          'border-bottom-width': 'border-b',
          'border-left-width': 'border-l',
        };
        classes.add(`${dirMap[k]}-[${n}px]`);
      }
      continue;
    }

    // 边框简写: border: <width> solid <color>
    if (k === 'border') {
      const m = v.match(/^(\d+(?:\.\d+)?)px\s+([a-z]+)\s+(.+)$/i);
      if (m) {
        const raw = parseFloat(m[1]);
        const style = m[2].toLowerCase();
        const colorRaw = m[3];
        const n = normalizeBorderWidth(raw);

        if (n === null) {
          // 极小/非法宽度：视为“无边框”，并清理已有的 border 宽度/颜色类
          for (const c of Array.from(classes)) {
            if (/^border-\[(?:\d+(?:\.\d+)?)px\]$/.test(c) ||
                /^border-\[[0-9a-fA-F#]{3,8}\]$/.test(c) ||
                /^border-\[rgba?\([^)]+\)\]$/.test(c)) {
              classes.delete(c);
            }
          }
          continue;
        }

        const color = parseColor(colorRaw);
        if (style === 'solid' && color) {
          // 统一使用当前 border 声明生成的宽度/颜色类，移除之前的全局 border-[...] 变体
          for (const c of Array.from(classes)) {
            if (/^border-\[(?:\d+(?:\.\d+)?)px\]$/.test(c) ||
                /^border-\[[0-9a-fA-F#]{3,8}\]$/.test(c) ||
                /^border-\[rgba?\([^)]+\)\]$/.test(c)) {
              classes.delete(c);
            }
          }
          classes.add(`border-[${n}px]`);
          classes.add(`border-[${color}]`);
          classes.add('border-solid');
          continue;
        }
      }
    }

    // === Epic1 新增：激进策略属性映射 ===
    if (strategy === 'aggressive') {
      // 文本颜色: color → text-[#hex] 或 text-[rgba(...)]
      if (k === 'color') {
        // 移除由转换器生成的 text-[...] 颜色类，统一使用归一化颜色
        for (const c of Array.from(classes)) {
          if (/^text-\[[0-9a-fA-F#]{3,8}\]$/.test(c) || /^text-\[rgba?\([^)]+\)\]$/.test(c)) {
            classes.delete(c);
          }
        }
        const color = parseColor(v);
        if (color) { classes.add(`text-[${color}]`); continue; }
      }

      // 阴影: box-shadow → shadow-[...] (仅简单外阴影)
      if (k === 'box-shadow') {
        if (isSimpleOuterShadow(v)) {
          const escaped = escapeShadowForClass(v);
          classes.add(`shadow-[${escaped}]`);
          continue;
        }
        // 多重阴影或内阴影：保留行内样式，不转换
      }
    }

    if (k === 'padding') {
      const parts = v.split(/\s+/).filter(Boolean);

      // 先移除由转换器或之前声明生成的任意像素 padding 类，避免 p-/px-/py-/pt/pr/pb/pl-[...] 多种形式叠加
      for (const c of Array.from(classes)) {
        if (/^(p|px|py|pt|pr|pb|pl)-\[(?:\d+(?:\.\d+)?)px\]$/.test(c)) {
          classes.delete(c);
        }
      }

      if (parts.length === 1) {
        const n = parsePx(parts[0]);
        if (n !== null && n >= 0 && !hasPaddingScale) classes.add(`p-[${n}px]`);
        continue;
      }

      if (parts.length === 2) {
        const ny = parsePx(parts[0]);
        const nx = parsePx(parts[1]);
        if (ny !== null && nx !== null && ny === nx && ny >= 0 && !hasPaddingScale) {
          // 所有方向相等（padding: v v）→ 统一用 p-[vpx]
          classes.add(`p-[${ny}px]`);
        } else {
          if (ny !== null && ny >= 0 && !hasPaddingScale) classes.add(`py-[${ny}px]`);
          if (nx !== null && nx >= 0 && !hasPaddingScale) classes.add(`px-[${nx}px]`);
        }
        continue;
      }

      if (parts.length === 4) {
        const [nt, nr, nb, nl] = parts.map(parsePx);
        const nums = [nt, nr, nb, nl];
        const allNonNull = nums.every(n => n !== null);
        if (allNonNull && nt !== null && nt >= 0 && nt === nr && nt === nb && nt === nl && !hasPaddingScale) {
          // padding: v v v v → 压缩成单一 p-[vpx]
          classes.add(`p-[${nt}px]`);
        } else {
          if (nt !== null && nt >= 0 && !hasPaddingScale) classes.add(`pt-[${nt}px]`);
          if (nr !== null && nr >= 0 && !hasPaddingScale) classes.add(`pr-[${nr}px]`);
          if (nb !== null && nb >= 0 && !hasPaddingScale) classes.add(`pb-[${nb}px]`);
          if (nl !== null && nl >= 0 && !hasPaddingScale) classes.add(`pl-[${nl}px]`);
        }
        continue;
      }
    }

    if (k === 'padding-top' || k === 'padding-right' || k === 'padding-bottom' || k === 'padding-left') {
      const n = parsePx(v);
      if (n !== null && n >= 0 && !hasPaddingScale) {
        const map: Record<string, string> = { 'padding-top': 'pt', 'padding-right': 'pr', 'padding-bottom': 'pb', 'padding-left': 'pl' };
        classes.add(`${map[k]}-[${n}px]`);
        continue;
      }
    }

    if (k === 'margin') {
      const parts = v.split(/\s+/).filter(Boolean);

      // 先移除由转换器或之前声明生成的任意像素 margin 类，避免 m-/mx-/my-/mt/mr/mb/ml-[...] 多种形式叠加
      for (const c of Array.from(classes)) {
        if (/^-?(m|mx|my|mt|mr|mb|ml)-\[(?:\d+(?:\.\d+)?)px\]$/.test(c)) {
          classes.delete(c);
        }
      }

      if (parts.length === 1) {
        const n = parsePx(parts[0]);
        if (n !== null && !hasMarginScale) classes.add(`${n < 0 ? '-' : ''}m-[${Math.abs(n)}px]`);
        continue;
      }

      if (parts.length === 2) {
        const ny = parsePx(parts[0]);
        const nx = parsePx(parts[1]);
        if (ny !== null && nx !== null && ny === nx && !hasMarginScale) {
          // margin: v v → 四边相等，统一压缩为 m-[vpx]
          const n = ny;
          classes.add(`${n < 0 ? '-' : ''}m-[${Math.abs(n)}px]`);
        } else {
          if (ny !== null && !hasMarginScale) classes.add(`${ny < 0 ? '-' : ''}my-[${Math.abs(ny)}px]`);
          if (nx !== null && !hasMarginScale) classes.add(`${nx < 0 ? '-' : ''}mx-[${Math.abs(nx)}px]`);
        }
        continue;
      }

      if (parts.length === 4) {
        const [nt, nr, nb, nl] = parts.map(parsePx);
        const nums = [nt, nr, nb, nl];
        const allNonNull = nums.every(n => n !== null);
        if (allNonNull && nt !== null && nt === nr && nt === nb && nt === nl && !hasMarginScale) {
          // margin: v v v v → 压缩成单一 m-[vpx]
          const n = nt;
          classes.add(`${n < 0 ? '-' : ''}m-[${Math.abs(n)}px]`);
        } else {
          if (nt !== null && !hasMarginScale) classes.add(`${nt < 0 ? '-' : ''}mt-[${Math.abs(nt)}px]`);
          if (nr !== null && !hasMarginScale) classes.add(`${nr < 0 ? '-' : ''}mr-[${Math.abs(nr)}px]`);
          if (nb !== null && !hasMarginScale) classes.add(`${nb < 0 ? '-' : ''}mb-[${Math.abs(nb)}px]`);
          if (nl !== null && !hasMarginScale) classes.add(`${nl < 0 ? '-' : ''}ml-[${Math.abs(nl)}px]`);
        }
        continue;
      }
    }
    if (k === 'margin-top' || k === 'margin-right' || k === 'margin-bottom' || k === 'margin-left') {
      const n = parsePx(v); if (n !== null && !hasMarginScale) {
        const map: Record<string, string> = { 'margin-top': 'mt', 'margin-right': 'mr', 'margin-bottom': 'mb', 'margin-left': 'ml' };
        classes.add(`${n < 0 ? '-' : ''}${map[k]}-[${Math.abs(n)}px]`);
        continue;
      }
    }
  }

  type Checker = (v: string, cls: Set<string>) => boolean;
  const cssToClassCheckers: Record<string, Checker> = {
    'width': (_v, cls) => Array.from(cls).some(c => c === 'w-full' || /^w-\[.+\]$/.test(c)),
    'height': (_v, cls) => Array.from(cls).some(c => c === 'h-full' || /^h-\[.+\]$/.test(c)),
    // min-width/min-height: 检查是否已转换为 min-w-0/min-h-0 或 min-w-[Xpx]/min-h-[Xpx]
    'min-width': (_v, cls) => cls.has('min-w-0') || Array.from(cls).some(c => /^min-w-\[.+\]$/.test(c)),
    'min-height': (_v, cls) => cls.has('min-h-0') || Array.from(cls).some(c => /^min-h-\[.+\]$/.test(c)),
    // position: 检查是否已转换为 absolute/relative/fixed/sticky
    'position': (v, cls) => cls.has(v),
    // left/top/right/bottom: 检查是否已转换
    'left': (_v, cls) => cls.has('left-0') || cls.has('left-auto') || Array.from(cls).some(c => /^left-\[.+\]$/.test(c)),
    'top': (_v, cls) => cls.has('top-0') || cls.has('top-auto') || Array.from(cls).some(c => /^top-\[.+\]$/.test(c)),
    'right': (_v, cls) => cls.has('right-0') || cls.has('right-auto') || Array.from(cls).some(c => /^right-\[.+\]$/.test(c)),
    'bottom': (_v, cls) => cls.has('bottom-0') || cls.has('bottom-auto') || Array.from(cls).some(c => /^bottom-\[.+\]$/.test(c)),
    // inset: 检查是否已转换
    'inset': (_v, cls) => cls.has('inset-0') || Array.from(cls).some(c => /^inset-\[.+\]$/.test(c)),
    'display': (v, cls) =>
      (v === 'flex' && cls.has('flex')) ||
      (v === 'inline-flex' && cls.has('inline-flex')) ||
      (v === 'block' && cls.has('block')),
    'flex-direction': (v, cls) => (v === 'row') || (v === 'column' && cls.has('flex-col')),
    'flex-wrap': (v, cls) =>
      (v === 'wrap' && cls.has('flex-wrap')) ||
      (v === 'nowrap' && cls.has('flex-nowrap')) ||
      (v === 'wrap-reverse' && cls.has('flex-wrap-reverse')),
    'font-size': (_v, cls) => Array.from(cls).some(c => /^text-\[.+\]$/.test(c)),
    'line-height': (_v, cls) => Array.from(cls).some(c => /^leading-\[.+\]$/.test(c)),
    'letter-spacing': (_v, cls) => Array.from(cls).some(c => /^tracking-\[.+\]$/.test(c)),
    'font-weight': (_v, cls) => Array.from(cls).some(c => /^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/.test(c) || /^font-\[\d+\]$/.test(c)),
    'border-radius': (v, cls) => {
      const raw = v.trim();
      if (!raw || raw.includes('/')) return false;
      const parts = raw.split(/\s+/);
      if (parts.length < 1 || parts.length > 4) return false;
      let tl = parts[0];
      let tr = parts[0];
      let br = parts[0];
      let bl = parts[0];
      if (parts.length === 2) {
        tl = br = parts[0];
        tr = bl = parts[1];
      } else if (parts.length === 3) {
        tl = parts[0];
        tr = bl = parts[1];
        br = parts[2];
      } else if (parts.length === 4) {
        [tl, tr, br, bl] = parts;
      }
      const hasCorner = (corner: string, token: string) =>
        cls.has(`rounded-${corner}-[${token}]`) || cls.has(`rounded-[${token}]`);
      return hasCorner('tl', tl) && hasCorner('tr', tr) && hasCorner('br', br) && hasCorner('bl', bl);
    },
    'border-top-left-radius': (v, cls) => {
      const token = v.trim();
      if (!token || token.includes(' ') || token.includes('/')) return false;
      return cls.has(`rounded-tl-[${token}]`) || cls.has(`rounded-[${token}]`);
    },
    'border-top-right-radius': (v, cls) => {
      const token = v.trim();
      if (!token || token.includes(' ') || token.includes('/')) return false;
      return cls.has(`rounded-tr-[${token}]`) || cls.has(`rounded-[${token}]`);
    },
    'border-bottom-right-radius': (v, cls) => {
      const token = v.trim();
      if (!token || token.includes(' ') || token.includes('/')) return false;
      return cls.has(`rounded-br-[${token}]`) || cls.has(`rounded-[${token}]`);
    },
    'border-bottom-left-radius': (v, cls) => {
      const token = v.trim();
      if (!token || token.includes(' ') || token.includes('/')) return false;
      return cls.has(`rounded-bl-[${token}]`) || cls.has(`rounded-[${token}]`);
    },
    'outline': (_v, cls) => Array.from(cls).some(c => /^outline-(?:\d+)$/.test(c) || /^outline-\[.+\]$/.test(c)),
    'outline-offset': (_v, cls) => Array.from(cls).some(c => /^outline-offset-(?:\d+)$/.test(c)),
    'justify-content': (v, cls) => {
      if (v === 'flex-start') return true; // default
      const map: Record<string, string> = {
        'center': 'justify-center',
        'flex-end': 'justify-end',
        'space-between': 'justify-between',
        'space-around': 'justify-around',
        'space-evenly': 'justify-evenly',
      };
      const tw = map[v];
      return !!(tw && cls.has(tw));
    },
    'align-items': (v, cls) => {
      if (v === 'stretch') return true; // default
      const map: Record<string, string> = {
        'center': 'items-center',
        'flex-start': 'items-start',
        'flex-end': 'items-end',
        'baseline': 'items-baseline',
      };
      const tw = map[v];
      return !!(tw && cls.has(tw));
    },
    'gap': (_v, cls) => classListHasGapScale(Array.from(cls)),
    'flex-basis': (v, cls) => ((v === '0' || v === '0px') && cls.has('basis-0')) || (v === 'auto' && cls.has('basis-auto')),
    'flex-shrink': (v, cls) => v === '0' && cls.has('shrink-0'),
    'flex-grow': (v, cls) => v === '1' && cls.has('grow'),
    'align-self': (v, cls) => {
      const map: Record<string, string> = {
        'stretch': 'self-stretch',
        'center': 'self-center',
        'flex-start': 'self-start',
        'flex-end': 'self-end',
        'baseline': 'self-baseline',
      };
      const tw = map[v];
      return !!(tw && cls.has(tw));
    },
    'text-align': (v, cls) => {
      const map: Record<string, string> = {
        'left': 'text-left',
        'center': 'text-center',
        'right': 'text-right',
        'justify': 'text-justify',
      };
      const tw = map[v];
      return !!(tw && cls.has(tw));
    },
    'white-space': (v, cls) => {
      const map: Record<string, string> = {
        'normal': 'whitespace-normal',
        'nowrap': 'whitespace-nowrap',
        'pre': 'whitespace-pre',
        'pre-wrap': 'whitespace-pre-wrap',
      };
      const tw = map[v];
      return !!(tw && cls.has(tw));
    },
    'box-sizing': (v, cls) => (v === 'border-box' && cls.has('box-border')) || (v === 'content-box' && cls.has('box-content')),
    'overflow': (v, cls) => cls.has(`overflow-${v}`),
    'overflow-x': (v, cls) => cls.has(`overflow-x-${v}`),
    'overflow-y': (v, cls) => cls.has(`overflow-y-${v}`),
    'font-style': (v, cls) => (v === 'italic' && cls.has('italic')) || (v === 'normal' && cls.has('not-italic')),
    'text-decoration': (v, cls) => {
      const map: Record<string, string> = {
        'underline': 'underline',
        'line-through': 'line-through',
        'none': 'no-underline',
      };
      const tw = map[v];
      return !!(tw && cls.has(tw));
    },
    // display + 背景容器：当存在对应类时移除原始属性
    // display: 在上方检查器中统一处理 flex / inline-flex / block
    'background-position': (v, cls) => {
      const norm = v.replace(/\s+/g, ' ');
      return (norm === 'center' || norm === 'center center' || norm === 'center, center') && cls.has('bg-center');
    },
    'background-repeat': (v, cls) => {
      const norm = v.replace(/\s+/g, ' ');
      return (norm === 'no-repeat' || norm === 'no-repeat, no-repeat') && cls.has('bg-no-repeat');
    },
    'background-size': (v, cls) => {
      const norm = v.replace(/\s+/g, ' ');
      const isAuto = norm === 'auto' || norm === 'auto auto' || norm === 'auto, auto';
      const isCover = norm === 'cover' || norm === 'cover cover' || norm === 'cover, cover';
      if (isAuto && cls.has('bg-auto')) return true;
      if (isCover && cls.has('bg-cover')) return true;
      return false;
    },
    // padding family: drop when any matching padding class exists
    'padding': (v, cls) => {
      const parts = v.split(/\s+/).filter(Boolean);
      const hasAnyPad = Array.from(cls).some(c => /^(p|px|py|pt|pr|pb|pl)-(?:\d+|\d+\.5)$/.test(c) || /^(p|px|py|pt|pr|pb|pl)-\[(?:\d+(?:\.\d+)?)px\]$/.test(c));
      if (!hasAnyPad) return false;
      if (parts.length === 1) return true;
      if (parts.length === 2) return true;
      if (parts.length === 4) return true;
      return false;
    },
    'padding-top': (_v, cls) => Array.from(cls).some(c => /^(p|py|pt)-(?:\d+|\d+\.5)$/.test(c) || /^(p|py|pt)-\[(?:\d+(?:\.\d+)?)px\]$/.test(c)),
    'padding-right': (_v, cls) => Array.from(cls).some(c => /^(p|px|pr)-(?:\d+|\d+\.5)$/.test(c) || /^(p|px|pr)-\[(?:\d+(?:\.\d+)?)px\]$/.test(c)),
    'padding-bottom': (_v, cls) => Array.from(cls).some(c => /^(p|py|pb)-(?:\d+|\d+\.5)$/.test(c) || /^(p|py|pb)-\[(?:\d+(?:\.\d+)?)px\]$/.test(c)),
    'padding-left': (_v, cls) => Array.from(cls).some(c => /^(p|px|pl)-(?:\d+|\d+\.5)$/.test(c) || /^(p|px|pl)-\[(?:\d+(?:\.\d+)?)px\]$/.test(c)),
    // row/column-gap: drop when any gap class exists
    'row-gap': (_v, cls) => classListHasGapScale(Array.from(cls)),
    'column-gap': (_v, cls) => classListHasGapScale(Array.from(cls)),
    'margin': (_v, cls) => Array.from(cls).some(c => /^(?:-)?(m|mx|my|mt|mr|mb|ml)-(?:\d+|\d+\.5)$/.test(c) || /^(?:-)?(m|mx|my|mt|mr|mb|ml)-\[(?:\d+(?:\.\d+)?)px\]$/.test(c)),
    'margin-left': (_v, cls) => Array.from(cls).some(c => /^(?:-)?(ml|mx|m)-(?:\d+|\d+\.5)$/.test(c) || /^(?:-)?(ml|mx|m)-\[(?:\d+(?:\.\d+)?)px\]$/.test(c)),
    'margin-right': (_v, cls) => Array.from(cls).some(c => /^(?:-)?(mr|mx|m)-(?:\d+|\d+\.5)$/.test(c) || /^(?:-)?(mr|mx|m)-\[(?:\d+(?:\.\d+)?)px\]$/.test(c)),
    'margin-top': (_v, cls) => Array.from(cls).some(c => /^(?:-)?(mt|my|m)-(?:\d+|\d+\.5)$/.test(c) || /^(?:-)?(mt|my|m)-\[(?:\d+(?:\.\d+)?)px\]$/.test(c)),
    'margin-bottom': (_v, cls) => Array.from(cls).some(c => /^(?:-)?(mb|my|m)-(?:\d+|\d+\.5)$/.test(c) || /^(?:-)?(mb|my|m)-\[(?:\d+(?:\.\d+)?)px\]$/.test(c)),

    // === Epic1 新增：激进策略属性检查器 ===
    // 文本颜色: 当存在 text-[#xxx] 或 text-[rgba(...)] 时移除 color 属性
    'color': (_v, cls) => Array.from(cls).some(c => /^text-\[#[0-9a-fA-F]{3,8}\]$/.test(c) || /^text-\[rgba?\([^)]+\)\]$/.test(c)),

    // 背景颜色: 当存在 bg-[#xxx] 或 bg-[rgba(...)] 时移除 background-color/background 属性
    'background-color': (_v, cls) => Array.from(cls).some(c => /^bg-\[#[0-9a-fA-F]{3,8}\]$/.test(c) || /^bg-\[rgba?\([^)]+\)\]$/.test(c)),
    'background': (_v, cls) => Array.from(cls).some(c => /^bg-\[#[0-9a-fA-F]{3,8}\]$/.test(c) || /^bg-\[rgba?\([^)]+\)\]$/.test(c)),

    // 边框颜色: 当存在 border-[#xxx] 时移除 border-color 属性
    'border-color': (_v, cls) => Array.from(cls).some(c => /^border-\[#[0-9a-fA-F]{3,8}\]$/.test(c) || /^border-\[rgba?\([^)]+\)\]$/.test(c)),

    // 透明度: 当存在 opacity-[x] 时移除 opacity 属性
    'opacity': (_v, cls) => Array.from(cls).some(c => /^opacity-\[(?:0|1|0?\.\d+)\]$/.test(c)),

    // z-index: 当存在 z-[n] 时移除 z-index 属性
    'z-index': (_v, cls) => Array.from(cls).some(c => /^z-\[-?\d+\]$/.test(c)),

    // 边框宽度:
    // - 当存在 border-[npx] 类时移除 border-width 系属性
    // - 当宽度本身 < 0.5px 时，即使没有类也直接丢弃（视为“无边框”）
    'border-width': (v, cls) => {
      const raw = parsePx(v);
      if (raw !== null) {
        const n = normalizeBorderWidth(raw);
        if (n === null) return true; // 极小宽度：直接移除属性
      }
      return Array.from(cls).some(c => /^border-\[(?:\d+(?:\.\d+)?)px\]$/.test(c));
    },
    'border-top-width': (v, cls) => {
      const raw = parsePx(v);
      if (raw !== null) {
        const n = normalizeBorderWidth(raw);
        if (n === null) return true;
      }
      return Array.from(cls).some(c => /^border-t-\[(?:\d+(?:\.\d+)?)px\]$/.test(c));
    },
    'border-right-width': (v, cls) => {
      const raw = parsePx(v);
      if (raw !== null) {
        const n = normalizeBorderWidth(raw);
        if (n === null) return true;
      }
      return Array.from(cls).some(c => /^border-r-\[(?:\d+(?:\.\d+)?)px\]$/.test(c));
    },
    'border-bottom-width': (v, cls) => {
      const raw = parsePx(v);
      if (raw !== null) {
        const n = normalizeBorderWidth(raw);
        if (n === null) return true;
      }
      return Array.from(cls).some(c => /^border-b-\[(?:\d+(?:\.\d+)?)px\]$/.test(c));
    },
    'border-left-width': (v, cls) => {
      const raw = parsePx(v);
      if (raw !== null) {
        const n = normalizeBorderWidth(raw);
        if (n === null) return true;
      }
      return Array.from(cls).some(c => /^border-l-\[(?:\d+(?:\.\d+)?)px\]$/.test(c));
    },
    // 边框简写: border: <width> solid <color>
    // - 宽度 >= 0.5px：当存在 border-[width] + border-[color] + border-solid 时移除 border
    // - 宽度 < 0.5px：无论是否存在类，一律移除（视为“无边框”声明）
    'border': (v, cls) => {
      const m = v.match(/^(\d+(?:\.\d+)?)px\s+([a-z]+)\s+(.+)$/i);
      if (!m) return false;
      const raw = parseFloat(m[1]);
      const n = normalizeBorderWidth(raw);
      if (n === null) return true; // 极小宽度：直接丢弃 border 属性
      if (m[2].toLowerCase() !== 'solid') return false;
      const classesArr = Array.from(cls);
      const hasWidth = classesArr.some(c => /^border-\[(?:\d+(?:\.\d+)?)px\]$/.test(c));
      const hasColor = classesArr.some(c => /^border-\[#[0-9a-fA-F]{3,8}\]$/.test(c) || /^border-\[rgba?\([^)]+\)\]$/.test(c));
      const hasStyle = classesArr.some(c => c === 'border-solid');
      return hasWidth && hasColor && hasStyle;
    },

    // 阴影: 当存在 shadow-[...] 时移除 box-shadow 属性
    'box-shadow': (_v, cls) => Array.from(cls).some(c => /^shadow-\[.+\]$/.test(c)),
  };

  for (const [k, vRaw] of entries) {
    const v = vRaw.toLowerCase();
    const checker = cssToClassCheckers[k];
    if (checker && checker(v, classes)) continue;
    kept.push([k, vRaw]);
  }

  const result: UtilityMapResult = { classNames: Array.from(classes), remainingCss: stringifyCss(kept) };
  _cache.set(key, result);
  return result;
}

// Direct semantic → Tailwind class mapping, then merge with visual CSS conversion.
// 布局相关的 position/left/top/width/height 始终来源于 layout 信息，由这里统一生成类名，
// 这样渲染层可以安全地把对应的 inline 样式移除，避免两边重复维护。
export async function layoutToTailwindClasses(layout: LayoutInfo, extraCss: string, strategy: ClassStrategy = 'conservative'): Promise<UtilityMapResult> {
  const classes = new Set<string>();

  // 1. Position
  if (layout.position === 'absolute') {
    classes.add('absolute');
    // Left/Top
    if (typeof layout.left === 'number') {
      const x = Number.isInteger(layout.left) ? String(layout.left) : String(Number(layout.left.toFixed(2)));
      classes.add(`left-[${x}px]`);
    }
    if (typeof layout.top === 'number') {
      const y = Number.isInteger(layout.top) ? String(layout.top) : String(Number(layout.top.toFixed(2)));
      classes.add(`top-[${y}px]`);
    }
  } else if (layout.position === 'relative') {
    classes.add('relative');
  }

  // 2. Size (Width/Height)
  if (typeof layout.width === 'number' && layout.width >= 0) {
    const w = Number.isInteger(layout.width) ? String(layout.width) : String(Number(layout.width.toFixed(2)));
    classes.add(`w-[${w}px]`);
  }
  if (typeof layout.height === 'number' && layout.height >= 0) {
    const h = Number.isInteger(layout.height) ? String(layout.height) : String(Number(layout.height.toFixed(2)));
    classes.add(`h-[${h}px]`);
  }


  // Container semantics
  if (layout.display === 'flex') {
    classes.add('flex');
    if (layout.flexDirection === 'column') classes.add('flex-col');
    // wrap
    if (layout.flexWrap === 'wrap') classes.add('flex-wrap');
    // gap → arbitrary px
    if (typeof layout.gap === 'number' && layout.gap > 0) {
      const g = Number.isInteger(layout.gap) ? String(layout.gap) : String(Number(layout.gap.toFixed(2)).toString());
      classes.add(`gap-[${g}px]`);
    }
    // rowGap/columnGap when wrap
    if (layout.flexWrap === 'wrap') {
      const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2))));
      if (typeof (layout as any).rowGap === 'number' && (layout as any).rowGap > 0) {
        classes.add(`gap-y-[${fmt((layout as any).rowGap)}px]`);
      }
      if (typeof (layout as any).columnGap === 'number' && (layout as any).columnGap > 0) {
        classes.add(`gap-x-[${fmt((layout as any).columnGap)}px]`);
      }
    }
    // justify-content
    const jcMap: Record<string, string> = {
      'center': 'justify-center',
      'flex-end': 'justify-end',
      'space-between': 'justify-between',
      'space-around': 'justify-around',
      'space-evenly': 'justify-evenly',
    };
    if (layout.justifyContent && jcMap[layout.justifyContent]) classes.add(jcMap[layout.justifyContent]);
    // align-items
    const aiMap: Record<string, string> = {
      'center': 'items-center',
      'flex-start': 'items-start',
      'flex-end': 'items-end',
      'baseline': 'items-baseline',
    };
    if (layout.alignItems && aiMap[layout.alignItems]) classes.add(aiMap[layout.alignItems]);
  }

  // padding
  if (layout.padding) {
    const { t = 0, r = 0, b = 0, l = 0 } = layout.padding as any;
    const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2))));
    if (t === r && r === b && b === l && t !== 0) {
      classes.add(`p-[${fmt(t)}px]`);
    } else if (t === b && r === l && (t !== 0 || r !== 0)) {
      if (t !== 0) classes.add(`py-[${fmt(t)}px]`);
      if (r !== 0) classes.add(`px-[${fmt(r)}px]`);
    } else {
      if (t !== 0) classes.add(`pt-[${fmt(t)}px]`);
      if (r !== 0) classes.add(`pr-[${fmt(r)}px]`);
      if (b !== 0) classes.add(`pb-[${fmt(b)}px]`);
      if (l !== 0) classes.add(`pl-[${fmt(l)}px]`);
    }
  }

  // box-sizing
  if (layout.boxSizing === 'border-box') classes.add('box-border');
  if (layout.boxSizing === 'content-box') classes.add('box-content');

  // overflow
  if (layout.overflow === 'hidden') classes.add('overflow-hidden');

  // Flex item semantics
  if (typeof layout.flexGrow === 'number' && layout.flexGrow > 0) {
    classes.add('grow');
    classes.add('min-w-0');
    classes.add('min-h-0');
  }
  if (typeof layout.flexShrink === 'number' && layout.flexShrink === 0) classes.add('shrink-0');
  if (layout.flexBasis === 0) classes.add('basis-0');
  if (layout.flexBasis === 'auto') classes.add('basis-auto');
  const asMap: Record<string, string> = {
    'flex-start': 'self-start',
    'flex-end': 'self-end',
    'center': 'self-center',
    'stretch': 'self-stretch',
    'baseline': 'self-baseline',
  };
  if (layout.alignSelf && asMap[layout.alignSelf]) classes.add(asMap[layout.alignSelf]);

  // Visual CSS → utility classes（并返回剩余 CSS）
  const util = await cssToTailwindClasses(extraCss || '', strategy);
  for (const c of util.classNames) classes.add(c);
  return { classNames: Array.from(classes), remainingCss: util.remainingCss };
}
