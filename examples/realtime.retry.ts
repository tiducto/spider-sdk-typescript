import { SpiderClient } from '@tiducto/spider-sdk-typescript'

const client = new SpiderClient('https://your-env-slug.api.tiducto.eu', 'your-api-key', {
  realtime: { autoRetry: { maxAttempts: 3 } },
})
