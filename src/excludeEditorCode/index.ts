import path from 'path'
import ExcludeEditorCode from './instance'

export default function vitePluginExcludeEditorCode() {
  return {
    name: 'vite-plugin-exclude-editor-code',
    transform(code: string, id: string) {
      if (!id.endsWith('.esm.js') || path.relative(path.resolve(process.cwd(), 'src/components'), id).startsWith('..')) return

      const excludeEditorCode = new ExcludeEditorCode(code)
      excludeEditorCode.execute()

      return excludeEditorCode.astToCode()
    },
  }
}
