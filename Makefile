BINARY  := pixel-agents-tui
MODULE  := pixel-agents-tui
GOFILES := $(wildcard *.go)

.PHONY: all build run demo test clean fmt vet lint check

all: build

build: $(BINARY)

$(BINARY): $(GOFILES) go.mod go.sum
	go build -o $(BINARY) .

run: build
	./$(BINARY)

demo: build
	./$(BINARY) --demo

test:
	go test -v ./...

clean:
	rm -f $(BINARY) pixel-agents

fmt:
	gofmt -w .

vet:
	go vet ./...

lint: vet
	@command -v staticcheck >/dev/null 2>&1 && staticcheck ./... || echo "staticcheck not installed, skipping"

check: fmt vet test
