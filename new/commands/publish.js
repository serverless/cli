const path = require('path')
const axios = require('axios')
const globby = require('globby')
const AdmZip = require('adm-zip')
const { contains, isNil, last, split } = require('ramda')
const { tmpdir } = require('os')
const { getComponentUploadUrl, publishComponent } = require('@serverless/client')()
const fs = require('fs')
const { getServerlessComponentFile } = require('../utils')

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

  // todo fix this
  // files.map((file) => zip.addLocalFile(file, path.dirname(file)))
  files.map((file) => zip.addLocalFile(file))

  if (!isNil(include)) {
    include.forEach((file) => zip.addLocalFile(file))
  }

  zip.writeZip(outputFilePath)

  return outputFilePath
}

const putComponentPackage = async (componentPackagePath, componentUploadUrl) => {
  await axios({
    method: 'put',
    url: componentUploadUrl,
    data: fs.readFileSync(componentPackagePath),
    headers: {
      'Content-Type': 'application/zip'
    }
  })
}

module.exports = async (cli) => {
  const serverlessComponentFile = getServerlessComponentFile(process.cwd())
  const componentName = serverlessComponentFile.name
  const componentVersion = serverlessComponentFile.version

  let componentNameVersionPair
  if (componentVersion) {
    componentNameVersionPair = `${componentName}@${componentVersion}`
  } else {
    componentNameVersionPair = componentName
  }

  cli.status('publishing', componentNameVersionPair)
  cli.debug(`publishing component "${componentNameVersionPair}"`)
  cli.debug(`fetching component upload url`)

  const { componentUploadUrl, componentId } = await getComponentUploadUrl({
    componentName,
    componentVersion
  })

  const inputDirPath = process.cwd()
  const outputFilePath = path.join(tmpdir(), `${componentId}.zip`)

  cli.debug(`packaging component from ${inputDirPath}`)
  const componentPackagePath = await pack(inputDirPath, outputFilePath)
  cli.debug(`component packaged into ${outputFilePath}`)

  cli.debug(`uploading component package`)
  await putComponentPackage(componentPackagePath, componentUploadUrl)

  const componentData = {
    componentName,
    componentId
  }

  if (componentVersion) {
    componentData.componentVersion = componentVersion
  }

  cli.debug(`submitting component data`)

  await publishComponent(componentData)

  cli.debug(`component "${componentNameVersionPair}" was published successfully`)

  cli.close('done', 'published')
}
