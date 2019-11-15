const { runComponent } = require('@serverless/client')()
const { getConfigFile, resolveConfig, getComponentInstanceData } = require('../utils')
const WebSocket = require('ws')

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
      if (msg.event === 'debug') {
        cli.debug(msg.data)
      } else if (msg.event === 'echo') {
        resolve(msg.data)
      }
    })

    ws.on('error', (e) => reject(e))
  })
}

module.exports = async (cli) => {
  cli.status('Connecting')
  const socket = await connect(cli)

  const serverlessFile = getConfigFile('serverless')

  // todo resolve code input
  const resolvedServerlessFile = resolveConfig(serverlessFile)

  const componentInstanceData = getComponentInstanceData(resolvedServerlessFile)

  cli.status('Deploying')

  const runComponentInputs = {
    ...componentInstanceData,
    method: cli.command,
    debugMode: cli.debugMode,
    socket
  }

  const outputs = await runComponent(runComponentInputs)

  cli.outputs(outputs)

  cli.close('done', 'Deployed')
}
