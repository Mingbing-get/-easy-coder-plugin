const { resolve } = require('path')
const { readdir, stat, writeFile } = require('fs/promises')
const pkg = require(resolve(process.cwd(), 'package.json'))

const distDir = resolve(process.cwd(), 'dist')

main()

async function main() {
  const fileNames = await readdir(distDir)

  const directories = []
  for (const name of fileNames) {
    const statInfo = await stat(resolve(distDir, name))
    if (statInfo.isDirectory()) {
      directories.push(name)
    }
  }

  await addMainPackageJson(directories)
}

async function addMainPackageJson() {
  const fileName = resolve(distDir, 'package.json')

  const data = {
    name: pkg.name,
    version: pkg.version,
    keywords: pkg.keywords,
    description: pkg.description,
    author: pkg.author,
    license: pkg.license,
    devDependencies: pkg.devDependencies,
    dependencies: pkg.dependencies,
    peerDependencies: pkg.peerDependencies,
    repository: pkg.repository,
    homepage: pkg.homepage,
  }

  await writeFile(fileName, JSON.stringify(data, null, 2))
}
