import { SpiderClient } from '@tiducto/spider-sdk-typescript'

const client = new SpiderClient('https://your-env-slug.api.tiducto.eu', 'your-api-key')

const result = await client.stops.search({ name: 'Hlavní nádraží' })
if (result.isSuccess) {
  for (const stop of result.data) {
    console.log(`${stop.name} (${stop.gtfsId}) — ${stop.city}`)
  }
} else {
  console.error('Search failed:', result.error)
}
