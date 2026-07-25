import { SpiderClient } from '@tiducto/spider-sdk-typescript'

const apiKey = process.env.SPIDER_API_KEY
if (!apiKey) throw new Error('SPIDER_API_KEY is not set')

const client = new SpiderClient('https://brno.api.tiducto.eu', apiKey)
