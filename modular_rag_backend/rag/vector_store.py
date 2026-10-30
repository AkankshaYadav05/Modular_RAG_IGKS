from pathlib import Path
import chromadb


class ChromaVectorStore:
    """Storage module. Can later be replaced by Qdrant/FAISS/etc."""

    def __init__(self, path: str, collection_name: str):
        path_obj = Path(path)
        if not path_obj.exists():
            raise FileNotFoundError(
                f"ChromaDB folder not found: {path_obj}"
            )

        self.client = chromadb.PersistentClient(path=str(path_obj))
        self.collection = self.client.get_or_create_collection(
            name=collection_name,
            metadata={"description": "Modular RAG vector store"},
        )

        print(
            f"[VectorStore] {collection_name}: "
            f"{self.collection.count()} records"
        )

    def count(self):
        return self.collection.count()

    def query(self, query_embedding, top_k=5, where=None):
        kwargs = {
            "query_embeddings": [query_embedding.tolist()],
            "n_results": top_k,
        }

        if where:
            kwargs["where"] = where

        return self.collection.query(**kwargs)
