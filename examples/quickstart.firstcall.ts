import { SpiderClient, Location } from '@tiducto/spider-sdk-typescript'

const client = new SpiderClient('https://your-env-slug.api.tiducto.eu', 'your-api-key')

const result = await client.routing.plan({
  origin: Location.coordinate(49.1908, 16.6128),
  destination: Location.coordinate(49.2270, 16.5273),
  first: 3,
})
