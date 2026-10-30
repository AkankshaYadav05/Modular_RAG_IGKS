from typing import List

from .schemas import RetrievedDocument
from .retrievers import DenseRetriever
from .bm25_retriever import BM25Retriever


class HybridRetriever:
    """
    Combines Dense Retrieval and BM25 Retrieval.

    Hybrid score:

        hybrid_score =
            dense_weight * dense_score
            +
            bm25_weight * bm25_score
    """

    def __init__(
        self,
        dense_retriever: DenseRetriever,
        bm25_retriever: BM25Retriever,
        dense_weight: float = 0.7,
        bm25_weight: float = 0.3,
    ):
        self.dense_retriever = dense_retriever
        self.bm25_retriever = bm25_retriever

        self.dense_weight = dense_weight
        self.bm25_weight = bm25_weight

    @staticmethod
    def _normalize_scores(documents, score_type):

        if not documents:
            return {}

        scores = []

        for doc in documents:

            if score_type == "dense":
                score = doc.similarity_score or 0.0

            else:
                score = doc.bm25_score or 0.0

            scores.append(score)

        min_score = min(scores)
        max_score = max(scores)

        normalized = {}

        for doc, score in zip(documents, scores):

            if max_score == min_score:
                normalized_score = 1.0
            else:
                normalized_score = (
                    (score - min_score)
                    / (max_score - min_score)
                )

            normalized[doc.id] = normalized_score

        return normalized

    def retrieve(
        self,
        query: str,
        top_k: int = 5,
        filters=None,
    ) -> List[RetrievedDocument]:

        # --------------------------------
        # 1. Dense Retrieval
        # --------------------------------

        dense_results = self.dense_retriever.retrieve(
            query=query,
            top_k=top_k,
            filters=filters,
        )

        # --------------------------------
        # 2. BM25 Retrieval
        # --------------------------------

        bm25_results = self.bm25_retriever.retrieve(
            query=query,
            top_k=top_k,
            filters=filters,
        )

        # --------------------------------
        # 3. Normalize scores
        # --------------------------------

        dense_scores = self._normalize_scores(
            dense_results,
            "dense"
        )

        bm25_scores = self._normalize_scores(
            bm25_results,
            "bm25"
        )

        

        # --------------------------------
        # 4. Merge documents
        # --------------------------------

        documents = {}

        for doc in dense_results:
            documents[doc.id] = doc

        for doc in bm25_results:

            if doc.id not in documents:
                documents[doc.id] = doc

        # --------------------------------
        # 5. Calculate Hybrid Score
        # --------------------------------

        for doc_id, doc in documents.items():

            dense_score = dense_scores.get(
                doc_id,
                0.0
            )

            bm25_score = bm25_scores.get(
                doc_id,
                0.0
            )

            doc.dense_normalized_score = dense_score
            doc.bm25_normalized_score = bm25_score

            doc.hybrid_score = (
                self.dense_weight * dense_score
                +
                self.bm25_weight * bm25_score
            )

        # --------------------------------
        # 6. Sort by Hybrid Score
        # --------------------------------

        ranked_documents = sorted(
            documents.values(),
            key=lambda x: x.hybrid_score,
            reverse=True
        )

        # --------------------------------
        # 7. Assign final ranks
        # --------------------------------

        for rank, doc in enumerate(
            ranked_documents[:top_k],
            start=1
        ):
            doc.rank = rank

        return ranked_documents[:top_k]