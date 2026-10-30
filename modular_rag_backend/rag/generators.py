import os
from abc import ABC, abstractmethod
from pydantic import SecretStr
from langchain_groq import ChatGroq


class BaseGenerator(ABC):
    @abstractmethod
    def generate(self, query, documents):
        raise NotImplementedError


class GroqGenerator(BaseGenerator):
    def __init__(self, model_name: str):
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            raise RuntimeError("GROQ_API_KEY is not set.")

        self.llm = ChatGroq(
            model=model_name,
            temperature=0.1,
            max_tokens=1024,
            api_key=SecretStr(api_key),
        )

    def generate(self, query, documents):
        context_parts = []

        for i, doc in enumerate(documents, start=1):
            meta = doc.metadata or {}
            source = meta.get("source", "Unknown source")
            page = meta.get("page", meta.get("page_number", "N/A"))

            context_parts.append(
                f"[SOURCE {i}]\n"
                f"Document: {source}\n"
                f"Page: {page}\n"
                f"Content:\n{doc.document}"
            )

        context = "\n\n".join(context_parts)

        prompt = f"""
You are the answer-generation module of a document-grounded RAG system.

Rules:
1. Answer ONLY from the retrieved context.
2. Do not use outside knowledge.
3. If the context does not contain the answer, say:
   "The information is not available in the provided documents."
4. Do not invent document names, pages, dates, or citations.
5. Keep the answer clear and concise.
6. When useful, mention the source document and page number.

Retrieved context:
{context}

User question:
{query}

Answer:
"""
        print("\n================ CONTEXT SENT TO LLM ================\n")
        print(context)
        print("\n======================================================\n")
        response = self.llm.invoke(prompt)
        return response.content


class GeneratorRegistry:
    def __init__(self, model_name):
        self.generators = {
            "groq": GroqGenerator(model_name),
        }

    def get(self, name):
        if name not in self.generators:
            raise ValueError(
                f"Unknown generator '{name}'. Available: {list(self.generators)}"
            )
        return self.generators[name]
