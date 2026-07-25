import { SpiderClient } from '@tiducto/spider-sdk-typescript'

const brno = new SpiderClient(
  'https://brno.api.tiducto.eu',
  process.env.BRNO_API_KEY!,
)

const praha = new SpiderClient(
  'https://praha.api.tiducto.eu',
  process.env.PRAHA_API_KEY!,
)
