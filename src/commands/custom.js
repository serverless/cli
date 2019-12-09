const cli = require('../cli')
const { connect, engine, getComponentInstanceData } = require('../utils')
const { runComponent } = engine

module.exports = async (config) => {
  cli.status('Initializing')

  const res = await Promise.all([
    connect(config),
    getComponentInstanceData(config)])
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
