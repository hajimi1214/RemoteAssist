FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/signaling ./cmd/signaling \
    && CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/signaling-migrate ./cmd/migrate

FROM alpine:3.22
RUN apk add --no-cache ca-certificates wget
COPY --from=build /out/signaling /signaling
COPY --from=build /out/signaling-migrate /signaling-migrate
EXPOSE 8080
USER 65532:65532
ENTRYPOINT ["/signaling"]
