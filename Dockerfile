# ---- Stage 1: Frontend Build ----
FROM node:24-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm install
COPY frontend/ .
RUN npm run build

# ---- Stage 2: Final Image ----
FROM python:3.11.9-slim
WORKDIR /app
ENV PIP_REQUIRE_HASHES=0

# Install Node.js 24 for Next.js runtime
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_24.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --upgrade pip setuptools wheel && \
    pip install --no-cache-dir --default-timeout=1000 --retries 10 \
    --index-url https://pypi.org/simple -r requirements.txt

# Copy backend code
COPY app/ ./app/
COPY migrations/ ./migrations/
COPY alembic.ini .
COPY models/ ./models/
COPY model_training/ ./model_training/

# Copy frontend build + runtime files
COPY --from=frontend-build /app/frontend/.next ./frontend/.next
COPY --from=frontend-build /app/frontend/node_modules ./frontend/node_modules
COPY --from=frontend-build /app/frontend/package.json ./frontend/package.json
COPY --from=frontend-build /app/frontend/next.config.ts ./frontend/next.config.ts
COPY --from=frontend-build /app/frontend/tsconfig.json ./frontend/tsconfig.json
COPY --from=frontend-build /app/frontend/postcss.config.mjs ./frontend/postcss.config.mjs
COPY frontend/public ./frontend/public

# Copy start script
COPY start.sh .
RUN chmod +x start.sh

EXPOSE 8000 3000

CMD ["./start.sh"]
