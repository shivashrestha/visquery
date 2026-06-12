"""Ask the Archive — RAG chat over ingested document (PDF/PPTx) text.

Separate from the per-image chat in routers/images.py; both share the
conversational tone constraints so the two modes feel like one product.
"""
from __future__ import annotations

import asyncio
import uuid
from typing import Optional

import numpy as np
import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.deps import get_db
from app.models.document import DocChunk, DocSource

logger = structlog.get_logger()

router = APIRouter(prefix="/archive", tags=["archive"])

TOP_K = 8
NOT_FOUND_REPLY = "Not found in the archive."


class ArchiveChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=1500)
    history: list[dict] = Field(default_factory=list)
    source_ids: Optional[list[str]] = None


class ArchiveCitation(BaseModel):
    source_id: str
    title: str
    page: int
    snippet: str


class ArchiveChatResponse(BaseModel):
    answer: str
    citations: list[ArchiveCitation]


def _owner(request: Request) -> Optional[str]:
    return request.headers.get("X-Studio-Owner") or None


@router.get("/status")
async def archive_status(
    request: Request,
    db: Session = Depends(get_db),
) -> dict:
    """Document inventory — frontend uses has_documents to gate the archive UI."""
    q = db.query(DocSource)
    owner = _owner(request)
    if owner:
        q = q.filter((DocSource.owner == owner) | (DocSource.owner.is_(None)))
    rows = q.order_by(DocSource.created_at.desc()).all()

    sources = [
        {
            "source_id": str(r.id),
            "title": r.title,
            "file_type": r.file_type,
            "page_count": r.page_count,
            "chunk_count": r.chunk_count,
            "index_status": r.index_status,
            "index_error": r.index_error,
        }
        for r in rows
    ]
    ready = [s for s in sources if s["index_status"] == "ready" and s["chunk_count"] > 0]
    return {
        "has_documents": len(ready) > 0,
        "document_count": len(sources),
        "sources": sources,
    }


@router.delete("/sources/{source_id}")
async def delete_document(
    source_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> dict:
    """Remove a document source — chunks cascade, file removed best-effort."""
    src = db.query(DocSource).filter(DocSource.id == source_id).first()
    if src is None:
        raise HTTPException(status_code=404, detail="Document not found")
    storage_path = str(src.storage_path)
    db.delete(src)
    db.commit()
    try:
        from pathlib import Path
        Path(storage_path).unlink(missing_ok=True)
    except Exception as exc:
        logger.warning("doc_file_delete_failed", source_id=str(source_id), error=str(exc))
    return {"deleted": str(source_id)}


def _retrieve_chunks(
    query_vec: np.ndarray,
    source_ids: Optional[list[str]],
    owner: Optional[str],
    db: Session,
) -> list[tuple[DocChunk, DocSource, float]]:
    """Cosine top-K over doc_chunks (embeddings are L2-normalised → dot product)."""
    q = (
        db.query(DocChunk, DocSource)
        .join(DocSource, DocChunk.source_id == DocSource.id)
        .filter(DocSource.index_status == "ready", DocChunk.embedding.isnot(None))
    )
    if source_ids:
        q = q.filter(DocChunk.source_id.in_([uuid.UUID(s) for s in source_ids]))
    if owner:
        q = q.filter((DocSource.owner == owner) | (DocSource.owner.is_(None)))
    rows = q.all()
    if not rows:
        return []

    mat = np.asarray([c.embedding for c, _ in rows], dtype=np.float32)
    scores = mat @ query_vec
    order = np.argsort(-scores)[:TOP_K]
    return [(rows[i][0], rows[i][1], float(scores[i])) for i in order]


@router.post("/chat", response_model=ArchiveChatResponse)
async def archive_chat(
    payload: ArchiveChatRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> ArchiveChatResponse:
    from app.services.llm import complete
    from app.services.text_embedder import TEXT_EXECUTOR, embed_text_query

    loop = asyncio.get_running_loop()
    query_vec = await loop.run_in_executor(TEXT_EXECUTOR, embed_text_query, payload.message)

    hits = _retrieve_chunks(query_vec, payload.source_ids, _owner(request), db)
    if not hits:
        return ArchiveChatResponse(answer=NOT_FOUND_REPLY, citations=[])

    excerpts = "\n\n".join(
        f"[{src.title}, p.{chunk.page_number}]\n{chunk.text}"
        for chunk, src, _ in hits
    )

    transcript = ""
    for turn in payload.history[-6:]:
        who = "User" if turn.get("who") == "user" or turn.get("role") == "user" else "Assistant"
        text = (turn.get("text") or turn.get("content") or "").strip()
        if text:
            transcript += f"{who}: {text}\n"

    system = (
        "You are a knowledgeable architectural assistant answering questions from a firm's "
        "document archive. You are given excerpts from those documents, each labelled "
        "[title, p.N].\n"
        "\n"
        "Rules:\n"
        "- Answer ONLY from the provided excerpts. Never use outside knowledge.\n"
        "- Cite every claim inline using the exact label of the excerpt it came from, "
        "e.g. [Annual Report 2024, p.3].\n"
        f"- If the excerpts do not cover the question, reply only: '{NOT_FOUND_REPLY}'\n"
        "\n"
        "Tone and format:\n"
        "- Plain conversational prose. 2-3 sentences. No lists, no headers, no bold.\n"
        "- Speak as an expert: state facts directly — never say 'based on the excerpts', "
        "'according to the documents', or reveal you are reading a source beyond the citations."
    )
    user = (
        f"Document excerpts:\n{excerpts}\n\n"
        + (f"Conversation so far:\n{transcript}\n" if transcript else "")
        + f"Question: {payload.message}"
    )

    answer = await loop.run_in_executor(
        None, lambda: complete(system=system, user=user, temperature=0.3, max_tokens=300),
    )

    answer_stripped = answer.strip()
    if NOT_FOUND_REPLY.rstrip(".").lower() in answer_stripped.lower() and len(answer_stripped) < 80:
        return ArchiveChatResponse(answer=NOT_FOUND_REPLY, citations=[])

    # Citations: retrieved chunks deduped by (source, page); restrict to ones the
    # answer actually cites, falling back to the top retrieved pages.
    citations: list[ArchiveCitation] = []
    seen: set[tuple[str, int]] = set()
    for chunk, src, _ in hits:
        key = (str(src.id), chunk.page_number)
        if key in seen:
            continue
        seen.add(key)
        citations.append(ArchiveCitation(
            source_id=str(src.id),
            title=src.title,
            page=chunk.page_number,
            snippet=chunk.text[:240] + ("…" if len(chunk.text) > 240 else ""),
        ))

    cited_only = [c for c in citations if f"[{c.title}, p.{c.page}]" in answer_stripped]
    return ArchiveChatResponse(
        answer=answer_stripped,
        citations=cited_only if cited_only else citations[:3],
    )
