from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import EnglishVocabulary, get_db_session
from schema import VocabularyCreate, VocabularyResponse

router = APIRouter()


@router.post("/vocabulary", response_model=VocabularyResponse, status_code=201)
async def create_vocabulary(
    entry: VocabularyCreate,
    session: AsyncSession = Depends(get_db_session),
) -> VocabularyResponse:
    vocabulary = EnglishVocabulary(
        user_name=entry.user_name,
        vocabulary=entry.vocabulary,
        explanation=entry.explanation,
    )
    session.add(vocabulary)
    await session.commit()
    await session.refresh(vocabulary)

    return VocabularyResponse(
        id=vocabulary.id,
        user_name=vocabulary.user_name,
        vocabulary=vocabulary.vocabulary,
        explanation=vocabulary.explanation,
        create_date=vocabulary.create_date,
    )


@router.get("/vocabulary", response_model=list[VocabularyResponse])
async def query_vocabulary(
    vocabulary: Annotated[str | None, Query(min_length=1, max_length=500)] = None,
    create_date: datetime | None = None,
    session: AsyncSession = Depends(get_db_session),
) -> list[VocabularyResponse]:
    if vocabulary is None and create_date is None:
        raise HTTPException(
            status_code=422,
            detail="Provide at least one of 'vocabulary' or 'create_date'.",
        )
    if create_date is not None and (
        create_date.tzinfo is None or create_date.utcoffset() is None
    ):
        raise HTTPException(
            status_code=422,
            detail="'create_date' must include a timezone, such as a trailing 'Z'.",
        )

    statement = select(EnglishVocabulary)
    if vocabulary is not None:
        statement = statement.where(EnglishVocabulary.vocabulary == vocabulary)
    if create_date is not None:
        statement = statement.where(EnglishVocabulary.create_date >= create_date)
    statement = statement.order_by(EnglishVocabulary.create_date.desc())

    result = await session.scalars(statement)
    return [
        VocabularyResponse(
            id=entry.id,
            user_name=entry.user_name,
            vocabulary=entry.vocabulary,
            explanation=entry.explanation,
            create_date=entry.create_date,
        )
        for entry in result.all()
    ]
