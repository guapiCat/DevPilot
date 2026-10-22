import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '@renderer/utils/markdown'

describe('renderMarkdown', () => {
  it('渲染表格', () => {
    const html = renderMarkdown('| 名称 | 值 |\n| --- | --- |\n| a | 1 |')

    expect(html).toContain('<table>')
    expect(html).toContain('<th>名称</th>')
    expect(html).toContain('<td>1</td>')
  })

  it('为围栏代码块添加语法高亮', () => {
    const html = renderMarkdown('```ts\nconst value: number = 1\n```')

    expect(html).toContain('class="hljs language-ts"')
    expect(html).toContain('hljs-keyword')
  })

  it('转义原始 HTML 与未知语言的代码', () => {
    const html = renderMarkdown('<script>alert(1)</script>\n\n```foo\n<b>x</b>\n```')

    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;')
  })

  it('拒绝 javascript: 链接并给外链加 target', () => {
    expect(renderMarkdown('[x](javascript:alert(1))')).not.toContain('href="javascript:')

    const html = renderMarkdown('[文档](https://example.com)')

    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noreferrer noopener"')
  })

  it('图片只保留替代文本，不产生 img 标签', () => {
    const html = renderMarkdown('![示意图](https://example.com/a.png)')

    expect(html).not.toContain('<img')
    expect(html).toContain('示意图')
  })

  it('保留聊天中的单个换行', () => {
    expect(renderMarkdown('第一行\n第二行')).toContain('<br>')
  })
})
