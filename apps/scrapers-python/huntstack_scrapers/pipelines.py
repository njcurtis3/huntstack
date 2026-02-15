"""
Scrapy pipelines for processing scraped hunting data.
"""

import os
import json
import requests
from typing import Any
import pdfplumber
from io import BytesIO
from datetime import datetime

from huntstack_scrapers.species_mapping import resolve_species_slug


class DatabasePipeline:
    """Pipeline to store scraped items in PostgreSQL."""

    def __init__(self):
        self.db_url = os.getenv("DATABASE_URL")
        self.conn = None
        self.state_id_map = {}  # state_code -> state_id
        self.species_map = {}  # species_slug -> species_id
        self.location_map = {}  # refuge_name -> location_id

    def open_spider(self, spider):
        """Connect to database when spider opens."""
        if self.db_url:
            import psycopg2
            self.conn = psycopg2.connect(self.db_url)
            spider.logger.info("Connected to database")
            # Load state_code -> state_id mapping
            with self.conn.cursor() as cur:
                cur.execute("SELECT code, id FROM states")
                for code, state_id in cur.fetchall():
                    self.state_id_map[code] = str(state_id)
            spider.logger.info(f"Loaded {len(self.state_id_map)} state mappings")

            # Load species slug -> id mapping
            with self.conn.cursor() as cur:
                cur.execute("SELECT slug, id FROM species")
                for slug, sp_id in cur.fetchall():
                    self.species_map[slug] = str(sp_id)
            spider.logger.info(f"Loaded {len(self.species_map)} species mappings")

            # Load refuge location name -> id mapping
            with self.conn.cursor() as cur:
                cur.execute("""
                    SELECT name, id FROM locations
                    WHERE location_type = 'wildlife_refuge'
                      AND name NOT LIKE '%% - Statewide MWI'
                """)
                for name, loc_id in cur.fetchall():
                    self.location_map[name] = str(loc_id)
            spider.logger.info(f"Loaded {len(self.location_map)} refuge location mappings")
        else:
            spider.logger.warning("DATABASE_URL not set, items will not be stored")

    def close_spider(self, spider):
        """Close database connection when spider closes."""
        if self.conn:
            self.conn.close()

    def process_item(self, item: dict, spider) -> dict:
        """Process and store item in database."""
        if not self.conn:
            return item

        item_type = item.get("type")

        if item_type == "pdf":
            self._process_pdf(item, spider)
        elif item_type == "page":
            self._process_page(item, spider)
        elif item_type == "regulation":
            self._process_regulation(item, spider)
        elif item_type == "refuge_count":
            self._process_refuge_count(item, spider)

        return item

    def _process_pdf(self, item: dict, spider):
        """Extract text from PDF and store."""
        try:
            pdf_bytes = item.get("content")
            if not pdf_bytes:
                return

            # Extract text using pdfplumber
            text_content = []
            with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
                for page in pdf.pages:
                    text = page.extract_text()
                    if text:
                        text_content.append(text)

            full_text = "\n\n".join(text_content)

            # Store in documents table
            state_code = item.get("state_code")
            state_id = self.state_id_map.get(state_code)
            with self.conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO documents (title, content, document_type, source_url, source_type, state_id, metadata)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT DO NOTHING
                    RETURNING id
                """, (
                    item.get("link_title", "PDF Document"),
                    full_text,
                    "regulation",
                    item.get("url"),
                    "state_agency",
                    state_id,
                    json.dumps({
                        "state_code": state_code,
                        "source_page": item.get("source_page"),
                        "scraped_at": item.get("scraped_at"),
                        "page_count": len(text_content),
                    })
                ))
                self.conn.commit()

            spider.logger.info(f"Stored PDF content: {item.get('url')}")

        except Exception as e:
            spider.logger.error(f"Error processing PDF: {e}")

    def _process_page(self, item: dict, spider):
        """Store page content."""
        try:
            state_code = item.get("state_code")
            state_id = self.state_id_map.get(state_code)
            with self.conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO documents (title, content, document_type, source_url, source_type, state_id, metadata)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT DO NOTHING
                """, (
                    item.get("title", "Web Page"),
                    item.get("content", ""),
                    "page",
                    item.get("url"),
                    "state_agency",
                    state_id,
                    json.dumps({
                        "state_code": state_code,
                        "scraped_at": item.get("scraped_at"),
                    })
                ))
                self.conn.commit()

            spider.logger.info(f"Stored page: {item.get('url')}")

        except Exception as e:
            spider.logger.error(f"Error storing page: {e}")

    def _process_regulation(self, item: dict, spider):
        """Store regulation content."""
        try:
            state_code = item.get("state_code")
            state_id = self.state_id_map.get(state_code)
            with self.conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO documents (title, content, document_type, source_url, source_type, state_id, metadata)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT DO NOTHING
                """, (
                    item.get("title", "Regulation"),
                    item.get("content", ""),
                    "regulation",
                    item.get("url"),
                    "state_agency",
                    state_id,
                    json.dumps({
                        "state_code": state_code,
                        "scraped_at": item.get("scraped_at"),
                    })
                ))
                self.conn.commit()

        except Exception as e:
            spider.logger.error(f"Error storing regulation: {e}")

    def _process_refuge_count(self, item: dict, spider):
        """Store weekly refuge survey counts in refuge_counts table."""
        try:
            refuge_name = item.get("refuge_name")
            location_id = self.location_map.get(refuge_name)
            if not location_id:
                spider.logger.warning(f"No location_id found for refuge: {refuge_name}")
                return

            survey_date = item.get("survey_date")
            species_counts = item.get("species_counts", {})
            observers = item.get("observers")
            source_url = item.get("source_url")
            survey_type = item.get("survey_type", "weekly")
            inserted = 0

            for species_name, count in species_counts.items():
                slug = resolve_species_slug(species_name)
                if slug is None:
                    continue

                species_id = self.species_map.get(slug)
                if not species_id:
                    spider.logger.debug(f"Species slug '{slug}' not in DB, skipping")
                    continue

                with self.conn.cursor() as cur:
                    cur.execute("""
                        INSERT INTO refuge_counts
                            (location_id, species_id, survey_date, count, survey_type,
                             source_url, observers, notes, metadata)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
                        ON CONFLICT (location_id, species_id, survey_date, survey_type)
                        DO UPDATE SET count = EXCLUDED.count,
                                     observers = EXCLUDED.observers,
                                     source_url = EXCLUDED.source_url
                    """, (
                        location_id,
                        species_id,
                        survey_date,
                        count,
                        survey_type,
                        source_url,
                        observers,
                        None,
                        json.dumps({
                            "scraped_at": item.get("scraped_at"),
                            "raw_species_name": species_name,
                        }),
                    ))
                    inserted += 1

            self.conn.commit()
            spider.logger.info(
                f"Stored {inserted} species counts for {refuge_name} "
                f"(date: {survey_date})"
            )

        except Exception as e:
            spider.logger.error(f"Error storing refuge count: {e}")
            if self.conn:
                self.conn.rollback()


TOGETHER_API_URL = "https://api.together.xyz/v1/embeddings"
EMBEDDING_MODEL = "BAAI/bge-base-en-v1.5"


class EmbeddingPipeline:
    """Pipeline to generate embeddings for RAG using Together.ai."""

    def __init__(self):
        self.api_key = os.getenv("TOGETHER_API_KEY")
        self.chunk_size = 600  # ~300-800 tokens for regulatory text
        self.chunk_overlap = 100

    def open_spider(self, spider):
        """Verify Together.ai API key."""
        if self.api_key:
            spider.logger.info("Together.ai API key configured for embeddings")
        else:
            spider.logger.warning("TOGETHER_API_KEY not set, embeddings will not be generated")

    def process_item(self, item: dict, spider) -> dict:
        """Generate embeddings for text content."""
        if not self.api_key:
            return item

        content = item.get("content")
        if not content or isinstance(content, bytes):
            return item

        # Skip if content is too short
        if len(content) < 100:
            return item

        try:
            chunks = self._chunk_text(content)

            for i, chunk in enumerate(chunks):
                embedding = self._generate_embedding(chunk)

                if embedding:
                    self._store_chunk(item, i, chunk, embedding, spider)

            spider.logger.info(f"Generated {len(chunks)} embeddings for {item.get('url')}")

        except Exception as e:
            spider.logger.error(f"Error generating embeddings: {e}")

        return item

    def _chunk_text(self, text: str) -> list[str]:
        """Split text into overlapping chunks optimized for regulation text."""
        chunks = []
        start = 0

        while start < len(text):
            end = start + self.chunk_size

            # Try to break at sentence or section boundary
            if end < len(text):
                for punct in ['\n\n', '. ', '? ', '! ', '\n']:
                    last_punct = text[start:end].rfind(punct)
                    if last_punct > self.chunk_size // 2:
                        end = start + last_punct + len(punct)
                        break

            chunk = text[start:end].strip()
            if chunk:
                chunks.append(chunk)

            start = end - self.chunk_overlap

        return chunks

    def _generate_embedding(self, text: str) -> list[float] | None:
        """Generate embedding using Together.ai."""
        try:
            response = requests.post(
                TOGETHER_API_URL,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": EMBEDDING_MODEL,
                    "input": text,
                },
                timeout=30,
            )
            response.raise_for_status()
            data = response.json()
            return data["data"][0]["embedding"]
        except Exception as e:
            return None

    def _store_chunk(self, item: dict, index: int, chunk: str, embedding: list[float], spider):
        """Store chunk with embedding in database."""
        db_url = os.getenv("DATABASE_URL")
        if not db_url:
            return

        try:
            import psycopg2

            with psycopg2.connect(db_url) as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        SELECT id FROM documents WHERE source_url = %s
                    """, (item.get("url"),))

                    result = cur.fetchone()
                    if not result:
                        return

                    document_id = result[0]

                    cur.execute("""
                        INSERT INTO document_chunks (document_id, chunk_index, content, embedding, token_count, metadata)
                        VALUES (%s, %s, %s, %s::vector, %s, %s)
                        ON CONFLICT DO NOTHING
                    """, (
                        document_id,
                        index,
                        chunk,
                        str(embedding),
                        len(chunk.split()),
                        json.dumps({
                            "state_code": item.get("state_code"),
                            "source_url": item.get("url"),
                        }),
                    ))
                    conn.commit()

        except Exception as e:
            spider.logger.error(f"Error storing chunk: {e}")
