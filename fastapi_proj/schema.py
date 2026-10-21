from datetime import datetime

from pydantic import BaseModel, Field


class VocabularyCreate(BaseModel):
    user_name: str = Field(min_length=1, max_length=20)
    vocabulary: str = Field(min_length=1, max_length=500)
    explanation: str | None = None


class VocabularyResponse(VocabularyCreate):
    id: int
    create_date: datetime
