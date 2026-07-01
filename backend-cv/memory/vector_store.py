"""
memory/vector_store.py — Local FAISS Vector Store (Tier 3 External Memory)
Provides semantic similarity search over past session summaries.

In production: replace with Pinecone / Milvus / Weaviate.
Here: FAISS flat index with sentence-transformers embeddings.

Gracefully degrades if FAISS or sentence-transformers are not installed.
"""
import json
import logging
import os
from pathlib import Path
from typing import Optional

log = logging.getLogger("aegis.memory.vector_store")

INDEX_PATH = Path(__file__).parent / "faiss_index.bin"
META_PATH  = Path(__file__).parent / "faiss_meta.json"


class VectorStore:
    """
    Thin wrapper around FAISS for semantic episode retrieval.
    
    Lifecycle:
      - add(text, metadata)  → encode + insert into flat index
      - search(query, top_k) → encode query + return top-k similar texts
      - persist()            → save index to disk
      - load()               → restore index from disk
    """

    def __init__(self):
        self._index    = None
        self._metadata: list[dict] = []
        self._model    = None
        self._dim      = 384   # all-MiniLM-L6-v2 embedding dimension
        self._ready    = False
        self._try_init()

    def _try_init(self):
        """Attempt to load FAISS + sentence-transformers. Fail gracefully."""
        try:
            import faiss
            from sentence_transformers import SentenceTransformer
            self._model = SentenceTransformer("all-MiniLM-L6-v2")
            self._faiss = faiss

            if INDEX_PATH.exists() and META_PATH.exists():
                self._index    = faiss.read_index(str(INDEX_PATH))
                with open(META_PATH) as f:
                    self._metadata = json.load(f)
                log.info("[VectorStore] Loaded existing FAISS index (%d entries)", self._index.ntotal)
            else:
                self._index = faiss.IndexFlatIP(self._dim)   # Inner product (cosine on normalized)
                log.info("[VectorStore] Created new FAISS flat index (dim=%d)", self._dim)

            self._ready = True
        except ImportError as e:
            log.warning("[VectorStore] FAISS/SentenceTransformers not installed — vector search disabled. (%s)", e)
        except Exception as e:
            log.error("[VectorStore] Init failed: %s", e)

    def add(self, text: str, metadata: Optional[dict] = None):
        """Encode text and add to index."""
        if not self._ready:
            return
        try:
            import numpy as np
            vec = self._model.encode([text], normalize_embeddings=True)
            self._index.add(vec.astype(np.float32))
            self._metadata.append({"text": text, **(metadata or {})})
            self._persist()
            log.debug("[VectorStore] Added entry (total=%d)", self._index.ntotal)
        except Exception as e:
            log.error("[VectorStore] add() failed: %s", e)

    def search(self, query: str, top_k: int = 3) -> list[str]:
        """Return top-k semantically similar texts."""
        if not self._ready or self._index.ntotal == 0:
            return []
        try:
            import numpy as np
            vec = self._model.encode([query], normalize_embeddings=True)
            k   = min(top_k, self._index.ntotal)
            scores, indices = self._index.search(vec.astype(np.float32), k)
            results = []
            for i, idx in enumerate(indices[0]):
                if idx >= 0 and scores[0][i] > 0.3:   # Relevance threshold
                    results.append(self._metadata[idx]["text"])
            return results
        except Exception as e:
            log.error("[VectorStore] search() failed: %s", e)
            return []

    def _persist(self):
        """Save index and metadata to disk."""
        try:
            self._faiss.write_index(self._index, str(INDEX_PATH))
            with open(META_PATH, "w") as f:
                json.dump(self._metadata, f, indent=2)
        except Exception as e:
            log.warning("[VectorStore] Persist failed: %s", e)

    @property
    def size(self) -> int:
        return self._index.ntotal if self._ready and self._index else 0
