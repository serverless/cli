const args = require('minimist')(process.argv.slice(2))
const dotenv = require('dotenv')
const path = require('path')
const globby = require('globby')
const axios = require('axios')
const fs = require('fs')
const util = require('util')
const exec = util.promisify(require('child_process').exec)
const WebSocket = require('ws')
const { runComponent, getComponentCodeFilesUrls } = require('@serverless/client')()
const { getConfig, resolveConfig, fileExistsSync } = require('../utils')

const connect = async (cli) => {
  // if (!cli.debugMode) {
  //   return
  // }

  cli.status('Connecting')
  const url = 'wss://jvwqjke37i.execute-api.us-east-1.amazonaws.com/dev' // todo change to prod
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    ws.on('open', () => {
      ws.send(
        JSON.stringify({
          action: '$default'
        })
      )
    })

    ws.on('message', (message) => {
      const msg = JSON.parse(message)
      if (msg.event === 'echo') {
        resolve(msg.data)
      } else if (msg.event === 'debug') {
        cli.debug(msg.data)
      } else if (msg.event === 'log') {
        cli.log(msg.data)
      } else if (msg.event === 'status') {
        cli.status(msg.data)
      }
    })

    ws.on('error', (e) => reject(e))
  })
}

const getCredentials = () => {
  // Load env vars
  let envVars = {}
  const defaultEnvFilePath = path.join(process.cwd(), `.env`)
  const stageEnvFilePath = path.join(process.cwd(), `.env.dev`) // todo remove this
  if (fileExistsSync(stageEnvFilePath)) {
    envVars = dotenv.config({ path: path.resolve(stageEnvFilePath) }).parsed || {}
  } else if (fileExistsSync(defaultEnvFilePath)) {
    envVars = dotenv.config({ path: path.resolve(defaultEnvFilePath) }).parsed || {}
  }

  // Known Provider Environment Variables and their SDK configuration properties
  const providers = {}

  // AWS
  providers.aws = {}
  providers.aws.AWS_ACCESS_KEY_ID = 'accessKeyId'
  providers.aws.AWS_SECRET_ACCESS_KEY = 'secretAccessKey'
  providers.aws.AWS_REGION = 'region'

  // Google
  providers.google = {}
  providers.google.GOOGLE_APPLICATION_CREDENTIALS = 'applicationCredentials'
  providers.google.GOOGLE_PROJECT_ID = 'projectId'
  providers.google.GOOGLE_CLIENT_EMAIL = 'clientEmail'
  providers.google.GOOGLE_PRIVATE_KEY = 'privateKey'

  // Tencent
  providers.tencent = {}
  providers.tencent.TENCENT_APP_ID = 'AppId'
  providers.tencent.TENCENT_SECRET_ID = 'SecretId'
  providers.tencent.TENCENT_SECRET_KEY = 'SecretKey'

  // Docker
  providers.docker = {}
  providers.docker.DOCKER_USERNAME = 'username'
  providers.docker.DOCKER_PASSWORD = 'password'

  const credentials = {}

  for (const provider in providers) {
    const providerEnvVars = providers[provider]
    for (const providerEnvVar in providerEnvVars) {
      if (!envVars.hasOwnProperty(providerEnvVar)) {
        continue
      }
      if (!credentials[provider]) {
        credentials[provider] = {}
      }
      credentials[provider][providerEnvVars[providerEnvVar]] = envVars[providerEnvVar]
    }
  }

  return credentials
}

const putComponentCodeFile = async (file, uploadDirectory) => {
  const uploadDirectoryPath = path.resolve(uploadDirectory)
  const instance = axios.create()
  instance.defaults.headers.common = {}
  instance.defaults.headers.put = {}
  const body = fs.readFileSync(path.join(uploadDirectoryPath, file.relativePath))
  // todo handle errors
  try {
    await instance.put(file.uploadUrl, body)
  } catch (e) {
    throw e
  }
}

const putComponentCodeFiles = async (files, uploadDirectory) => {
  const promises = []
  for (const file of files) {
    promises.push(putComponentCodeFile(file, uploadDirectory))
  }

  return Promise.all(promises)
}

const resolveComponentCodeFiles = async (inputs, cli) => {

  let uploadDirectoryPath

  if (typeof inputs.src === 'object' && inputs.src.hook && inputs.src.dist) {
    // First run the build hook, if "hook" and "dist" are specified
    cli.status('Building Code')
    const options = { cwd: inputs.src.src }
    try {
      await exec(inputs.src.hook, { cwd: inputs.src.src })
    } catch (err) {
      console.error(err.stderr) // eslint-disable-line
      throw new Error(
        `Failed building website via "${inputs.src.hook}" due to the following error: "${err.stderr}"`
      )
    }
    uploadDirectoryPath = path.resolve(inputs.src.dist)
  } else if (typeof inputs.src === 'object' && inputs.src.src) {
    uploadDirectoryPath = path.resolve(inputs.src.src)
  } else if (typeof inputs.src === 'string') {
    uploadDirectoryPath = path.resolve(inputs.src)
  } else {
    throw new Error(
      `Invalid "inputs.src".  Value must be a string or object.`
    )
  }

  cli.status('Uploading Code')
  const patterns = ['**', '!node_modules']
  const files = (await globby(patterns, { cwd: uploadDirectoryPath }))
    .sort()
    .map((relativePath) => {
      return {
        relativePath
      }
    })

  const res = await getComponentCodeFilesUrls({ files })

  await putComponentCodeFiles(res.files, uploadDirectoryPath)

  inputs.src.src = res.files

  return inputs
}

const getComponentCodeFile = async (file, downloadDirectory) => {
  const instance = axios.create()
  instance.defaults.headers.common = {}
  instance.defaults.headers.get = {}
  // todo handle errors
  try {
    const res = await instance.get(file.downloadUrl)

    fs.writeFileSync(path.join(downloadDirectory, file.relativePath), res.data)
  } catch (e) {
    throw e
  }
}

const getComponentCodeFiles = async (files, downloadDirectory) => {
  const promises = []
  for (const file of files) {
    promises.push(getComponentCodeFile(file, downloadDirectory))
  }

  return Promise.all(promises)
}

const getComponentInstanceData = async (cli) => {
  const serverlessFile = getConfig('serverless')

  const resolvedServerlessFile = resolveConfig(serverlessFile)

  const { app, stage, name, component, inputs } = resolvedServerlessFile

  if (typeof app === 'undefined') {
    throw new Error(`Missing "app" property in serverless.yml`)
  }

  if (typeof component === 'undefined') {
    throw new Error(`Missing "component" property in serverless.yml`)
  }

  if (typeof name === 'undefined') {
    throw new Error(`Missing "name" property in serverless.yml`)
  }

  if (typeof app !== 'string' || app.split('/').length !== 2) {
    throw new Error(`"${app}" is not a valid org/app`)
  }

  const data = {
    org: app.split('/')[0],
    app: app.split('/')[1],
    stage: stage,
    name,
    method: cli.command,
    debugMode: cli.debugMode,
    credentials: getCredentials(),
    accessKey: process.env.SERVERLESS_ACCESS_KEY,
    inputs
  }

  if (component.split('@').length === 2) {
    data.componentName = component.split('@')[0]
    data.componentVersion = component.split('@')[1]
  } else {
    data.componentName = component
    data.componentVersion = 'dev'
  }

  if (args.dev) {
    data.componentVersion = 'dev'
  }

  if (inputs && inputs.src) {
    data.inputs = await resolveComponentCodeFiles(inputs, cli)
  }

  return data
}

module.exports = async (cli) => {
  const res = await Promise.all([connect(cli), getComponentInstanceData(cli)])

  const socket = res[0]
  const componentInstanceData = res[1]

  cli.status('Deploying', componentInstanceData.name)

  const runComponentInputs = {
    ...componentInstanceData,
    socket
  }

  const outputs = await runComponent(runComponentInputs)

  cli.outputs(outputs)

  cli.close('done', 'Deployed')
}
