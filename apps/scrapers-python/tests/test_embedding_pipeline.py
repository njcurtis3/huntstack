"""EmbeddingPipeline stores each text once: not what another page holds, not repeats within a page."""

import hashlib
import logging

from huntstack_scrapers import pipelines
from huntstack_scrapers.pipelines import EmbeddingPipeline, chunk_hash


class Spider:
    logger = logging.getLogger("test")


def _pipeline(monkeypatch, chunks, elsewhere=frozenset(), embed=lambda text: [0.0]):
    p = EmbeddingPipeline()
    p.api_key = "key"
    stored = {}
    monkeypatch.setattr(pipelines, "clean_text", lambda c: c)
    monkeypatch.setattr(p, "_chunk_text", lambda text: chunks)
    monkeypatch.setattr(p, "_held_elsewhere", lambda item, cs, spider: {chunk_hash(c) for c in elsewhere})
    monkeypatch.setattr(p, "_generate_embedding", lambda text, spider: embed(text))
    monkeypatch.setattr(p, "_store_chunks", lambda item, embedded, spider: stored.setdefault("rows", embedded))
    return p, stored


ITEM = {"url": "https://ksoutdoors.gov/x", "type": "regulation", "content": "x" * 300}


def test_chunk_hash_matches_postgres_md5():
    assert chunk_hash("Kansas HIP Stamp: $2.50") == hashlib.md5(b"Kansas HIP Stamp: $2.50").hexdigest()
    assert chunk_hash("café") == hashlib.md5("café".encode("utf-8")).hexdigest()


def test_skips_text_held_elsewhere_and_repeats_keeping_positions(monkeypatch):
    p, stored = _pipeline(monkeypatch, ["own", "stamp prices", "own", "more own"], elsewhere={"stamp prices"})
    p.process_item(dict(ITEM), Spider())
    assert [(i, c) for i, c, _ in stored["rows"]] == [(0, "own"), (3, "more own")]


def test_a_page_whose_text_is_all_elsewhere_clears_its_own_chunks(monkeypatch):
    p, stored = _pipeline(monkeypatch, ["stamp prices"], elsewhere={"stamp prices"})
    p.process_item(dict(ITEM), Spider())
    assert stored["rows"] == []


def test_failed_embeddings_leave_existing_chunks_alone(monkeypatch):
    p, stored = _pipeline(monkeypatch, ["own"], embed=lambda text: None)
    p.process_item(dict(ITEM), Spider())
    assert "rows" not in stored
