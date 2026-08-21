import { SpiderClient } from '@tiducto/spider-sdk-typescript'

export async function routesSearch(client: SpiderClient) {
  const result = await client.routes.search({
    q: 'Hlavní',
    mode: 'TRAM',
    agency: 'DPMB',
    limit: 10,
  })

  if (result.isSuccess) {
    // Hits come back busiest-first — ordered by trip count, so the lines that
    // run most often lead the list.
    for (const route of result.data) {
      console.log(`${route.shortName ?? '—'} ${route.longName ?? ''} · ${route.mode} · ${route.tripCount} trips`)
    }
  } else {
    console.error('Route search failed:', result.error)
  }
}

export async function routesById(client: SpiderClient) {
  try {
    const route = await client.routes.byId('1:L4')
    if (route == null) {
      console.log('No route matches that id')
    } else {
      console.log(`${route.shortName ?? '—'} ${route.longName ?? ''} · ${route.mode} · ${route.agencyName ?? 'unknown agency'}`)
    }
  } catch (e) {
    console.error('Route lookup failed:', e)
  }
}
