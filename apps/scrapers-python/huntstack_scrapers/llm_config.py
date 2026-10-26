"""Where the scrapers' LLM calls go.

OpenAI-compatible chat/completions, configured by the same variables as the API
(apps/api/src/lib/together.ts): LLM_BASE_URL, LLM_MODEL, LLM_API_KEY. Defaults are Together's;
TOGETHER_API_KEY still works as the key. To run through OpenRouter:
    LLM_BASE_URL=https://openrouter.ai/api/v1
    LLM_MODEL=meta-llama/llama-3.3-70b-instruct
    LLM_API_KEY=<OpenRouter key>
Read lazily: the cleanup scripts call load_dotenv() after importing the package.
"""
import os

DEFAULT_BASE_URL = "https://api.together.xyz/v1"
DEFAULT_MODEL = "meta-llama/Llama-3.3-70B-Instruct-Turbo"


def llm_api_key() -> str | None:
    return os.getenv("LLM_API_KEY") or os.getenv("TOGETHER_API_KEY") or None


def llm_chat_url() -> str:
    return (os.getenv("LLM_BASE_URL") or DEFAULT_BASE_URL).rstrip("/") + "/chat/completions"


def llm_model() -> str:
    return os.getenv("LLM_MODEL") or DEFAULT_MODEL
