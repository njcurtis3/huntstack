import { Worker, Job } from 'bullmq'
import IORedis from 'ioredis'
import 'dotenv/config'

import { scrapeColorado } from './scrapers/colorado.js'
import { scrapeMontana } from './scrapers/montana.js'

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
})

interface ScrapeJob {
  type: 'regulations' | 'seasons' | 'licenses' | 'full'
  state: string
  options?: {
    force?: boolean
    year?: number
  }
}

const scrapers: Record<string, (job: Job<ScrapeJob>) => Promise<void>> = {
  CO: scrapeColorado,
  MT: scrapeMontana,
  // Add more states as scrapers are implemented
}

const worker = new Worker<ScrapeJob>(
  'scrape-queue',
  async (job) => {
    console.log(`Processing job ${job.id}: ${job.data.state} - ${job.data.type}`)
    
    const scraper = scrapers[job.data.state.toUpperCase()]
    
    if (!scraper) {
      throw new Error(`No scraper implemented for state: ${job.data.state}`)
    }

    await scraper(job)
    
    console.log(`Completed job ${job.id}`)
  },
  {
    connection,
    concurrency: 2, // Run 2 scrape jobs at a time
  }
)

worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed successfully`)
})

worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed:`, err)
})

worker.on('error', (err) => {
  console.error('Worker error:', err)
})

console.log('Scraper worker started, waiting for jobs...')

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down worker...')
  await worker.close()
  process.exit(0)
})
