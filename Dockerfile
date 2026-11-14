# One container: the FastAPI backend serves the API and the built frontend.
FROM node:22-slim AS web
WORKDIR /app
COPY frontend/package*.json frontend/
RUN cd frontend && npm ci
COPY frontend frontend
COPY data/snapshot data/snapshot
RUN cd frontend && npm run build

FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY backend/requirements.txt backend/
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend backend
COPY data/inputs data/inputs
COPY data/snapshot data/snapshot
COPY data/llm_cache.jsonl data/llm_cache.jsonl
COPY --from=web /app/frontend/dist frontend/dist
WORKDIR /app/backend
EXPOSE 8000
CMD ["sh", "-c", "uvicorn finn.api:app --host 0.0.0.0 --port ${PORT:-8000}"]
