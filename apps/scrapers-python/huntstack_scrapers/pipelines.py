"""
Scrapy pipelines for processing scraped hunting data.
"""

import os
from typing import Any
import pdfplumber
from io import BytesIO
import openai
from datetime import datetime


class DatabasePipeline:
    """Pipeline to store scraped items in PostgreSQL."""
    
    def __init__(self):
        self.db_url = os.getenv("DATABASE_URL")
        self.conn = None
    
    def open_spider(self, spider):
        """Connect to database when spider opens."""
        if self.db_url:
            import psycopg2
            self.conn = psycopg2.connect(self.db_url)
            spider.logger.info("Connected to database")
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
            with self.conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO documents (title, content, document_type, source_url, source_type, metadata)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT DO NOTHING
                    RETURNING id
                """, (
                    item.get("link_title", "PDF Document"),
                    full_text,
                    "regulation",
                    item.get("url"),
                    "state_agency",
                    {
                        "state_code": item.get("state_code"),
                        "source_page": item.get("source_page"),
                        "scraped_at": item.get("scraped_at"),
                        "page_count": len(text_content),
                    }
                ))
                self.conn.commit()
                
            spider.logger.info(f"Stored PDF content: {item.get('url')}")
            
        except Exception as e:
            spider.logger.error(f"Error processing PDF: {e}")
    
    def _process_page(self, item: dict, spider):
        """Store page content."""
        try:
            with self.conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO documents (title, content, document_type, source_url, source_type, metadata)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT DO NOTHING
                """, (
                    item.get("title", "Web Page"),
                    item.get("content", ""),
                    "page",
                    item.get("url"),
                    "state_agency",
                    {
                        "state_code": item.get("state_code"),
                        "scraped_at": item.get("scraped_at"),
                    }
                ))
                self.conn.commit()
                
            spider.logger.info(f"Stored page: {item.get('url')}")
            
        except Exception as e:
            spider.logger.error(f"Error storing page: {e}")
    
    def _process_regulation(self, item: dict, spider):
        """Store regulation content."""
        try:
            with self.conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO documents (title, content, document_type, source_url, source_type, metadata)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT DO NOTHING
                """, (
                    item.get("title", "Regulation"),
                    item.get("content", ""),
                    "regulation",
                    item.get("url"),
                    "state_agency",
                    {
                        "state_code": item.get("state_code"),
                        "scraped_at": item.get("scraped_at"),
                    }
                ))
                self.conn.commit()
                
        except Exception as e:
            spider.logger.error(f"Error storing regulation: {e}")


class EmbeddingPipeline:
    """Pipeline to generate embeddings for RAG."""
    
    def __init__(self):
        self.api_key = os.getenv("OPENAI_API_KEY")
        self.client = None
        self.chunk_size = 1000  # Characters per chunk
        self.chunk_overlap = 200
    
    def open_spider(self, spider):
        """Initialize OpenAI client."""
        if self.api_key:
            self.client = openai.OpenAI(api_key=self.api_key)
            spider.logger.info("OpenAI client initialized")
        else:
            spider.logger.warning("OPENAI_API_KEY not set, embeddings will not be generated")
    
    def process_item(self, item: dict, spider) -> dict:
        """Generate embeddings for text content."""
        if not self.client:
            return item
        
        content = item.get("content")
        if not content or isinstance(content, bytes):
            return item
        
        # Skip if content is too short
        if len(content) < 100:
            return item
        
        try:
            # Chunk the content
            chunks = self._chunk_text(content)
            
            # Generate embeddings for each chunk
            for i, chunk in enumerate(chunks):
                embedding = self._generate_embedding(chunk)
                
                if embedding:
                    # Store chunk with embedding
                    self._store_chunk(item, i, chunk, embedding, spider)
            
            spider.logger.info(f"Generated {len(chunks)} embeddings for {item.get('url')}")
            
        except Exception as e:
            spider.logger.error(f"Error generating embeddings: {e}")
        
        return item
    
    def _chunk_text(self, text: str) -> list[str]:
        """Split text into overlapping chunks."""
        chunks = []
        start = 0
        
        while start < len(text):
            end = start + self.chunk_size
            
            # Try to break at sentence boundary
            if end < len(text):
                # Look for period, question mark, or exclamation
                for punct in ['. ', '? ', '! ', '\n\n']:
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
        """Generate embedding using OpenAI."""
        try:
            response = self.client.embeddings.create(
                model="text-embedding-3-small",
                input=text
            )
            return response.data[0].embedding
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
                    # First, get the document ID
                    cur.execute("""
                        SELECT id FROM documents WHERE source_url = %s
                    """, (item.get("url"),))
                    
                    result = cur.fetchone()
                    if not result:
                        return
                    
                    document_id = result[0]
                    
                    # Insert chunk with embedding
                    # Note: This requires pgvector extension
                    cur.execute("""
                        INSERT INTO document_chunks (document_id, chunk_index, content, embedding, token_count)
                        VALUES (%s, %s, %s, %s::vector, %s)
                        ON CONFLICT DO NOTHING
                    """, (
                        document_id,
                        index,
                        chunk,
                        embedding,
                        len(chunk.split()),  # Rough token estimate
                    ))
                    conn.commit()
                    
        except Exception as e:
            spider.logger.error(f"Error storing chunk: {e}")
