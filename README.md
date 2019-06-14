# Components Core

## load()
Downloads a component from npm if it doesn't exist in local cache, and initialize it with a programatic context.
```js
const { utils } = require('@serverless/core')

const context = {
  stateRoot: 'path/to/state/dir', // default is ~/.serverless/components/state
  stage: 'prod', // default is dev
  credentials : { aws: {} } // default is empty object
}

const component = await utils.load('@serverless/mono', 'uniqueId', context)
```
