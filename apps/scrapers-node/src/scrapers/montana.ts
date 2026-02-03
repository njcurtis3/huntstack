import { Job } from 'bullmq'

interface ScrapeJob {
  type: 'regulations' | 'seasons' | 'licenses' | 'full'
  state: string
  options?: {
    force?: boolean
    year?: number
  }
}

/**
 * Montana Fish, Wildlife & Parks scraper
 * 
 * Main sources:
 * - Hunting regulations: https://fwp.mt.gov/hunt/regulations
 * - Season dates: https://fwp.mt.gov/hunt/seasons
 */
export async function scrapeMontana(job: Job<ScrapeJob>): Promise<void> {
  const { type } = job.data
  
  console.log(`Starting Montana scrape: ${type}`)
  
  // TODO: Implement Montana scraper
  // Similar structure to Colorado scraper
  
  job.updateProgress(100)
  console.log('Montana scrape complete (placeholder)')
}
