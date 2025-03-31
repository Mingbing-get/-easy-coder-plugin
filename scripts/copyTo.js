const { cp } = require('fs/promises')
const { resolve } = require('path')

main()

async function main() {
  await cp(resolve(process.cwd(), './dist/excludeEditorCode'), resolve(process.cwd(), '../test/scripts/excludeEditorCode'), { recursive: true })
}
