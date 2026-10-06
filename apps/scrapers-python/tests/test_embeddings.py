"""Tests for huntstack_scrapers.pipelines.embed_texts — the shared OpenAI embedding call."""

import json

import pytest

from huntstack_scrapers import pipelines
from huntstack_scrapers.pipelines import EMBEDDING_DIMENSIONS, embed_texts


class FakeResponse:
    def __init__(self, status_code, body):
        self.status_code = status_code
        self.ok = 200 <= status_code < 300
        self._body = body
        self.text = json.dumps(body)

    def json(self):
        return self._body


def fake_post(monkeypatch, status_code, body):
    calls = []

    def post(url, headers, json, timeout):
        calls.append({"url": url, "headers": headers, "json": json})
        return FakeResponse(status_code, body)

    monkeypatch.setattr(pipelines.requests, "post", post)
    return calls


def vector(n, value=0.1):
    return [value] * n


def test_requests_vectors_sized_for_the_column(monkeypatch):
    calls = fake_post(monkeypatch, 200, {"data": [
        {"index": 0, "embedding": vector(1024)},
    ]})

    embed_texts(["snow geese"], "sk-test")

    assert calls[0]["url"] == "https://api.openai.com/v1/embeddings"
    assert calls[0]["headers"]["Authorization"] == "Bearer sk-test"
    assert calls[0]["json"] == {
        "model": "text-embedding-3-small",
        "input": ["snow geese"],
        "dimensions": 1024,
    }
    assert EMBEDDING_DIMENSIONS == 1024


def test_returns_vectors_in_input_order(monkeypatch):
    fake_post(monkeypatch, 200, {"data": [
        {"index": 1, "embedding": vector(1024, 0.2)},
        {"index": 0, "embedding": vector(1024, 0.1)},
    ]})

    result = embed_texts(["first", "second"], "sk-test")

    assert result[0][0] == 0.1
    assert result[1][0] == 0.2


def test_failed_request_raises_with_the_error_body(monkeypatch):
    fake_post(monkeypatch, 401, {"error": {"message": "Incorrect API key provided"}})

    with pytest.raises(RuntimeError, match="401.*Incorrect API key"):
        embed_texts(["x"], "sk-bad")


def test_wrong_dimension_raises_instead_of_reaching_pgvector(monkeypatch):
    fake_post(monkeypatch, 200, {"data": [{"index": 0, "embedding": vector(1536)}]})

    with pytest.raises(RuntimeError, match="expected 1024 dims"):
        embed_texts(["x"], "sk-test")


def test_missing_vectors_raise(monkeypatch):
    fake_post(monkeypatch, 200, {"data": [{"index": 0, "embedding": vector(1024)}]})

    with pytest.raises(RuntimeError, match="1 vectors for 2 inputs"):
        embed_texts(["a", "b"], "sk-test")
