const axios = require('axios')
const defaultRoot = `https://y6w6rsjkib.execute-api.us-east-1.amazonaws.com/dev/engine`

const engine = new Proxy(
  {},
  {
    get: (obj, functionName) => {
      const callFunction = async (inputs = {}) => {
        const options = {
          url: `${defaultRoot}/${functionName}`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${inputs.accessKey}`,
            'serverless-org-name': inputs.org
          },
          data: inputs
        }
        try {
          const res = await axios(options)
          return res.data
        } catch (requestError) {
          if (requestError.response) {
            const { message, stack, code } = requestError.response.data

            const backendError = new Error(message)

            if (stack) {
              backendError.stack = stack
            }

            if (code) {
              backendError.code = code
            }

            throw backendError
          }
          throw requestError
        }
      }

      return callFunction
    }
  }
)

module.exports = engine
