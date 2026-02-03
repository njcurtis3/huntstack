# Scrapy settings for huntsource_scrapers project

BOT_NAME = "huntsource_scrapers"

SPIDER_MODULES = ["huntsource_scrapers.spiders"]
NEWSPIDER_MODULE = "huntsource_scrapers.spiders"

# Crawl responsibly by identifying yourself
USER_AGENT = "HuntSource Bot (+https://huntsource.com/bot)"

# Obey robots.txt rules
ROBOTSTXT_OBEY = True

# Configure maximum concurrent requests
CONCURRENT_REQUESTS = 4

# Configure a delay for requests for the same website
DOWNLOAD_DELAY = 2

# Disable cookies (enabled by default)
COOKIES_ENABLED = False

# Enable or disable downloader middlewares
DOWNLOADER_MIDDLEWARES = {
    "scrapy.downloadermiddlewares.useragent.UserAgentMiddleware": None,
    "scrapy.downloadermiddlewares.retry.RetryMiddleware": 90,
}

# Configure item pipelines
ITEM_PIPELINES = {
    "huntsource_scrapers.pipelines.DatabasePipeline": 300,
    "huntsource_scrapers.pipelines.EmbeddingPipeline": 400,
}

# Enable and configure HTTP caching
HTTPCACHE_ENABLED = True
HTTPCACHE_EXPIRATION_SECS = 86400  # 24 hours
HTTPCACHE_DIR = "httpcache"

# Logging
LOG_LEVEL = "INFO"

# Custom settings
FEED_EXPORT_ENCODING = "utf-8"

# Database connection (from environment)
import os
DATABASE_URL = os.getenv("DATABASE_URL")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
