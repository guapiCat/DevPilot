import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'
import CssWorker from 'monaco-editor/language/css/css.worker?worker'
import HtmlWorker from 'monaco-editor/language/html/html.worker?worker'
import JsonWorker from 'monaco-editor/language/json/json.worker?worker'
import TsWorker from 'monaco-editor/language/typescript/ts.worker?worker'

globalThis.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    switch (label) {
      case 'json':
        return new JsonWorker()
      case 'css':
      case 'scss':
      case 'less':
        return new CssWorker()
      case 'html':
      case 'handlebars':
      case 'razor':
        return new HtmlWorker()
      case 'typescript':
      case 'javascript':
        return new TsWorker()
      default:
        return new EditorWorker()
    }
  }
}

monaco.editor.defineTheme('devpilot-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#15171c',
    'editor.foreground': '#e6e8eb',
    'editorGutter.background': '#15171c',
    'editorLineNumber.foreground': '#4b5260',
    'editorLineNumber.activeForeground': '#9aa3b0',
    'editor.lineHighlightBackground': '#1a1d23',
    'editor.selectionBackground': '#2a3a5c',
    'editorCursor.foreground': '#4f8cff',
    'editorWidget.background': '#1d2026',
    'editorWidget.border': '#2c313b',
    'editorSuggestWidget.background': '#1d2026',
    'editorSuggestWidget.border': '#2c313b',
    'editorHoverWidget.background': '#1d2026',
    'editorHoverWidget.border': '#2c313b',
    'scrollbarSlider.background': '#33394566',
    'scrollbarSlider.hoverBackground': '#41495799',
    'scrollbarSlider.activeBackground': '#414957cc'
  }
})

// 独立文件没有项目上下文，关闭语义校验，避免大量误报。
monaco.typescript.typescriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: true,
  noSyntaxValidation: false
})
monaco.typescript.javascriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: true,
  noSyntaxValidation: false
})

export { monaco }
