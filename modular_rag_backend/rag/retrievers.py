from abc import ABC, abstractmethod
from .schemas import RetrievedDocument


class BaseRetriever(ABC):
    @abstractmethod
    def retrieve(self, query: str, top_k: int, filters=None):
        raise NotImplementedError


class DenseRetriever(BaseRetriever):
    """Current implementation: embedding + Chroma ANN similarity search."""

    def __init__(self, embeddings, vector_store):
        self.embeddings = embeddings
        self.vector_store = vector_store

    def retrieve(self, query: str, top_k: int, filters=None):
        query_embedding = self.embeddings.embed_query(query)

        results = self.vector_store.query(
            query_embedding=query_embedding,
            top_k=top_k,
            where=filters,
        )

        documents = results.get("documents", [[]])[0]
        ids = results.get("ids", [[]])[0]
        metadatas = results.get("metadatas", [[]])[0]
        distances = results.get("distances", [[]])[0]

        retrieved = []

        for i, doc in enumerate(documents):
            distance = distances[i] if distances else None

            # Chroma's returned distance depends on the collection metric.
            # Preserve it and expose a simple derived score for the API.
            similarity = None
            if distance is not None:
                similarity = max(0.0, 1.0 - float(distance))

            retrieved.append(
                RetrievedDocument(
                    id=ids[i],
                    document=doc,
                    metadata=metadatas[i] or {},
                    distance=distance,
                    similarity_score=similarity,
                    rank=i + 1,
                )
            )

        return retrieved


# class RetrieverRegistry:
#     def __init__(self, dense_retriever):
#         self.retrievers = {
#             "dense": dense_retriever,
#         }

#     def get(self, name: str):
#         if name not in self.retrievers:
#             raise ValueError(
#                 f"Unknown retriever '{name}'. "
#                 f"Available: {list(self.retrievers)}"
#             )
#         return self.retrievers[name]


class RetrieverRegistry:

    def __init__(
        self,
        dense_retriever,
        bm25_retriever,
        hybrid_retriever,
    ):

        self.retrievers = {
            "dense": dense_retriever,
            "bm25": bm25_retriever,
            "hybrid": hybrid_retriever,
        }

    def get(self, name: str):

        if name not in self.retrievers:
            raise ValueError(
                f"Unknown retriever '{name}'. "
                f"Available: {list(self.retrievers)}"
            )

        return self.retrievers[name]
