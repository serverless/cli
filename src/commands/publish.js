const args = require('minimist')(process.argv.slice(2))
const path = require('path')
const { tmpdir } = require('os')
const { getLoggedInUser } = require('@serverless/platform-sdk')
const cli = require('../cli')
const {
  getConfig,
  pack,
  validateComponentDefinition,
  putComponentPackage,
  getComponentUploadUrl
} = require('../utils')

module.exports = async () => {
  const user = getLoggedInUser()

  if (!user && !process.env.SERVERLESS_ACCESS_KEY) {
    throw new Error(`You must be logged in to publish. Please run "serverless login" to login`)
  }

  const serverlessComponentFile = getConfig('serverless.component')

  if (!serverlessComponentFile) {
    cli.error(`serverless.component.yml file not found in the current working directory`, true)
  }

  validateComponentDefinition(serverlessComponentFile)

  let cliEntity = serverlessComponentFile.name

  if (serverlessComponentFile.version) {
    cliEntity = `${serverlessComponentFile.name}@${serverlessComponentFile.version}`
  }

  if (!serverlessComponentFile.version || args.dev) {
    serverlessComponentFile.version = 'dev'
    cliEntity = `${serverlessComponentFile.name}@dev`
  }

  cli.status(`Publishing`, cliEntity)

  // Get Component path and temporary path for packaging
  const componentPackagePath = path.join(
    tmpdir(),
    `${Math.random()
      .toString(36)
      .substring(6)}.zip`
  )
  let componentDirectoryPath
  if (serverlessComponentFile.main) {
    componentDirectoryPath = path.resolve(process.cwd(), serverlessComponentFile.main)
  } else {
    componentDirectoryPath = process.cwd()
  }

  cli.debug(`Packaging component from ${componentDirectoryPath}`)

  const res = await Promise.all([
    getComponentUploadUrl(serverlessComponentFile),
    pack(componentDirectoryPath, componentPackagePath)
  ])

  const componentUploadUrl = res[0]

  cli.debug(`Component packaged into ${componentPackagePath}`)

  cli.debug(`Uploading component package`)
  await putComponentPackage(componentPackagePath, componentUploadUrl)
  cli.debug(`Component package uploaded`)

  cli.close('done', 'Published')
}
