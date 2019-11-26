const args = require('minimist')(process.argv.slice(2))
const axios = require('axios')
const path = require('path')
const { tmpdir } = require('os')
const fs = require('fs')
const { getConfig, pack } = require('../utils')

const getComponentUploadUrl = async (serverlessComponentFile) => {
  const url = `https://y6w6rsjkib.execute-api.us-east-1.amazonaws.com/dev/component/${serverlessComponentFile.name}`
  const data = JSON.stringify(serverlessComponentFile)
  const serverlessAccessKey = process.env.SERVERLESS_ACCESS_KEY

  if (!serverlessAccessKey) {
    throw new Error('SERVERLESS_ACCESS_KEY env var not found')
  }

  const headers = {
    Authorization: `Bearer ${serverlessAccessKey}`,
    'serverless-org-name': serverlessComponentFile.org,
    'content-type': 'application/json'
  }
  try {
    const res = await axios({
      method: 'put',
      url,
      data,
      headers
    })
    return res.data
  } catch (e) {
    if (e.response && e.response.status !== 200) {
      throw new Error(
        `${e.response.status} ${e.response.statusText || ''} ${e.response.data.message || ''}`
      )
    }
    throw e
  }
}

const putComponentPackage = async (componentPackagePath, componentUploadUrl) => {
  // axios auto adds headers that causes signature mismatch
  // so we gotta hack it to remove that
  const instance = axios.create()
  instance.defaults.headers.common = {}
  instance.defaults.headers.put = {}
  const file = fs.readFileSync(componentPackagePath)

  try {
    await instance.put(componentUploadUrl.url, file)
  } catch (e) {
    throw e
  }
}

/**
 * Validate Component Definition
 */

const validateComponentDefinition = async (serverlessComponentFile) => {
  if (!serverlessComponentFile.name) {
    throw new Error('"name" is required in serverless.component.yml.')
  }
  if (!serverlessComponentFile.org) {
    throw new Error('"org" is required in serverless.component.yml.')
  }
  if (!serverlessComponentFile.author) {
    throw new Error('"author" is required in serverless.component.yml.')
  }
}

module.exports = async (cli) => {
  const serverlessComponentFile = getConfig('serverless.component')

  if (!serverlessComponentFile) {
    throw new Error(`serverless.component.yml file not found in the current working directory`)
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

  const componentDirectoryPath = process.cwd()
  const componentPackagePath = path.join(
    tmpdir(),
    `${Math.random()
      .toString(36)
      .substring(6)}.zip`
  )

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
