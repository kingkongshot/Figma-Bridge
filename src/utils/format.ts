import { html as htmlBeautify, css as cssBeautify } from 'js-beautify';

export function formatHtml(raw: string): string {
  return htmlBeautify(raw, {
    indent_size: 2,
    wrap_line_length: 0,
    preserve_newlines: false,
    max_preserve_newlines: 1,
    indent_inner_html: true,
    wrap_attributes: 'force-expand-multiline',
    content_unformatted: ['span'],
  });
}

export function formatCss(raw: string): string {
  return cssBeautify(raw, {
    indent_size: 2,
    selector_separator_newline: true,
    newline_between_rules: true,
    preserve_newlines: false,
  });
}

