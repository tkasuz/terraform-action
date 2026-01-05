.PHONY: build test clean install docker-build ko-build ko-publish docker-run fmt lint run-local

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

# Build Docker image with ko (requires ko to be installed)
ko-build:
	KO_DOCKER_REPO=ko.local ko build ./cmd/terraform-action --bare

# Build and push to GitHub Container Registry with ko (requires KO_DOCKER_REPO to be set)
ko-publish:
	@if [ -z "$(KO_DOCKER_REPO)" ]; then \
		echo "Error: KO_DOCKER_REPO is not set"; \
		echo "Example: make ko-publish KO_DOCKER_REPO=ghcr.io/username/terraform-action"; \
		exit 1; \
	fi
	ko build ./cmd/terraform-action --bare --platform=linux/amd64,linux/arm64

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
