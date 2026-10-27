// 自定义 Monaco 入口：与 monaco-editor 0.57 的 esm/vs/editor/editor.main.js 对齐，
// 仅裁剪语言定义以减小体积。升级 monaco-editor 时需同步检查 editor.main.js 的贡献列表。
import * as monaco from 'monaco-editor/editor/editor.api'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'
import CssWorker from 'monaco-editor/language/css/css.worker?worker'
import HtmlWorker from 'monaco-editor/language/html/html.worker?worker'
import JsonWorker from 'monaco-editor/language/json/json.worker?worker'
import TsWorker from 'monaco-editor/language/typescript/ts.worker?worker'

import 'monaco-editor/languages/definitions/bat/register'
import 'monaco-editor/languages/definitions/cpp/register'
import 'monaco-editor/languages/definitions/csharp/register'
import 'monaco-editor/languages/definitions/css/register'
import 'monaco-editor/languages/definitions/dockerfile/register'
import 'monaco-editor/languages/definitions/go/register'
import 'monaco-editor/languages/definitions/graphql/register'
import 'monaco-editor/languages/definitions/html/register'
import 'monaco-editor/languages/definitions/ini/register'
import 'monaco-editor/languages/definitions/java/register'
import 'monaco-editor/languages/definitions/javascript/register'
import 'monaco-editor/languages/definitions/kotlin/register'
import 'monaco-editor/languages/definitions/less/register'
import 'monaco-editor/languages/definitions/lua/register'
import 'monaco-editor/languages/definitions/markdown/register'
import 'monaco-editor/languages/definitions/mdx/register'
import 'monaco-editor/languages/definitions/perl/register'
import 'monaco-editor/languages/definitions/php/register'
import 'monaco-editor/languages/definitions/powershell/register'
import 'monaco-editor/languages/definitions/protobuf/register'
import 'monaco-editor/languages/definitions/python/register'
import 'monaco-editor/languages/definitions/r/register'
import 'monaco-editor/languages/definitions/ruby/register'
import 'monaco-editor/languages/definitions/rust/register'
import 'monaco-editor/languages/definitions/scala/register'
import 'monaco-editor/languages/definitions/scss/register'
import 'monaco-editor/languages/definitions/shell/register'
import 'monaco-editor/languages/definitions/sql/register'
import 'monaco-editor/languages/definitions/swift/register'
import 'monaco-editor/languages/definitions/typescript/register'
import 'monaco-editor/languages/definitions/xml/register'
import 'monaco-editor/languages/definitions/yaml/register'

import 'monaco-editor/languages/features/css/register'
import 'monaco-editor/languages/features/html/register'
import 'monaco-editor/languages/features/json/register'
import { javascriptDefaults, typescriptDefaults } from 'monaco-editor/languages/features/typescript/register'

import 'monaco-editor/editor/contrib/anchorSelect/browser/anchorSelect'
import 'monaco-editor/editor/contrib/bracketMatching/browser/bracketMatching'
import 'monaco-editor/editor/contrib/caretOperations/browser/transpose'
import 'monaco-editor/editor/contrib/clipboard/browser/clipboard'
import 'monaco-editor/editor/contrib/codeAction/browser/codeActionContributions'
import 'monaco-editor/editor/browser/widget/codeEditor/codeEditorWidget'
import 'monaco-editor/editor/contrib/codelens/browser/codelensController'
import 'monaco-editor/base/browser/ui/codicons/codicon/codicon.css'
import 'monaco-editor/editor/contrib/colorPicker/browser/colorPickerContribution'
import 'monaco-editor/editor/contrib/comment/browser/comment'
import 'monaco-editor/editor/contrib/contextmenu/browser/contextmenu'
import 'monaco-editor/editor/contrib/cursorUndo/browser/cursorUndo'
import 'monaco-editor/editor/browser/widget/diffEditor/diffEditor.contribution'
import 'monaco-editor/editor/contrib/diffEditorBreadcrumbs/browser/contribution'
import 'monaco-editor/editor/contrib/dnd/browser/dnd'
import 'monaco-editor/editor/contrib/documentSymbols/browser/documentSymbols'
import 'monaco-editor/editor/contrib/dropOrPasteInto/browser/dropIntoEditorContribution'
import 'monaco-editor/features/find/register'
import 'monaco-editor/editor/contrib/floatingMenu/browser/floatingMenu.contribution'
import 'monaco-editor/editor/contrib/folding/browser/folding'
import 'monaco-editor/editor/contrib/fontZoom/browser/fontZoom'
import 'monaco-editor/editor/contrib/format/browser/formatActions'
import 'monaco-editor/editor/contrib/gotoError/browser/gotoError'
import 'monaco-editor/editor/standalone/browser/quickAccess/standaloneGotoLineQuickAccess'
import 'monaco-editor/editor/contrib/gotoSymbol/browser/link/goToDefinitionAtPosition'
import 'monaco-editor/editor/contrib/gpu/browser/gpuActions'
import 'monaco-editor/editor/contrib/hover/browser/hoverContribution'
import 'monaco-editor/editor/contrib/indentation/browser/indentation'
import 'monaco-editor/editor/contrib/inlayHints/browser/inlayHintsContribution'
import 'monaco-editor/editor/contrib/inlineCompletions/browser/inlineCompletions.contribution'
import 'monaco-editor/editor/contrib/inlineProgress/browser/inlineProgress'
import 'monaco-editor/editor/contrib/inPlaceReplace/browser/inPlaceReplace'
import 'monaco-editor/editor/contrib/insertFinalNewLine/browser/insertFinalNewLine'
import 'monaco-editor/editor/standalone/browser/inspectTokens/inspectTokens'
import 'monaco-editor/editor/standalone/browser/iPadShowKeyboard/iPadShowKeyboard'
import 'monaco-editor/editor/contrib/lineSelection/browser/lineSelection'
import 'monaco-editor/editor/contrib/linesOperations/browser/linesOperations'
import 'monaco-editor/editor/contrib/linkedEditing/browser/linkedEditing'
import 'monaco-editor/editor/contrib/links/browser/links'
import 'monaco-editor/editor/contrib/longLinesHelper/browser/longLinesHelper'
import 'monaco-editor/editor/contrib/middleScroll/browser/middleScroll.contribution'
import 'monaco-editor/editor/contrib/multicursor/browser/multicursor'
import 'monaco-editor/editor/contrib/parameterHints/browser/parameterHints'
import 'monaco-editor/editor/contrib/placeholderText/browser/placeholderText.contribution'
import 'monaco-editor/editor/standalone/browser/quickAccess/standaloneCommandsQuickAccess'
import 'monaco-editor/editor/standalone/browser/quickAccess/standaloneHelpQuickAccess'
import 'monaco-editor/editor/standalone/browser/quickAccess/standaloneGotoSymbolQuickAccess'
import 'monaco-editor/editor/contrib/readOnlyMessage/browser/contribution'
import 'monaco-editor/editor/standalone/browser/referenceSearch/standaloneReferenceSearch'
import 'monaco-editor/editor/contrib/rename/browser/rename'
import 'monaco-editor/editor/contrib/sectionHeaders/browser/sectionHeaders'
import 'monaco-editor/editor/contrib/semanticTokens/browser/viewportSemanticTokens'
import 'monaco-editor/editor/contrib/smartSelect/browser/smartSelect'
import 'monaco-editor/editor/contrib/snippet/browser/snippetController2'
import 'monaco-editor/editor/contrib/stickyScroll/browser/stickyScrollContribution'
import 'monaco-editor/editor/contrib/suggest/browser/suggestInlineCompletions'
import 'monaco-editor/editor/standalone/browser/toggleHighContrast/toggleHighContrast'
import 'monaco-editor/editor/contrib/toggleTabFocusMode/browser/toggleTabFocusMode'
import 'monaco-editor/editor/contrib/tokenization/browser/tokenization'
import 'monaco-editor/editor/contrib/unicodeHighlighter/browser/unicodeHighlighter'
import 'monaco-editor/editor/contrib/unusualLineTerminators/browser/unusualLineTerminators'
import 'monaco-editor/editor/contrib/wordHighlighter/browser/wordHighlighter'
import 'monaco-editor/editor/contrib/wordOperations/browser/wordOperations'
import 'monaco-editor/editor/contrib/wordPartOperations/browser/wordPartOperations'
import 'monaco-editor/editor/browser/coreCommands'
import 'monaco-editor/editor/contrib/caretOperations/browser/caretOperations'
import 'monaco-editor/editor/contrib/dropOrPasteInto/browser/copyPasteContribution'
import 'monaco-editor/editor/contrib/find/browser/findController'
import 'monaco-editor/editor/contrib/gotoSymbol/browser/goToCommands'
import 'monaco-editor/editor/contrib/gotoError/browser/markerSelectionStatus'
import 'monaco-editor/editor/contrib/semanticTokens/browser/documentSemanticTokens'
import 'monaco-editor/editor/contrib/suggest/browser/suggestController'
import 'monaco-editor/editor/common/standaloneStrings'
import 'monaco-editor/base/browser/ui/codicons/codicon/codicon-modifiers.css'

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
  },
}

monaco.editor.defineTheme('devpilot-light', {
  base: 'vs',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#ffffff',
    'editor.foreground': '#1f2733',
    'editorGutter.background': '#ffffff',
    'editorLineNumber.foreground': '#6f7a8a',
    'editorLineNumber.activeForeground': '#5d6878',
    'editor.lineHighlightBackground': '#f6f8fb',
    'editor.selectionBackground': '#cfe1ff',
    'editor.inactiveSelectionBackground': '#e3edff',
    'editorCursor.foreground': '#2f6fe0',
    'editorWidget.background': '#ffffff',
    'editorWidget.border': '#dde3ec',
    'editorSuggestWidget.background': '#ffffff',
    'editorSuggestWidget.border': '#dde3ec',
    'editorHoverWidget.background': '#ffffff',
    'editorHoverWidget.border': '#dde3ec',
    'scrollbarSlider.background': '#c3ccd966',
    'scrollbarSlider.hoverBackground': '#a9b5c599',
    'scrollbarSlider.activeBackground': '#a9b5c5cc',
  },
})

monaco.editor.defineTheme('devpilot-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#15171c',
    'editor.foreground': '#e6e8eb',
    'editorGutter.background': '#15171c',
    'editorLineNumber.foreground': '#6b7484',
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
    'scrollbarSlider.activeBackground': '#414957cc',
  },
})

// 独立文件没有项目上下文，关闭语义校验，避免大量误报。
typescriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: true,
  noSyntaxValidation: false,
})
javascriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: true,
  noSyntaxValidation: false,
})

export { monaco }
