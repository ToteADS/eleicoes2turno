# syntax=docker/dockerfile:1

# ---- web ----
FROM node:26-alpine AS web
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

# ---- api ----
FROM golang:1.25-alpine AS api
WORKDIR /src/api
COPY api/go.mod api/go.sum ./
RUN go mod download
COPY api/ ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o /out/api ./cmd/api

# ---- runtime ----
# alpine (not distroless) so Coolify's health check can use wget inside the container
FROM alpine:3.22
RUN apk add --no-cache ca-certificates tzdata && adduser -D -H -u 10001 app
WORKDIR /app
COPY --from=api /out/api /app/api
COPY --from=web /src/web/dist /app/web
ENV PORT=8080 STATIC_DIR=/app/web TZ=America/Sao_Paulo
USER app
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
ENTRYPOINT ["/app/api"]
