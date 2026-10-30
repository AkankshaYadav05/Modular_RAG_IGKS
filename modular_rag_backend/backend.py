import os
import time
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")
FRONTEND_DIR = BASE_DIR / "frontend"
if not FRONTEND_DIR.is_dir():
    FRONTEND_DIR = BASE_DIR.parent / "modular_rag_frontend"

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from rag.config import settings
from rag.embeddings import EmbeddingProvider
from rag.vector_store import ChromaVectorStore

from rag.rerankers import RerankerRegistry
from rag.router import RouterRegistry
from rag.generators import GeneratorRegistry
from rag.pipeline import ModularRAG

from rag.retrievers import DenseRetriever, RetrieverRegistry
from rag.bm25_retriever import BM25Retriever
from rag.hybrid import HybridRetriever


print("\nInitializing Modular RAG backend...\n")

# ---------------- Module construction ----------------

embedding_provider = EmbeddingProvider(settings.embedding_model)

vector_store = ChromaVectorStore(
    path=settings.chroma_path,
    collection_name=settings.collection_name,
)

# dense_retriever = DenseRetriever(
#     embeddings=embedding_provider,
#     vector_store=vector_store,
# )

# retrievers = RetrieverRegistry(dense_retriever)


dense_retriever = DenseRetriever(
    embeddings=embedding_provider,
    vector_store=vector_store,
)

bm25_retriever = BM25Retriever(
    vector_store=vector_store,
)

hybrid_retriever = HybridRetriever(
    dense_retriever=dense_retriever,
    bm25_retriever=bm25_retriever,
    dense_weight=0.7,
    bm25_weight=0.3,
)

retrievers = RetrieverRegistry(
    dense_retriever=dense_retriever,
    bm25_retriever=bm25_retriever,
    hybrid_retriever=hybrid_retriever,
)


routers = RouterRegistry()
router = routers.get(settings.router)

rerankers = RerankerRegistry(enabled=settings.rerank_enabled)

generators = GeneratorRegistry(
    model_name=settings.groq_model
)

modular_rag = ModularRAG(
    router=router,
    retrievers=retrievers,
    rerankers=rerankers,
    generators=generators,
)

print("Modular RAG initialized successfully.\n")


# ---------------- API ----------------

app = FastAPI(
    title="IGKE Modular RAG API",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Development only
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class QueryRequest(BaseModel):
    query: str = Field(..., min_length=1)
    top_k: int = Field(default=settings.default_top_k, ge=1, le=10)


@app.get("/")
def root():
    if FRONTEND_DIR.exists():
        return FileResponse(FRONTEND_DIR / "index.html")

    return {
        "message": "IGKE Modular RAG API is running",
        "docs": "/docs",
    }


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "architecture": "modular-rag",
        "collection": settings.collection_name,
        "documents": vector_store.count(),
        "embedding_model": settings.embedding_model,
        "retriever": settings.retriever,
        "reranker": settings.reranker,
        "rerank_enabled": settings.rerank_enabled,
        "generator": settings.generator,
        "router": settings.router,
    }


@app.post("/api/query")
def query_knowledge(request: QueryRequest):
    query = request.query.strip()

    if not query:
        raise HTTPException(
            status_code=400,
            detail="Query cannot be empty.",
        )

    try:
        # result = modular_rag.query(
        #     query=query,
        #     top_k=request.top_k,
        # )

        

        start = time.perf_counter()

        result = modular_rag.query(
            query=query,
            top_k=request.top_k
        )

        response_time = time.perf_counter() - start

        sources = []

        for doc in result.sources:
            metadata = doc.metadata or {}

            sources.append({
                "rank": doc.rank,
                "source": metadata.get("source", "Unknown source"),
                "page": metadata.get(
                    "page",
                    metadata.get("page_number", "N/A"),
                ),
                "similarity_score": doc.similarity_score,
                "rerank_score": doc.rerank_score,
                "excerpt": doc.document[:300].strip(),
                "bm25_score": doc.bm25_score,
                "hybrid_score": doc.hybrid_score,
                "dense_normalized_score": doc.dense_normalized_score,
                "bm25_normalized_score": doc.bm25_normalized_score,
            })

        return {
            "query": query,
            "answer": result.answer,
            "response_time": round(response_time, 3),
            "sources": sources,
            "routing": {
                "mode": result.plan.retrieval_mode,
                "top_k": result.plan.top_k,
                "reason": result.plan.reason,
            },
        }

    except Exception as exc:
        print("Query error:", repr(exc))
        raise HTTPException(
            status_code=500,
            detail=str(exc),
        )


if FRONTEND_DIR.exists():
    app.mount(
        "/",
        StaticFiles(directory=str(FRONTEND_DIR), html=True),
        name="frontend",
    )
