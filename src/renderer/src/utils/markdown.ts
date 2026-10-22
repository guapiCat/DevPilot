import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js/lib/common'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const markdown = new MarkdownIt({
  // 关闭原始 HTML，模型输出中的标签会被转义，避免注入。
  html: false,
  linkify: true,
  breaks: true,
  highlight(code, language) {
    const languageClass = language?.replace(/[^a-zA-Z0-9_+-]/g, '') ?? ''

    if (language && hljs.getLanguage(language)) {
      try {
        const highlighted = hljs.highlight(code, {
          language,
          ignoreIllegals: true
        }).value
        return `<pre class="md-code"><code class="hljs language-${languageClass}">${highlighted}</code></pre>`
      } catch {
        // 高亮失败时退回纯文本代码块。
      }
    }

    return `<pre class="md-code"><code class="hljs">${escapeHtml(code)}</code></pre>`
  }
})

const defaultLinkOpen =
  markdown.renderer.rules.link_open ??
  ((tokens, index, options, _env, self) => self.renderToken(tokens, index, options))

markdown.renderer.rules.link_open = (tokens, index, options, env, self) => {
  tokens[index].attrSet('target', '_blank')
  tokens[index].attrSet('rel', 'noreferrer noopener')
  return defaultLinkOpen(tokens, index, options, env, self)
}

// 远程图片会被 CSP 拦截且可能泄露访问信息，只保留替代文本。
markdown.renderer.rules.image = (tokens, index) => escapeHtml(tokens[index].content)

export function renderMarkdown(content: string): string {
  return markdown.render(content)
}
