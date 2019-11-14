const path = require('path')
const globby = require('globby')
const { last, split, contains, isNil } = require('ramda')
const AdmZip = require('adm-zip')
const { tmpdir } = require('os')
const fetch = require('node-fetch')
const { utils } = require('@serverless/core')

const publishComponent = async () => {}
const getRegistryUploadUrl = async () => {}

const pack = async (inputDirPath, outputFilePath, include = [], exclude = []) => {
  const format = last(split('.', outputFilePath))

  if (!contains(format, ['zip', 'tar'])) {
    throw new Error('Please provide a valid format. Either a "zip" or a "tar"')
  }

  const patterns = ['**']

  if (!isNil(exclude)) {
    exclude.forEach((excludedItem) => patterns.push(`!${excludedItem}`))
  }

  const zip = new AdmZip()

  const files = (await globby(patterns, { cwd: inputDirPath })).sort() // we must sort to ensure correct hash

  files.map((file) => zip.addLocalFile(file, path.dirname(file))) // todo

  if (!isNil(include)) {
    include.forEach((file) => zip.addLocalFile(file))
  }

  zip.writeZip(outputFilePath)

  return outputFilePath
}

const packageComponent = async (componentPath) => {
  const outputFilePath = path.join(
    tmpdir(),
    `${Math.random()
      .toString(36)
      .substring(6)}.zip`
  )
  const shimPath = require.resolve('./shim')
  const contextPath = require.resolve('./Context') // this is a different context
  return pack(componentPath, outputFilePath, [shimPath, contextPath])
}

const putComponentPackage = async (componentPackagePath, componentPackageUrl) => {
  const body = await utils.readFile(componentPackagePath)
  // todo handle errors
  await fetch(componentPackageUrl, {
    method: 'put',
    body,
    headers: {
      'Content-Type': 'application/octet-stream' // todo
    }
  })
}

const getServerlessComponentFile = (dir) => {
  const ymlFilePath = path.join(dir, 'serverless.yml')
  const yamlFilePath = path.join(dir, 'serverless.yaml')
  const jsonFilePath = path.join(dir, 'serverless.json')

  if (utils.fileExistsSync(ymlFilePath)) {
    return utils.readFileSync(ymlFilePath)
  }
  if (utils.fileExistsSync(yamlFilePath)) {
    return utils.readFileSync(yamlFilePath)
  }

  if (utils.fileExistsSync(jsonFilePath)) {
    return utils.readFileSync(jsonFilePath)
  }

  return false
}

const publish = async () => {
  const serverlessComponentFilePath = path.join(process.cwd(), `serverless.component.yml`)
  const serverlessComponentFile = getServerlessComponentFile(serverlessComponentFilePath)

  const { url, id } = await getRegistryUploadUrl()

  const componentPackagePath = await packageComponent(process.cwd())

  await putComponentPackage(componentPackagePath, url)

  const publishComponentInputs = {
    accessKey: process.env.SERVERLESS_ACCESS_KEY,
    id,
    ...serverlessComponentFile
  }

  await publishComponent(publishComponentInputs)
}

module.exports = publish
