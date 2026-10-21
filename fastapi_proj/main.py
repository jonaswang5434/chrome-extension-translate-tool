from fastapi import FastAPI

from router import router

app = FastAPI(title="English Vocabulary API")
app.include_router(router)
