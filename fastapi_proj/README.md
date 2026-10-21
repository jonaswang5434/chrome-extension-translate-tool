# English Vocabulary API

A FastAPI service that asynchronously inserts vocabulary entries into
PostgreSQL using SQLAlchemy's async ORM with Psycopg 3 as the async driver.

The code is split into `schema.py` (request/response models), `db.py`
(SQLAlchemy model and async database session), `router.py` (API endpoint), and
`main.py` (FastAPI application setup).

## PostgreSQL setup

Create the table in the `postgres` database:

```sql
CREATE TABLE english_vocabulary (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_name VARCHAR(20) NOT NULL,
    vocabulary VARCHAR(500) NOT NULL,
    explanation TEXT,
    create_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
```

Configure the connection with environment variables. The host defaults to
`127.0.0.1`, port to `5432`, database to `postgres`, and username to
`postgres`. Create a `.env` file in the project root with:

```dotenv
PGPASSWORD=your_actual_postgres_password
```

The application loads this file automatically, and the VS Code launch
configuration loads it when debugging. Do not commit `.env`; it is excluded by
the repository's `.gitignore`.

Override the defaults with `PGHOST`, `PGPORT`, `PGDATABASE`, or `PGUSER` if
your PostgreSQL setup uses different values.

## Run

```sh
uv sync
uv run uvicorn main:app --reload
```

The interactive API documentation is available at http://127.0.0.1:8000/docs.

## Debug in VS Code

Set `PGPASSWORD` in the environment used to launch VS Code, open the project
folder, and select **Python: FastAPI** in the Run and Debug view. The launch
configuration uses the selected Python interpreter and runs Uvicorn without
auto-reload so breakpoints work reliably.

## Create a vocabulary entry

Send a `POST` request to `/vocabulary` with JSON:

```json
{
  "user_name": "alice",
  "vocabulary": "serendipity",
  "explanation": "Finding something good without looking for it."
}
```

The API responds with HTTP `201` and the inserted row, including its generated
`id` and `create_date`. `user_name` is limited to 20 characters, and
`vocabulary` to 500 characters.

## Query vocabulary entries

Use `GET /vocabulary` with at least one query parameter. `vocabulary` is an
exact match; `create_date` returns entries created at or after the supplied
ISO 8601 timestamp. Timestamps must include a timezone (for example, a
trailing `Z`). If multiple parameters are provided, all filters must match:

```text
GET /vocabulary?vocabulary=serendipity
GET /vocabulary?create_date=2026-10-13T16:00:00Z
GET /vocabulary?vocabulary=serendipity&create_date=2026-10-13T16:00:00Z
```

The endpoint returns matching entries, newest first. Omitting all query
parameters returns HTTP `422`. In the side panel, choosing a start date lists
all vocabulary entries from local midnight on that date onward; the browser
converts local midnight to a timezone-aware UTC timestamp for the request.

## Extension lookup and save flow

The Chrome extension calls `GET /vocabulary?vocabulary=<selected text>` before
requesting a DeepSeek response. If the API returns an entry, its saved
`explanation` is displayed without making an AI request. If the result list is
empty, the extension requests a DeepSeek response and saves it with
`POST /vocabulary` using `user_name: "jonas_wang"`.

Run the API on `http://127.0.0.1:8000` while using the extension. The extension
manifest grants host access to this API and to `https://api.deepseek.com`.