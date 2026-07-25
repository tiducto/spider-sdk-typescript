import { SpiderClient } from '@tiducto/spider-sdk-typescript'

const primary = new SpiderClient(
  'https://your-env-slug.api.tiducto.eu',
  process.env.SPIDER_API_KEY!,
)

const secondary = new SpiderClient(
  'https://another-env-slug.api.tiducto.eu',
  process.env.SPIDER_OTHER_API_KEY!,
)
