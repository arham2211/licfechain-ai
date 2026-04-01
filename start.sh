#!/bin/sh

# Start Next.js frontend in background
cd /app/frontend && npm start &

# Start FastAPI backend
cd /app && uvicorn app.main:app --host 0.0.0.0 --port 8000
