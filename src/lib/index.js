const run = require('./run.js')
const publish = require('./publish.js')
const login = require('./login.js')

module.exports = {
  run,
  ...publish,
  ...login
}
