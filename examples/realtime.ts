import { SpiderClient, pollVehicles } from '@tiducto/spider-sdk-typescript'

export function poll(client: SpiderClient, tripIds: string[], updateBoard: (data: unknown) => void) {
  setInterval(async () => {
    const result = await client.realtime.delays(tripIds)
    if (result.isSuccess) {
      updateBoard(result.data)
    } else {
      console.error('realtime poll failed:', result.error)
    }
  }, 15_000)
}

export async function pollHelper(client: SpiderClient, tripIds: string[], updateBoard: (data: unknown) => void) {
  for await (const result of pollVehicles(client.realtime, tripIds)) {
    if (result.isSuccess) {
      updateBoard(result.data)
    } else {
      console.error('realtime poll failed:', result.error)
    }
  }
}

export async function vehicles(client: SpiderClient, tripIds: string[]) {
  const result = await client.realtime.vehicles(tripIds)
  if (result.isSuccess) {
    for (const vehicle of result.data.vehicles) {
      console.log(`${vehicle.tripId} at ${vehicle.latitude}, ${vehicle.longitude}`)
    }
  } else {
    console.error('Failed to load vehicles:', result.error)
  }
}

export async function vehicleForTrip(client: SpiderClient, tripId: string) {
  const result = await client.realtime.vehicleForTrip(tripId)
  if (result.isSuccess) {
    const vehicle = result.data.vehicle
    if (vehicle === null) {
      console.log('No vehicle reporting for this trip right now')
    } else {
      console.log(`At ${vehicle.latitude}, ${vehicle.longitude}`)
    }
  } else {
    console.error('Failed:', result.error)
  }
}

export async function delays(client: SpiderClient, tripIds: string[]) {
  const result = await client.realtime.delays(tripIds)
  if (result.isSuccess) {
    for (const delay of result.data.delays) {
      const minutes = Math.trunc((delay.delaySeconds ?? 0) / 60)
      console.log(`${delay.tripId}: ${minutes >= 0 ? '+' : ''}${minutes} min`)
    }
  } else {
    console.error('Failed to load delays:', result.error)
  }
}

export async function alerts(client: SpiderClient) {
  const result = await client.realtime.alerts()
  if (result.isSuccess) {
    for (const alert of result.data.alerts) {
      console.log(`${alert.headerText}: ${alert.descriptionText}`)
    }
  } else {
    console.error('Failed to load alerts:', result.error)
  }
}
