export class CssCollector {
  private rules: string[] = [];

  addRule(selector: string, props: string): void {
    if (!props.trim()) return;
    this.rules.push(`${selector} { ${props} }`);
  }

  toString(): string {
    return this.rules.join('\n    ');
  }

  isEmpty(): boolean {
    return this.rules.length === 0;
  }
}
