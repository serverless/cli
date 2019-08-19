const run = require('./run.js')
const publish = require('./publish.js')

module.exports = {
  run,
  ...publish,
}
