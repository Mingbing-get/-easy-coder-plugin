import { parse as babelParse, ParseResult } from '@babel/parser'
import generate from '@babel/generator'
import types, {
  isExportDeclaration,
  isExportNamedDeclaration,
  isExportSpecifier,
  isIdentifier,
  isObjectExpression,
  isObjectProperty,
  isVariableDeclaration,
} from '@babel/types'

export default class ExcludeEditorCode {
  private ast: ParseResult<types.File>

  constructor(private code: string) {
    this.ast = babelParse(code, {
      sourceType: 'module',
    })
  }

  execute() {
    const exportName = this.findDefaultExportDeclareName()
    if (!exportName) return

    const exportVariableDeclareValue = this.findDeclareValueByName(exportName)
    if (!isObjectExpression(exportVariableDeclareValue)) return

    this.removeProFromExpression(['attrDecorators'], exportVariableDeclareValue)
    this.removeProFromExpression(['attr', '*', ['setter', 'setterProps', 'onDependencies', 'visible']], exportVariableDeclareValue)
  }

  astToCode() {
    return generate(this.ast)
  }

  private removeProFromExpression(path: (string | string[])[], expression: types.Expression) {
    if (path.length === 0) return

    if (!isObjectExpression(expression)) return

    if (path.length === 1) {
      const first = path[0]
      if (typeof first === 'string') {
        const proIndex = this.findProIndexValueFromObjectExpression(expression, first)
        if (proIndex !== -1) {
          expression.properties.splice(proIndex, 1)
        }
      } else {
        first.forEach((key) => {
          const proIndex = this.findProIndexValueFromObjectExpression(expression, key)
          if (proIndex !== -1) {
            expression.properties.splice(proIndex, 1)
          }
        })
      }
      return
    }

    const first = path[0]
    if (typeof first === 'string') {
      if (first === '*') {
        expression.properties.forEach((pro) => {
          if (!isObjectProperty(pro) || !isObjectExpression(pro.value)) return

          this.removeProFromExpression(path.slice(1), pro.value)
        })
      } else {
        const pro = this.findProDeclareValueFromObjectExpression(expression, first)
        if (!pro || !isObjectExpression(pro.value)) return

        this.removeProFromExpression(path.slice(1), pro.value)
      }
    } else {
      first.forEach((key) => {
        const pro = this.findProDeclareValueFromObjectExpression(expression, key)
        if (!pro || !isObjectExpression(pro.value)) return

        this.removeProFromExpression(path.slice(1), pro.value)
      })
    }
  }

  private findProDeclareValueFromObjectExpression(objectExpression: types.ObjectExpression, key: string) {
    const index = this.findProIndexValueFromObjectExpression(objectExpression, key)
    if (index === -1) return

    return objectExpression.properties[index] as types.ObjectProperty
  }

  private findProIndexValueFromObjectExpression(objectExpression: types.ObjectExpression, key: string) {
    return objectExpression.properties.findIndex((pro) => {
      if (!isObjectProperty(pro)) return false

      return isIdentifier(pro.key) && pro.key.name === key
    })
  }

  private findDeclareValueByName(name: string) {
    for (const ast of this.ast.program.body) {
      if (!isVariableDeclaration(ast)) continue

      const dec = ast.declarations.find((item) => isIdentifier(item.id) && item.id.name === name)
      if (!dec) continue

      return dec.init
    }
  }

  private findDefaultExportDeclareName() {
    const exportDeclaration = this.ast.program.body.find((ast) => isExportDeclaration(ast))
    if (!exportDeclaration) return

    if (!isExportNamedDeclaration(exportDeclaration)) return

    for (const s of exportDeclaration.specifiers) {
      if (!isExportSpecifier(s)) continue
      if (!isIdentifier(s.exported)) continue

      if (s.exported.name === 'default') {
        return s.local.name
      }
    }
  }
}
