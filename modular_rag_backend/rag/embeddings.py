from sentence_transformers import SentenceTransformer


class EmbeddingProvider:
    """Swappable embedding module."""

    def __init__(self, model_name: str):
        self.model_name = model_name
        print(f"[Embedding] Loading: {model_name}")
        self.model = SentenceTransformer(model_name)

    def embed_query(self, query: str):
        return self.model.encode(
            [query],
            show_progress_bar=False,
            normalize_embeddings=True,
        )[0]

    def embed_documents(self, texts):
        return self.model.encode(
            texts,
            show_progress_bar=False,
            normalize_embeddings=True,
        )
