# from __future__ import annotations

# import re
# from typing import Any, Dict, List

# from rank_bm25 import BM25Okapi

# from .vector_store import ChromaVectorStore


# class BM25Retriever:
#     """
#     Keyword-based retriever using BM25.

#     The index is built from the existing ChromaDB documents,
#     so no second document storage system is required.
#     """

#     def __init__(self, vector_store: ChromaVectorStore):
#         self.vector_store = vector_store

#         self.documents: List[str] = []
#         self.metadatas: List[Dict[str, Any]] = []
#         self.ids: List[str] = []

#         self.bm25: BM25Okapi | None = None

#         self._build_index()

#     @staticmethod
#     def _tokenize(text: str) -> List[str]:
#         """
#         Simple tokenizer for BM25.
#         Converts text to lowercase and keeps words/numbers.
#         """
#         return re.findall(r"\b\w+\b", text.lower())

#     def _build_index(self) -> None:
#         """
#         Load all existing documents from ChromaDB
#         and create the BM25 index.
#         """

#         collection = self.vector_store.collection

#         data = collection.get(
#             include=["documents", "metadatas"]
#         )

#         self.ids = data.get("ids", []) or []
#         self.documents = data.get("documents", []) or []
#         raw_metadatas = data.get("metadatas", []) or []

#         self.metadatas = [
#             dict(metadata) if metadata is not None else {}
#             for metadata in raw_metadatas
# ]

#         if not self.documents:
#             raise RuntimeError(
#                 "No documents found in ChromaDB. "
#                 "BM25 index cannot be created."
#             )

#         tokenized_documents = [
#             self._tokenize(document)
#             for document in self.documents
#         ]

#         self.bm25 = BM25Okapi(tokenized_documents)

#         print(
#             f"[BM25] Index built successfully with "
#             f"{len(self.documents)} documents."
#         )

#     def retrieve(
#         self,
#         query: str,
#         top_k: int = 5
#     ) -> List[Dict[str, Any]]:
#         """
#         Retrieve documents using BM25 keyword matching.
#         """

#         if self.bm25 is None:
#             raise RuntimeError("BM25 index has not been initialized.")

#         query_tokens = self._tokenize(query)

#         if not query_tokens:
#             return []

#         scores = self.bm25.get_scores(query_tokens)

#         ranked_indices = sorted(
#             range(len(scores)),
#             key=lambda i: scores[i],
#             reverse=True
#         )

#         results = []

#         for rank, index in enumerate(
#             ranked_indices[:top_k],
#             start=1
#         ):
#             results.append(
#                 {
#                     "id": self.ids[index],
#                     "document": self.documents[index],
#                     "metadata": self.metadatas[index],
#                     "bm25_score": float(scores[index]),
#                     "rank": rank,
#                 }
#             )

#         return results


from __future__ import annotations

import re
from typing import Any, Dict, List

from rank_bm25 import BM25Okapi

from .schemas import RetrievedDocument
from .vector_store import ChromaVectorStore


class BM25Retriever:
    """
    Keyword-based retriever using BM25.

    The index is built from the existing ChromaDB documents,
    so no second document storage system is required.
    """

    def __init__(self, vector_store: ChromaVectorStore):
        self.vector_store = vector_store

        self.documents: List[str] = []
        self.metadatas: List[Dict[str, Any]] = []
        self.ids: List[str] = []

        self.bm25: BM25Okapi | None = None

        self._build_index()

    @staticmethod
    def _tokenize(text: str) -> List[str]:
        return re.findall(r"\b\w+\b", text.lower())

    def _build_index(self) -> None:

        collection = self.vector_store.collection

        data = collection.get(
            include=["documents", "metadatas"]
        )

        self.ids = data.get("ids", []) or []
        self.documents = data.get("documents", []) or []

        raw_metadatas = data.get("metadatas", []) or []

        self.metadatas = [
            dict(metadata) if metadata is not None else {}
            for metadata in raw_metadatas
        ]

        if not self.documents:
            raise RuntimeError(
                "No documents found in ChromaDB. "
                "BM25 index cannot be created."
            )

        tokenized_documents = [
            self._tokenize(document)
            for document in self.documents
        ]

        self.bm25 = BM25Okapi(tokenized_documents)

        print(
            f"[BM25] Index built successfully with "
            f"{len(self.documents)} documents."
        )

    def retrieve(
        self,
        query: str,
        top_k: int = 5,
        filters=None
    ) -> List[RetrievedDocument]:

        if self.bm25 is None:
            raise RuntimeError(
                "BM25 index has not been initialized."
            )

        query_tokens = self._tokenize(query)

        if not query_tokens:
            return []

        scores = self.bm25.get_scores(query_tokens)

        ranked_indices = sorted(
            range(len(scores)),
            key=lambda i: scores[i],
            reverse=True
        )

        results = []

        for rank, index in enumerate(
            ranked_indices[:top_k],
            start=1
        ):

            results.append(
                RetrievedDocument(
                    id=self.ids[index],
                    document=self.documents[index],
                    metadata=self.metadatas[index],
                    bm25_score=float(scores[index]),
                    distance=None,
                    similarity_score=None,
                    rank=rank,
                    rerank_score=None,
                )
            )

            # Store BM25 score separately.
            # RetrievedDocument does not currently have a bm25_score field.

        return results