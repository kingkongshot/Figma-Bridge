type AssetType = 'image' | 'svg';
type AssetUrlProvider = (id: string, type: AssetType, data?: string) => string;

/**
 * Create asset URL provider for CLI tools
 * @param absolutePath - Whether to use absolute paths (e.g., /images/) or relative (e.g., images/)
 */
export function createAssetUrlProvider(absolutePath = false): AssetUrlProvider {
  const prefix = absolutePath ? '/' : '';

  return (id: string, type: 'image' | 'svg', data?: string) => {
    if (type === 'image') return `${prefix}images/${id}.png`;
    if (type === 'svg' && data) {
      const encoded = Buffer.from(data).toString('base64');
      return `data:image/svg+xml;base64,${encoded}`;
    }
    return `${prefix}svgs/${id}`;
  };
}
