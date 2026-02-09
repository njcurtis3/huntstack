# Scrapy settings for huntstack_scrapers project

BOT_NAME = "huntstack_scrapers"

SPIDER_MODULES = ["huntstack_scrapers.spiders"]
NEWSPIDER_MODULE = "huntstack_scrapers.spiders"

# Crawl responsibly by identifying yourself
USER_AGENT = "HuntStack Bot (+https://huntstack.com/bot)"

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
    "huntstack_scrapers.pipelines.DatabasePipeline": 300,
    "huntstack_scrapers.pipelines.EmbeddingPipeline": 400,
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
from pathlib import Path
from dotenv import load_dotenv

# Load .env from project root
load_dotenv(Path(__file__).resolve().parents[3] / ".env")

DATABASE_URL = os.getenv("DATABASE_URL")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
TOGETHER_API_KEY = os.getenv("TOGETHER_API_KEY")
