import os
from dataclasses import dataclass
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent


@dataclass
class Settings:
    chroma_path: str = os.getenv("CHROMA_PATH", str(BASE_DIR / "ChromaDB"))
    collection_name: str = os.getenv("CHROMA_COLLECTION", "pdf_documents")

    embedding_model: str = os.getenv(
        "EMBEDDING_MODEL", "all-MiniLM-L6-v2"
    )
    groq_model: str = os.getenv(
        "GROQ_MODEL", "openai/gpt-oss-120b"
    )

    default_top_k: int = int(os.getenv("RAG_TOP_K", "5"))
    rerank_enabled: bool = os.getenv(
        "RAG_RERANK_ENABLED", "true"
    ).lower() == "true"
    rerank_top_k: int = int(os.getenv("RAG_RERANK_TOP_K", "3"))

    # Modular switches. These are deliberately strings so implementations
    # can be replaced without changing the pipeline.
    retriever: str = os.getenv("RAG_RETRIEVER", "hybrid")
    reranker: str = os.getenv("RAG_RERANKER", "cross_encoder")
    generator: str = os.getenv("RAG_GENERATOR", "groq")
    router: str = os.getenv("RAG_ROUTER", "rule_based")


settings = Settings()
