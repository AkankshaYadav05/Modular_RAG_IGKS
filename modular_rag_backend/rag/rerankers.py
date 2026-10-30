from abc import ABC, abstractmethod
from typing import Dict,Any, List
from sentence_transformers import CrossEncoder


class BaseReranker:
    def rerank(
        self,
        query: str,
        documents: List[Dict[str, Any]],
        top_k: int = 3
    ) -> List[Dict[str, Any]]:
        raise NotImplementedError


class NoOpReranker(BaseReranker):
    def rerank(
        self,
        query: str,
        documents: List[Dict[str, Any]],
        top_k: int = 3
    ) -> List[Dict[str, Any]]:
        return documents[:top_k]


class CrossEncoderReranker(BaseReranker):
    def __init__(
        self,
        model_name: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"
    ):
        self.model = CrossEncoder(model_name)

    def rerank(
        self,
        query: str,
        documents: List[Dict[str, Any]],
        top_k: int = 3
    ) -> List[Dict[str, Any]]:

        if not documents:
            return []

        pairs = [
            # (query, document["document"])
            (query, document.document)
            for document in documents
        ]

        scores = self.model.predict(pairs)

        for document, score in zip(documents, scores):
            # document["rerank_score"] = float(score)
            document.rerank_score = float(score)

        # documents.sort(
        #     # key=lambda x: x["rerank_score"],
        #     key=lambda x: x.rerank_score,
        #     reverse=True
        # )
        # return documents[:top_k]

        documents.sort(
            key=lambda x: x.rerank_score,
            reverse=True
        )

        reranked_documents = documents[:top_k]

        for rank, document in enumerate(
            reranked_documents,
            start=1
        ):
            document.rank = rank

        return reranked_documents

        


class RerankerRegistry:
    def __init__(self, enabled=False):
        self.rerankers: Dict[str, BaseReranker] = {
            "none": NoOpReranker()
        }

        if enabled:
            self.rerankers["cross_encoder"] = CrossEncoderReranker()

    def get(self, name):
        if name not in self.rerankers:
            raise ValueError(
                f"Unknown reranker '{name}'. "
                f"Available: {list(self.rerankers)}"
            )

        return self.rerankers[name]