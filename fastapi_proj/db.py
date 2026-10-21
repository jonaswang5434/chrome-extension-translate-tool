from datetime import datetime
import os
from collections.abc import AsyncGenerator
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import BigInteger, DateTime, Identity, String, Text, func
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class EnglishVocabulary(Base):
    __tablename__ = "english_vocabulary"

    id: Mapped[int] = mapped_column(
        BigInteger, Identity(always=True), primary_key=True
    )
    user_name: Mapped[str] = mapped_column(String(20), nullable=False)
    vocabulary: Mapped[str] = mapped_column(String(500), nullable=False)
    explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    create_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.current_timestamp(),
        nullable=False,
    )


_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None

load_dotenv(Path(__file__).with_name(".env"))


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    global _engine, _session_factory
    if _session_factory is not None:
        return _session_factory

    password = os.getenv("PGPASSWORD")
    if password is None:
        raise RuntimeError("Set the PGPASSWORD environment variable.")

    _engine = create_async_engine(
        "postgresql+psycopg://",
        connect_args={
            "host": os.getenv("PGHOST", "127.0.0.1"),
            "port": os.getenv("PGPORT", "5432"),
            "dbname": os.getenv("PGDATABASE", "postgres"),
            "user": os.getenv("PGUSER", "postgres"),
            "password": password,
        },
    )
    _session_factory = async_sessionmaker(_engine, expire_on_commit=False)
    return _session_factory


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    session_factory = get_session_factory()
    async with session_factory() as session:
        yield session
