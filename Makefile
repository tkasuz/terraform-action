.PHONY: build test clean install docker-build docker-run fmt lint run-local build-all

# Build the binary
build:
	go build -o terraform-action ./cmd/terraform-action

# Run tests
test:
	go test -v ./...

# Clean build artifacts
clean:
	rm -f terraform-action
	go clean

# Install dependencies
install:
	go mod download
	go mod tidy

# Build Docker image with standard docker
docker-build:
	docker build -t terraform-action:latest .

# Build binaries for all platforms
build-all:
	GOOS=linux GOARCH=amd64 go build -o dist/terraform-action-linux-amd64 -ldflags="-s -w" ./cmd/terraform-action
	GOOS=linux GOARCH=arm64 go build -o dist/terraform-action-linux-arm64 -ldflags="-s -w" ./cmd/terraform-action
	GOOS=darwin GOARCH=amd64 go build -o dist/terraform-action-darwin-amd64 -ldflags="-s -w" ./cmd/terraform-action
	GOOS=darwin GOARCH=arm64 go build -o dist/terraform-action-darwin-arm64 -ldflags="-s -w" ./cmd/terraform-action
	GOOS=windows GOARCH=amd64 go build -o dist/terraform-action-windows-amd64.exe -ldflags="-s -w" ./cmd/terraform-action

# Run Docker container
docker-run:
	docker run --rm \
		-e GITHUB_TOKEN=${GITHUB_TOKEN} \
		-e GITHUB_EVENT_PATH=/event.json \
		-v $(PWD)/examples:/workspace \
		terraform-action:latest

# Format code
fmt:
	go fmt ./...

# Lint code
lint:
	golangci-lint run

# Run locally for testing
run-local: build
	./terraform-action
