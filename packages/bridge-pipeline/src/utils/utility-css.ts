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
    'h-auto': `${pre}.h-auto{height:auto;}`,
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
    'overflow-visible': `${pre}.overflow-visible{overflow:visible;}`,
    'overflow-hidden': `${pre}.overflow-hidden{overflow:hidden;}`,
    'overflow-auto': `${pre}.overflow-auto{overflow:auto;}`,
    'overflow-scroll': `${pre}.overflow-scroll{overflow:scroll;}`,
    'overflow-x-visible': `${pre}.overflow-x-visible{overflow-x:visible;}`,
    'overflow-x-hidden': `${pre}.overflow-x-hidden{overflow-x:hidden;}`,
    'overflow-x-auto': `${pre}.overflow-x-auto{overflow-x:auto;}`,
    'overflow-x-scroll': `${pre}.overflow-x-scroll{overflow-x:scroll;}`,
    'overflow-y-visible': `${pre}.overflow-y-visible{overflow-y:visible;}`,
    'overflow-y-hidden': `${pre}.overflow-y-hidden{overflow-y:hidden;}`,
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
    const m = c.match(/^leading-\[(\d+(?:\.\d+)?)px\]$/);
    if (m) {
      const val = parseFloat(m[1]);
      if (isFinite(val)) push(`${pre}.${escClassForSelector(c)}{line-height:${val}px;}`);
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

  return lines.join('\n');
}
