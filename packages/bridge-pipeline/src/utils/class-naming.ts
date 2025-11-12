/**
 * 语义化命名工具
 * 将 Figma 节点名称转换为合法的 CSS class 名称
 */

// 通用的、无意义的节点名称（不使用）
const GENERIC_NAMES = new Set([
  'frame',
  'group',
  'rectangle',
  'ellipse',
  'vector',
  'polygon',
  'star',
  'line',
  'text',
  'component',
  'instance',
]);

/**
 * 将 Figma 节点名称规范化为合法的 CSS class 名称
 * 
 * 规则：
 * 1. 转小写
 * 2. 只保留字母、数字、横杠、下划线
 * 3. 空格转横杠
 * 4. 多个横杠合并为一个
 * 5. 去掉首尾横杠
 */
export function sanitizeClassName(name: string): string {
  if (!name || typeof name !== 'string') return '';
  
  return name
    .toLowerCase()
    .trim()
    // 将空格和特殊字符转为横杠
    .replace(/[\s\(\)\[\]\{\}\/\\,\.]+/g, '-')
    // 只保留字母、数字、横杠、下划线
    .replace(/[^a-z0-9\-_]/g, '')
    // 多个横杠合并
    .replace(/--+/g, '-')
    // 去掉首尾横杠
    .replace(/^-+|-+$/g, '')
    // 限制长度（避免太长）
    .slice(0, 50);
}

/**
 * 判断是否应该使用语义化名称
 * 
 * 不使用的情况：
 * 1. 通用名称（frame, group 等）
 * 2. 带数字后缀的通用名称（frame-1, rectangle-2）
 * 3. 太短（少于 2 个字符）
 * 4. 纯数字
 */
export function shouldUseSemanticName(name: string): boolean {
  if (!name || typeof name !== 'string') return false;
  
  const sanitized = sanitizeClassName(name);
  
  // 太短
  if (sanitized.length < 2) return false;
  
  // 纯数字
  if (/^\d+$/.test(sanitized)) return false;
  
  // 通用名称
  if (GENERIC_NAMES.has(sanitized)) return false;
  
  // 通用名称 + 数字后缀（如 frame-1, rectangle-2）
  const baseMatch = sanitized.match(/^([a-z]+)-\d+$/);
  if (baseMatch && GENERIC_NAMES.has(baseMatch[1])) return false;
  
  return true;
}

/**
 * 获取节点的语义化 class 名称
 * 
 * @param nodeName Figma 节点名称
 * @param fallback 如果不应该使用语义化名称时的回退值（默认 'frame'）
 * @returns CSS class 名称
 */
export function getSemanticClassName(nodeName: string, fallback: string = 'frame'): string {
  const sanitized = sanitizeClassName(nodeName);
  return shouldUseSemanticName(nodeName) ? sanitized : fallback;
}

/**
 * 生成带命名空间的 class 名称（避免冲突）
 * 
 * @param nodeName Figma 节点名称
 * @param nodeId Figma 节点 ID（用于唯一性）
 * @param useNamespace 是否使用命名空间前缀
 */
export function getScopedClassName(
  nodeName: string, 
  nodeId: string,
  useNamespace: boolean = false
): string {
  const semantic = getSemanticClassName(nodeName);
  
  if (!useNamespace || semantic === 'frame') {
    return semantic;
  }
  
  // 使用 ID 的一部分作为后缀，确保唯一性
  const idSuffix = nodeId.replace(/[^a-z0-9]/gi, '').slice(-6).toLowerCase();
  return `${semantic}-${idSuffix}`;
}

/**
 * 测试示例（取消注释运行）:
 * 
 * const testCases = [
 *   'Cover',           → 'cover'
 *   'Frame 7',         → 'frame' (通用名称)
 *   'Dimensions Card', → 'dimensions-card'
 *   'Button (primary)',→ 'button-primary'
 *   '按钮组',          → (空，非英文)
 *   'shadcn/ui',       → 'shadcn-ui'
 * ];
 */
