export function buildUtilityCssSelective(classes: Iterable<string>, scope?: string): string {
  const pre = scope ? `${scope} ` : '';
  const lines: string[] = [];
  const set = new Set<string>();
  for (const c of classes || []) { if (c) set.add(c); }

  function push(rule: string) { if (rule) lines.push(rule); }
  function escClassForSelector(cls: string): string {
    return cls.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
  }
  function spacingPx(token: string): number | null {
    if (!/^\d+(?:\.5)?$/.test(token)) return null;
    const n = parseFloat(token);
    if (!isFinite(n)) return null;
    return n * 4;
  }

  const simple: Record<string, string> = {
    'block': `${pre}.block{display:block;}`,
    'flex': `${pre}.flex{display:flex;}`,
    'inline-flex': `${pre}.inline-flex{display:inline-flex;}`,
    'flex-col': `${pre}.flex-col{flex-direction:column;}`,
    'flex-wrap': `${pre}.flex-wrap{flex-wrap:wrap;}`,
    'flex-nowrap': `${pre}.flex-nowrap{flex-wrap:nowrap;}`,
    'flex-wrap-reverse': `${pre}.flex-wrap-reverse{flex-wrap:wrap-reverse;}`,
    'justify-center': `${pre}.justify-center{justify-content:center;}`,
    'justify-end': `${pre}.justify-end{justify-content:flex-end;}`,
    'justify-between': `${pre}.justify-between{justify-content:space-between;}`,
    'justify-around': `${pre}.justify-around{justify-content:space-around;}`,
    'justify-evenly': `${pre}.justify-evenly{justify-content:space-evenly;}`,
    'items-start': `${pre}.items-start{align-items:flex-start;}`,
    'items-center': `${pre}.items-center{align-items:center;}`,
    'items-end': `${pre}.items-end{align-items:flex-end;}`,
    'items-baseline': `${pre}.items-baseline{align-items:baseline;}`,
    'self-start': `${pre}.self-start{align-self:flex-start;}`,
    'self-end': `${pre}.self-end{align-self:flex-end;}`,
    'self-center': `${pre}.self-center{align-self:center;}`,
    'self-stretch': `${pre}.self-stretch{align-self:stretch;}`,
    'self-baseline': `${pre}.self-baseline{align-self:baseline;}`,
    'shrink-0': `${pre}.shrink-0{flex-shrink:0;}`,
    'grow': `${pre}.grow{flex-grow:1;}`,
    'basis-0': `${pre}.basis-0{flex-basis:0px;}`,
    'basis-auto': `${pre}.basis-auto{flex-basis:auto;}`,
    'w-auto': `${pre}.w-auto{width:auto;}`,
    'w-full': `${pre}.w-full{width:100%;}`,
    'h-full': `${pre}.h-full{height:100%;}`,
    'h-auto': `${pre}.h-auto{height:auto;}`,
    'min-w-0': `${pre}.min-w-0{min-width:0px;}`,
    'min-h-0': `${pre}.min-h-0{min-height:0px;}`,
    // position
    'absolute': `${pre}.absolute{position:absolute;}`,
    'relative': `${pre}.relative{position:relative;}`,
    'fixed': `${pre}.fixed{position:fixed;}`,
    'sticky': `${pre}.sticky{position:sticky;}`,
    // inset
    'inset-0': `${pre}.inset-0{inset:0px;}`,
    // left/top/right/bottom: 0 和 auto
    'left-0': `${pre}.left-0{left:0px;}`,
    'left-auto': `${pre}.left-auto{left:auto;}`,
    'top-0': `${pre}.top-0{top:0px;}`,
    'top-auto': `${pre}.top-auto{top:auto;}`,
    'right-0': `${pre}.right-0{right:0px;}`,
    'right-auto': `${pre}.right-auto{right:auto;}`,
    'bottom-0': `${pre}.bottom-0{bottom:0px;}`,
    'bottom-auto': `${pre}.bottom-auto{bottom:auto;}`,
    'box-border': `${pre}.box-border{box-sizing:border-box;}`,
    'box-content': `${pre}.box-content{box-sizing:content-box;}`,
    'text-left': `${pre}.text-left{text-align:left;}`,
    'text-center': `${pre}.text-center{text-align:center;}`,
    'text-right': `${pre}.text-right{text-align:right;}`,
    'text-justify': `${pre}.text-justify{text-align:justify;}`,
    'whitespace-normal': `${pre}.whitespace-normal{white-space:normal;}`,
    'whitespace-nowrap': `${pre}.whitespace-nowrap{white-space:nowrap;}`,
    'whitespace-pre': `${pre}.whitespace-pre{white-space:pre;}`,
    'whitespace-pre-wrap': `${pre}.whitespace-pre-wrap{white-space:pre-wrap;}`,
    'italic': `${pre}.italic{font-style:italic;}`,
    'not-italic': `${pre}.not-italic{font-style:normal;}`,
    'underline': `${pre}.underline{text-decoration-line:underline;}`,
    'line-through': `${pre}.line-through{text-decoration-line:line-through;}`,
    'no-underline': `${pre}.no-underline{text-decoration-line:none;}`,
    'overflow-visible': `${pre}.overflow-visible{overflow:visible;}`,
    'overflow-hidden': `${pre}.overflow-hidden{overflow:hidden;}`,
    'overflow-auto': `${pre}.overflow-auto{overflow:auto;}`,
    'overflow-scroll': `${pre}.overflow-scroll{overflow:scroll;}`,
    'overflow-x-visible': `${pre}.overflow-x-visible{overflow-x:visible;}`,
    'overflow-x-hidden': `${pre}.overflow-x-hidden{overflow-x:hidden;}`,
    'overflow-x-auto': `${pre}.overflow-x-auto{overflow-x:auto;}`,
    'overflow-x-scroll': `${pre}.overflow-x-scroll{overflow-x:scroll;}`,
    'overflow-y-visible': `${pre}.overflow-y-visible{overflow-y:visible;}`,
    'bg-center': `${pre}.bg-center{background-position:center;}`,
    'bg-no-repeat': `${pre}.bg-no-repeat{background-repeat:no-repeat;}`,
    'bg-auto': `${pre}.bg-auto{background-size:auto;}`,
    'bg-cover': `${pre}.bg-cover{background-size:cover;}`,
    'overflow-y-hidden': `${pre}.overflow-y-hidden{overflow-y:hidden;}`,
    'border-solid': `${pre}.border-solid{border-style:solid;}`,
    'overflow-y-auto': `${pre}.overflow-y-auto{overflow-y:auto;}`,
    'overflow-y-scroll': `${pre}.overflow-y-scroll{overflow-y:scroll;}`,
  };
  for (const k of Object.keys(simple)) {
    if (set.has(k)) push(simple[k]);
  }

  for (const c of set) {
    const m = c.match(/^gap-(\d+(?:\.5)?)$/);
    if (m) {
      const px = spacingPx(m[1]);
      if (px !== null) push(`${pre}.${escClassForSelector(c)}{gap:${px}px;}`);
    }
  }
  for (const c of set) {
    const mx = c.match(/^gap-x-(\d+(?:\.5)?)$/);
    if (mx) {
      const px = spacingPx(mx[1]);
      if (px !== null) push(`${pre}.${escClassForSelector(c)}{column-gap:${px}px;}`);
      continue;
    }
    const my = c.match(/^gap-y-(\d+(?:\.5)?)$/);
    if (my) {
      const px = spacingPx(my[1]);
      if (px !== null) push(`${pre}.${escClassForSelector(c)}{row-gap:${px}px;}`);
      continue;
    }
  }
  for (const c of set) {
    const m = c.match(/^gap-\[(\d+(?:\.\d+)?)px\]$/);
    if (m) {
      const val = parseFloat(m[1]);
      if (isFinite(val)) push(`${pre}.${escClassForSelector(c)}{gap:${val}px;}`);
    }
  }
  for (const c of set) {
    const m = c.match(/^rounded-\[(\d+(?:\.\d+)?)px\]$/);
    if (m) {
      const val = parseFloat(m[1]);
      if (isFinite(val)) push(`${pre}.${escClassForSelector(c)}{border-radius:${val}px;}`);
    }
  }
  for (const c of set) {
    const w = c.match(/^outline-(\d+)$/);
    if (w) {
      push(`${pre}.${escClassForSelector(c)}{outline-width:${parseInt(w[1],10)}px;outline-style:solid;}`);
      continue;
    }
    const oo = c.match(/^outline-offset-(\d+)$/);
    if (oo) {
      push(`${pre}.${escClassForSelector(c)}{outline-offset:${parseInt(oo[1],10)}px;}`);
      continue;
    }
    const oc = c.match(/^outline-\[(.+)\]$/);
    if (oc) {
      push(`${pre}.${escClassForSelector(c)}{outline-color:${oc[1]};}`);
      continue;
    }
  }
  for (const c of set) {
    const m = c.match(/^text-\[(\d+(?:\.\d+)?)px\]$/);
    if (m) {
      const val = parseFloat(m[1]);
      if (isFinite(val)) push(`${pre}.${escClassForSelector(c)}{font-size:${val}px;}`);
    }
  }
  for (const c of set) {
    const mPx = c.match(/^leading-\[(\d+(?:\.\d+)?)px\]$/);
    if (mPx) {
      const val = parseFloat(mPx[1]);
      if (isFinite(val)) push(`${pre}.${escClassForSelector(c)}{line-height:${val}px;}`);
      continue;
    }
    const mPct = c.match(/^leading-\[(\d+(?:\.\d+)?)%\]$/);
    if (mPct) {
      const val = parseFloat(mPct[1]);
      if (isFinite(val)) push(`${pre}.${escClassForSelector(c)}{line-height:${val}%;}`);
      continue;
    }
  }
  for (const c of set) {
    const mpx = c.match(/^tracking-\[(-?\d+(?:\.\d+)?)px\]$/i);
    if (mpx) {
      const val = parseFloat(mpx[1]);
      if (!Number.isNaN(val)) push(`${pre}.${escClassForSelector(c)}{letter-spacing:${val}px;}`);
      continue;
    }
    const mem = c.match(/^tracking-\[(-?\d+(?:\.\d+)?)em\]$/i);
    if (mem) {
      const val = parseFloat(mem[1]);
      if (!Number.isNaN(val)) push(`${pre}.${escClassForSelector(c)}{letter-spacing:${val}em;}`);
      continue;
    }
  }
  const weightMap: Record<string,string> = {
    'font-thin': '100',
    'font-extralight': '200',
    'font-light': '300',
    'font-normal': '400',
    'font-medium': '500',
    'font-semibold': '600',
    'font-bold': '700',
    'font-extrabold': '800',
    'font-black': '900',
  };
  for (const k of Object.keys(weightMap)) {
    if (set.has(k)) push(`${pre}.${escClassForSelector(k)}{font-weight:${weightMap[k]};}`);
  }
  // font-[n]
  for (const c of set) {
    const m = c.match(/^font-\[(\d+)\]$/);
    if (m) {
      push(`${pre}.${escClassForSelector(c)}{font-weight:${parseInt(m[1],10)};}`);
    }
  }
  // gap-x-[<px>] / gap-y-[<px>]
  for (const c of set) {
    const mx = c.match(/^gap-x-\[(\d+(?:\.\d+)?)px\]$/);
    if (mx) {
      const val = parseFloat(mx[1]);
      if (isFinite(val)) push(`${pre}.${escClassForSelector(c)}{column-gap:${val}px;}`);
      continue;
    }
    const my = c.match(/^gap-y-\[(\d+(?:\.\d+)?)px\]$/);
    if (my) {
      const val = parseFloat(my[1]);
      if (isFinite(val)) push(`${pre}.${escClassForSelector(c)}{row-gap:${val}px;}`);
      continue;
    }
  }
  // size arbitrary: w-[px] / h-[px]
  for (const c of set) {
    const mw = c.match(/^w-\[(\d+(?:\.\d+)?)px\]$/);
    if (mw) {
      const val = parseFloat(mw[1]);
      if (isFinite(val)) push(`${pre}.${escClassForSelector(c)}{width:${val}px;}`);
      continue;
    }
    const mh = c.match(/^h-\[(\d+(?:\.\d+)?)px\]$/);
    if (mh) {
      const val = parseFloat(mh[1]);
      if (isFinite(val)) push(`${pre}.${escClassForSelector(c)}{height:${val}px;}`);
      continue;
    }
    // min-width/min-height arbitrary: min-w-[Xpx] / min-h-[Xpx]
    const minW = c.match(/^min-w-\[(\d+(?:\.\d+)?)px\]$/);
    if (minW) {
      const val = parseFloat(minW[1]);
      if (isFinite(val)) push(`${pre}.${escClassForSelector(c)}{min-width:${val}px;}`);
      continue;
    }
    const minH = c.match(/^min-h-\[(\d+(?:\.\d+)?)px\]$/);
    if (minH) {
      const val = parseFloat(minH[1]);
      if (isFinite(val)) push(`${pre}.${escClassForSelector(c)}{min-height:${val}px;}`);
      continue;
    }
  }
  // border-radius arbitrary: rounded-[v]
  for (const c of set) {
    const m = c.match(/^rounded-\[([^\]]+)\]$/);
    if (m) {
      push(`${pre}.${escClassForSelector(c)}{border-radius:${m[1]};}`);
    }
  }
  // per-corner border-radius arbitrary: rounded-tl/tr/br/bl-[v]
  for (const c of set) {
    const m = c.match(/^rounded-(tl|tr|br|bl)-\[([^\]]+)\]$/);
    if (m) {
      const corner = m[1];
      const value = m[2];
      let prop = '';
      if (corner === 'tl') prop = 'border-top-left-radius';
      else if (corner === 'tr') prop = 'border-top-right-radius';
      else if (corner === 'br') prop = 'border-bottom-right-radius';
      else prop = 'border-bottom-left-radius';
      push(`${pre}.${escClassForSelector(c)}{${prop}:${value};}`);
    }
  }
  // left/top/right/bottom arbitrary: left-[Xpx], top-[Xpx], etc. (支持负值)
  for (const c of set) {
    const m = c.match(/^(left|top|right|bottom)-\[(-?\d+(?:\.\d+)?)px\]$/);
    if (m) {
      const prop = m[1];
      const val = parseFloat(m[2]);
      if (isFinite(val)) push(`${pre}.${escClassForSelector(c)}{${prop}:${val}px;}`);
    }
  }
  // inset arbitrary: inset-[Xpx] (支持负值)
  for (const c of set) {
    const m = c.match(/^inset-\[(-?\d+(?:\.\d+)?)px\]$/);
    if (m) {
      const val = parseFloat(m[1]);
      if (isFinite(val)) push(`${pre}.${escClassForSelector(c)}{inset:${val}px;}`);
    }
  }
  // padding
  type SpacingRule = { pattern: RegExp; props: string[]; negative?: boolean };
  const paddingRules: SpacingRule[] = [
    { pattern: /^p-(\d+(?:\.5)?)$/, props: ['padding'] },
    { pattern: /^px-(\d+(?:\.5)?)$/, props: ['padding-left', 'padding-right'] },
    { pattern: /^py-(\d+(?:\.5)?)$/, props: ['padding-top', 'padding-bottom'] },
    { pattern: /^pt-(\d+(?:\.5)?)$/, props: ['padding-top'] },
    { pattern: /^pr-(\d+(?:\.5)?)$/, props: ['padding-right'] },
    { pattern: /^pb-(\d+(?:\.5)?)$/, props: ['padding-bottom'] },
    { pattern: /^pl-(\d+(?:\.5)?)$/, props: ['padding-left'] },
  ];
  for (const c of set) {
    for (const rule of paddingRules) {
      const m = c.match(rule.pattern);
      if (!m) continue;
      const px = spacingPx(m[1]);
      if (px === null) break;
      const value = `${px}px`;
      const decls = rule.props.map(p => `${p}:${value}`).join(';');
      push(`${pre}.${escClassForSelector(c)}{${decls};}`);
      break;
    }
  }
  // padding arbitrary [px]
  const paddingArbRules: SpacingRule[] = [
    { pattern: /^p-\[(\d+(?:\.\d+)?)px\]$/, props: ['padding'] },
    { pattern: /^px-\[(\d+(?:\.\d+)?)px\]$/, props: ['padding-left', 'padding-right'] },
    { pattern: /^py-\[(\d+(?:\.\d+)?)px\]$/, props: ['padding-top', 'padding-bottom'] },
    { pattern: /^pt-\[(\d+(?:\.\d+)?)px\]$/, props: ['padding-top'] },
    { pattern: /^pr-\[(\d+(?:\.\d+)?)px\]$/, props: ['padding-right'] },
    { pattern: /^pb-\[(\d+(?:\.\d+)?)px\]$/, props: ['padding-bottom'] },
    { pattern: /^pl-\[(\d+(?:\.\d+)?)px\]$/, props: ['padding-left'] },
  ];
  for (const c of set) {
    for (const rule of paddingArbRules) {
      const m = c.match(rule.pattern);
      if (!m) continue;
      const val = parseFloat(m[1]);
      if (!isFinite(val)) break;
      const value = `${val}px`;
      const decls = rule.props.map(p => `${p}:${value}`).join(';');
      push(`${pre}.${escClassForSelector(c)}{${decls};}`);
      break;
    }
  }
  // margin (supports negative)
  const marginRules: SpacingRule[] = [
    { pattern: /^(-)?m-(\d+(?:\.5)?)$/, props: ['margin'], negative: true },
    { pattern: /^(-)?mx-(\d+(?:\.5)?)$/, props: ['margin-left', 'margin-right'], negative: true },
    { pattern: /^(-)?my-(\d+(?:\.5)?)$/, props: ['margin-top', 'margin-bottom'], negative: true },
    { pattern: /^(-)?mt-(\d+(?:\.5)?)$/, props: ['margin-top'], negative: true },
    { pattern: /^(-)?mr-(\d+(?:\.5)?)$/, props: ['margin-right'], negative: true },
    { pattern: /^(-)?mb-(\d+(?:\.5)?)$/, props: ['margin-bottom'], negative: true },
    { pattern: /^(-)?ml-(\d+(?:\.5)?)$/, props: ['margin-left'], negative: true },
  ];
  for (const c of set) {
    for (const rule of marginRules) {
      const m = c.match(rule.pattern);
      if (!m) continue;
      const neg = !!(rule.negative && m[1]);
      const token = rule.negative ? m[2] : m[1];
      const px = spacingPx(token);
      if (px === null) break;
      const value = `${neg ? '-' : ''}${px}px`;
      const decls = rule.props.map(p => `${p}:${value}`).join(';');
      push(`${pre}.${escClassForSelector(c)}{${decls};}`);
      break;
    }
  }
  // margin arbitrary [px] (supports negative)
  const marginArbRules: SpacingRule[] = [
    { pattern: /^(-)?m-\[(\d+(?:\.\d+)?)px\]$/, props: ['margin'], negative: true },
    { pattern: /^(-)?mx-\[(\d+(?:\.\d+)?)px\]$/, props: ['margin-left', 'margin-right'], negative: true },
    { pattern: /^(-)?my-\[(\d+(?:\.\d+)?)px\]$/, props: ['margin-top', 'margin-bottom'], negative: true },
    { pattern: /^(-)?mt-\[(\d+(?:\.\d+)?)px\]$/, props: ['margin-top'], negative: true },
    { pattern: /^(-)?mr-\[(\d+(?:\.\d+)?)px\]$/, props: ['margin-right'], negative: true },
    { pattern: /^(-)?mb-\[(\d+(?:\.\d+)?)px\]$/, props: ['margin-bottom'], negative: true },
    { pattern: /^(-)?ml-\[(\d+(?:\.\d+)?)px\]$/, props: ['margin-left'], negative: true },
  ];
  for (const c of set) {
    for (const rule of marginArbRules) {
      const m = c.match(rule.pattern);
      if (!m) continue;
      const neg = !!(rule.negative && m[1]);
      const token = m[2];
      const val = parseFloat(token);
      if (!isFinite(val)) break;
      const value = `${neg ? '-' : ''}${val}px`;
      const decls = rule.props.map(p => `${p}:${value}`).join(';');
      push(`${pre}.${escClassForSelector(c)}{${decls};}`);
      break;
    }
  }

  // === Epic1 新增：激进策略类名 CSS 规则生成 ===

  // 文本颜色: text-[#xxx] 或 text-[rgba(...)]
  for (const c of set) {
    const hex = c.match(/^text-\[(#[0-9a-fA-F]{3,8})\]$/);
    if (hex) {
      push(`${pre}.${escClassForSelector(c)}{color:${hex[1]};}`);
      continue;
    }
    const rgba = c.match(/^text-\[(rgba?\([^)]+\))\]$/);
    if (rgba) {
      push(`${pre}.${escClassForSelector(c)}{color:${rgba[1]};}`);
      continue;
    }
  }

  // 背景颜色: bg-[#xxx] 或 bg-[rgba(...)]
  for (const c of set) {
    const hex = c.match(/^bg-\[(#[0-9a-fA-F]{3,8})\]$/);
    if (hex) {
      push(`${pre}.${escClassForSelector(c)}{background-color:${hex[1]};}`);
      continue;
    }
    const rgba = c.match(/^bg-\[(rgba?\([^)]+\))\]$/);
    if (rgba) {
      push(`${pre}.${escClassForSelector(c)}{background-color:${rgba[1]};}`);
      continue;
    }
  }

  // 边框颜色: border-[#xxx] 或 border-[rgba(...)]（仅颜色，非宽度）
  for (const c of set) {
    const hex = c.match(/^border-\[(#[0-9a-fA-F]{3,8})\]$/);
    if (hex) {
      push(`${pre}.${escClassForSelector(c)}{border-color:${hex[1]};}`);
      continue;
    }
    const rgba = c.match(/^border-\[(rgba?\([^)]+\))\]$/);
    if (rgba) {
      push(`${pre}.${escClassForSelector(c)}{border-color:${rgba[1]};}`);
      continue;
    }
  }

  // 透明度: opacity-[x]
  for (const c of set) {
    const m = c.match(/^opacity-\[(0|1|0?\.\d+)\]$/);
    if (m) {
      push(`${pre}.${escClassForSelector(c)}{opacity:${m[1]};}`);
    }
  }

  // z-index: z-[n] 或 z-[-n]
  for (const c of set) {
    const m = c.match(/^z-\[(-?\d+)\]$/);
    if (m) {
      push(`${pre}.${escClassForSelector(c)}{z-index:${m[1]};}`);
    }
  }

  // 边框宽度: border-[npx]
  for (const c of set) {
    const m = c.match(/^border-\[(\d+(?:\.\d+)?)px\]$/);
    if (m) {
      push(`${pre}.${escClassForSelector(c)}{border-width:${m[1]}px;}`);
    }
  }

  // 各方向边框宽度: border-t/r/b/l-[npx]
  for (const c of set) {
    const mt = c.match(/^border-t-\[(\d+(?:\.\d+)?)px\]$/);
    if (mt) {
      push(`${pre}.${escClassForSelector(c)}{border-top-width:${mt[1]}px;}`);
      continue;
    }
    const mr = c.match(/^border-r-\[(\d+(?:\.\d+)?)px\]$/);
    if (mr) {
      push(`${pre}.${escClassForSelector(c)}{border-right-width:${mr[1]}px;}`);
      continue;
    }
    const mb = c.match(/^border-b-\[(\d+(?:\.\d+)?)px\]$/);
    if (mb) {
      push(`${pre}.${escClassForSelector(c)}{border-bottom-width:${mb[1]}px;}`);
      continue;
    }
    const ml = c.match(/^border-l-\[(\d+(?:\.\d+)?)px\]$/);
    if (ml) {
      push(`${pre}.${escClassForSelector(c)}{border-left-width:${ml[1]}px;}`);
      continue;
    }
  }

  // 阴影: shadow-[...] - 将下划线还原为空格
  for (const c of set) {
    const m = c.match(/^shadow-\[(.+)\]$/);
    if (m) {
      // 类名中使用下划线代替空格，需要还原
      const shadowValue = m[1].replace(/_/g, ' ');
      push(`${pre}.${escClassForSelector(c)}{box-shadow:${shadowValue};}`);
    }
  }

  return lines.join('\n');
}
