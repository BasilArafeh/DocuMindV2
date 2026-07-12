"""config.py — Application settings from environment variables."""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    """Application settings and API configuration."""

    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
    )

    OPENAI_API_KEY: str
    OPENAI_CHAT_MODEL: str = "gpt-4o-mini"
    PINECONE_API_KEY: str
    PINECONE_INDEX_NAME: str
    PINECONE_NAMESPACE: str = ""
    COHERE_API_KEY: str
    COHERE_RERANK_ENABLED: bool = True
    APP_ENV: str = "development"
    MAX_FILE_SIZE_MB: int = 25


settings = Settings()
