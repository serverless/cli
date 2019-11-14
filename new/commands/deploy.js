const { runComponent } = require('@serverless/client')()
const { getServerlessFile } = require('../utils')
const WebSocket = require('ws')

const url = 'wss://jvwqjke37i.execute-api.us-east-1.amazonaws.com/dev'

const connect = async (cli) => {
  const promise = new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    ws.on('open', () => {
      ws.send(
        JSON.stringify({
          action: '$default'
        })
      )
    })

    ws.on('message', (message) => {
      // console.log(message)
      const messageObj = JSON.parse(message)
      if (messageObj.action === 'debug') {
        cli.debug(messageObj.data)
      } else if (messageObj.action === 'echo') {
        resolve(messageObj.data)
      } else {
        console.log(message) // eslint-disable-line
      }
    })

    ws.on('close', () => {
      cli.close('closed')
      process.exit(0)
    })

    ws.on('error', (e) => {
      cli.renderError(e)
      cli.close('error', e)
      process.exit(1)
    })
  })

  return promise
}

module.exports = async (cli) => {
  cli.status('deploying')

  const socket = await connect(cli)

  const serverlessFile = getServerlessFile(process.cwd())

  const runComponentInputs = {
    ...serverlessFile,
    method: 'deploy',
    socket
  }

  const outputs = await runComponent(runComponentInputs)

  cli.renderOutputs(outputs)

  cli.close('done', 'deployed')
}
