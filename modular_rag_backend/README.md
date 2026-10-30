# IGKE Modular RAG Backend

This is a modular refactor of the previous `backend.py`.

Pipeline:
User Query -> Router -> Retriever -> Reranker -> Generator -> Sources

The existing ChromaDB collection is reused. No re-indexing is required for the first migration.

## Run

Keep `backend.py`, the `rag/` folder, and `ChromaDB/` in `modular_rag_backend/`. The backend serves the UI from the sibling `modular_rag_frontend/` folder (or from `modular_rag_backend/frontend/` if present).

Set:
- `GROQ_API_KEY`

Optional:
- `CHROMA_PATH`
- `CHROMA_COLLECTION`
- `EMBEDDING_MODEL`
- `GROQ_MODEL`
- `RAG_TOP_K`
- `RAG_RERANK_ENABLED=true`
- `RAG_RERANKER=cross_encoder`

Then:
`uvicorn backend:app --reload --port 8000`

Open `http://localhost:8000` to use the frontend. The UI calls `/api/health` and `/api/query` on the same backend.

## Important

The first version keeps dense retrieval as the active implementation because the existing ChromaDB is already built around embeddings. The interfaces are intentionally separated so BM25/hybrid retrieval, alternative embedding models, alternative vector stores, query rewriting, and alternative LLMs can be added without rewriting the whole pipeline.
