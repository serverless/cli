const args = require('minimist')(process.argv.slice(2))
const dotenv = require('dotenv')
const path = require('path')
const globby = require('globby')
const axios = require('axios')
const { tmpdir } = require('os')
const download = require('download')
const fs = require('fs')
const util = require('util')
const exec = util.promisify(require('child_process').exec)
const WebSocket = require('ws')
const { runComponent, getComponentCodeFilesUrls, getPackageUrls } = require('@serverless/client')()
const { getConfig, resolveConfig, fileExistsSync, pack } = require('../utils')

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

const putPackage = async (packagePath, packageUploadUrl) => {
  const instance = axios.create()
  instance.defaults.headers.common = {}
  instance.defaults.headers.put = {}
  const body = fs.readFileSync(packagePath)
  // todo handle errors
  try {
    await instance.put(packageUploadUrl, body)
  } catch (e) {
    throw e
  }
}

const downloadPackge = async (packageDownloadUrl) => {
  const outputDirectory = path.join(
    process.cwd(),
    `${Math.random()
      .toString(36)
      .substring(6)}`
  )
  await download(packageDownloadUrl, outputDirectory, { extract: true })
}

const getPackage = async (packageDownloadUrl) => {
  const outputFilePath = path.join(
    process.cwd(),
    `${Math.random()
      .toString(36)
      .substring(6)}.zip`
  )
  const instance = axios.create()
  instance.defaults.headers.common = {}
  instance.defaults.headers.get = {}
  // todo handle errors
  try {
    const res = await instance.get(packageDownloadUrl)

    fs.writeFileSync(outputFilePath, res.data)
  } catch (e) {
    throw e
  }
}

const uploadComponentSrc = async (src, cli) => {
  const packagePath = path.join(
    tmpdir(),
    `${Math.random()
      .toString(36)
      .substring(6)}.zip`
  )

  cli.debug(`packaging from ${src} into ${packagePath}`)

  cli.status('Packaging')

  const res = await Promise.all([getPackageUrls(), pack(src, packagePath, cli)])

  const packageUrls = res[0]

  cli.status('Uploading')
  await putPackage(packagePath, packageUrls.upload)

  return packageUrls.download
  // await downloadPackge(packageUrls.download)
}

const resolveComponentSrcInput = async (inputs, cli) => {
  let uploadDirectoryPath

  if (typeof inputs.src === 'object' && inputs.src.hook && inputs.src.dist) {
    // First run the build hook, if "hook" and "dist" are specified
    cli.status('Building')
    // const options = { cwd: inputs.src.src }
    // try {
    //   await exec(inputs.src.hook, options)
    // } catch (err) {
    //   console.error(err.stderr) // eslint-disable-line
    //   throw new Error(
    //     `Failed building website via "${inputs.src.hook}" due to the following error: "${err.stderr}"`
    //   )
    // }
    uploadDirectoryPath = path.resolve(inputs.src.dist)
  } else if (typeof inputs.src === 'object' && inputs.src.src) {
    uploadDirectoryPath = path.resolve(inputs.src.src)
  } else if (typeof inputs.src === 'string') {
    uploadDirectoryPath = path.resolve(inputs.src)
  } else {
    throw new Error(`Invalid "inputs.src".  Value must be a string or object.`)
  }

  inputs.src = await uploadComponentSrc(uploadDirectoryPath, cli)

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
    data.inputs = await resolveComponentSrcInput(inputs, cli)
  }

  return data
}

module.exports = async (cli) => {
  const res = await Promise.all([connect(cli), getComponentInstanceData(cli)])

  const socket = res[0]
  const componentInstanceData = res[1]

  cli.status('Running', componentInstanceData.name)

  const runComponentInputs = {
    ...componentInstanceData,
    socket
  }

  const outputs = await runComponent(runComponentInputs)

  cli.outputs(outputs)

  cli.close('done', 'Deployed')
}
