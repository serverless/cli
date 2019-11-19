const args = require('minimist')(process.argv.slice(2))
const dotenv = require('dotenv')
const path = require('path')
const WebSocket = require('ws')
const { runComponent } = require('@serverless/client')()
const { getConfig, resolveConfig, getComponentInstanceData, fileExistsSync } = require('../utils')

const connect = async (cli) => {
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

module.exports = async (cli) => {
  cli.status('Connecting')

  const socket = await connect(cli)

  const serverlessFile = getConfig('serverless')

  // todo resolve code input
  const resolvedServerlessFile = resolveConfig(serverlessFile)

  const componentInstanceData = getComponentInstanceData(resolvedServerlessFile)

  if (args.dev) {
    componentInstanceData.componentVersion = 'dev'
  }

  const credentials = getCredentials()

  cli.status('Deploying')

  const runComponentInputs = {
    ...componentInstanceData,
    accessKey: process.env.SERVERLESS_ACCESS_KEY,
    method: cli.command,
    credentials,
    debugMode: cli.debugMode,
    socket
  }

  const outputs = await runComponent(runComponentInputs)

  cli.outputs(outputs)

  cli.close('done', 'Deployed')
}
