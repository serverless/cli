const { connect, engine, getComponentInstanceData } = require('../utils')
const { runComponent } = engine

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

  cli.close('done', 'Done')
}
