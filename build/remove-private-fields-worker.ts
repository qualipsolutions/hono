import * as ts from 'typescript'

export type WorkerInput = {
  file: string
  taskId: number
}

export type WorkerOutput =
  | {
      type: 'success'
      value: string
      taskId: number
    }
  | {
      type: 'error'
      value: unknown
      taskId: number
    }

const removePrivateTransformer = <T extends ts.Node>(ctx: ts.TransformationContext) => {
  const visit: ts.Visitor = (node) => {
    if (ts.isClassDeclaration(node)) {
      const newMembers = node.members.filter((elem) => {
        if (ts.isPropertyDeclaration(elem) || ts.isMethodDeclaration(elem)) {
          for (const modifier of elem.modifiers ?? []) {
            if (modifier.kind === ts.SyntaxKind.PrivateKeyword) {
              return false
            }
          }
        }
        if (elem.name && ts.isPrivateIdentifier(elem.name)) {
          return false
        }
        return true
      })
      return ts.factory.createClassDeclaration(
        node.modifiers,
        node.name,
        node.typeParameters,
        node.heritageClauses,
        newMembers
      )
    }
    return ts.visitEachChild(node, visit, ctx)
  }

  return (node: T) => {
    const visited = ts.visitNode(node, visit)
    if (!visited) {
      throw new Error('The result visited is undefined.')
    }
    return visited
  }
}

export const removePrivateFields = (tsPath: string) => {
  const program = ts.createProgram([tsPath], {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
  })
  const file = program.getSourceFile(tsPath)

  const transformed = ts.transform(file!, [removePrivateTransformer])
  const printer = ts.createPrinter()
  const transformedSourceFile = transformed.transformed[0] as ts.SourceFile
  const code = printer.printFile(transformedSourceFile)
  transformed.dispose()
  return code
}

declare const self: Worker

if (globalThis.self) {
  self.addEventListener('message', function (e) {
    const { file, taskId } = e.data as WorkerInput

    try {
      const result = removePrivateFields(file)
      self.postMessage({ type: 'success', value: result, taskId } satisfies WorkerOutput)
    } catch (e) {
      console.error(e)
      self.postMessage({ type: 'error', value: e, taskId } satisfies WorkerOutput)
    }
  })
}
