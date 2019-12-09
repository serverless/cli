const { getLoggedInUser } = require('@serverless/platform-sdk')
const cli = require('../cli')
const { connect, engine, getComponentInstanceData } = require('../utils')
const { runComponent } = engine

module.exports = async (config) => {
  const user = getLoggedInUser()

  if (!user && !process.env.SERVERLESS_ACCESS_KEY) {
    cli.error(
      `You must be logged in to run components. Please run "serverless login" to login`,
      true
    )
  }

  cli.status('Initializing')

  const res = await Promise.all([connect(config), getComponentInstanceData(config)])
  const socket = res[0]
  const componentInstanceData = res[1]

  cli.status('Running', componentInstanceData.name)

  const runComponentInputs = {
    ...componentInstanceData,
    socket
  }

  const outputs = await runComponent(runComponentInputs)

  cli.outputs(outputs)
  cli.close('done', 'Done')
}
