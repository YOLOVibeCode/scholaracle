# ⚠️ PORT POLICY: All ports are FIXED (2800-2804). DO NOT change these ports.
# Ports: 2800 (Web), 2801 (API), 2802 (MongoDB), 2803 (MailHog SMTP), 2804 (MailHog UI)

.PHONY: help up down restart logs clean test test-e2e seed health

# Default target
help:
	@echo "Scholaracle Docker Commands"
	@echo "=========================="
	@echo ""
	@echo "Development:"
	@echo "  make up          - Start all services"
	@echo "  make down        - Stop all services"
	@echo "  make restart     - Restart all services"
	@echo "  make logs        - Show logs from all services"
	@echo "  make logs-api    - Show API server logs"
	@echo "  make logs-web    - Show web app logs"
	@echo "  make logs-mongo  - Show MongoDB logs"
	@echo "  make logs-mail   - Show MailHog logs"
	@echo ""
	@echo "Testing:"
	@echo "  make test-up     - Start test services (MongoDB + MailHog + API)"
	@echo "  make test-down   - Stop test services"
	@echo "  make test-e2e   - Run E2E tests"
	@echo "  make seed        - Seed the database"
	@echo ""
	@echo "Utilities:"
	@echo "  make health      - Check health of all services"
	@echo "  make clean       - Remove all containers and volumes"
	@echo "  make build       - Build all images"
	@echo ""

# Development commands
up:
	DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 docker-compose up -d
	@echo "✅ Services started!"
	@echo "🌐 Web: http://localhost:2800"
	@echo "🚀 API: http://localhost:2801"
	@echo "📊 MongoDB: mongodb://localhost:2802"
	@echo "📧 MailHog SMTP: localhost:2803"
	@echo "📧 MailHog UI: http://localhost:2804"

down:
	docker-compose down
	@echo "✅ Services stopped"

restart:
	docker-compose restart
	@echo "✅ Services restarted"

logs:
	docker-compose logs -f

logs-api:
	docker-compose logs -f api

logs-web:
	docker-compose logs -f web

logs-mongo:
	docker-compose logs -f mongodb

logs-mail:
	docker-compose logs -f mailhog

# Testing commands
test-up:
	DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 docker-compose -f docker-compose.test.yml up -d
	@echo "✅ Test services started!"
	@echo "🚀 API: http://localhost:2801"
	@echo "📊 MongoDB: mongodb://localhost:2802"
	@echo "📧 MailHog SMTP: localhost:2803"
	@echo "📧 MailHog UI: http://localhost:2804"
	@sleep 5
	@make health

test-down:
	docker-compose -f docker-compose.test.yml down
	@echo "✅ Test services stopped"

test-e2e:
	@echo "🧪 Running E2E tests..."
	@make test-up
	@sleep 10
	@echo "🌱 Seeding database..."
	@curl -X POST 'http://localhost:2801/api/seed?force=true' || true
	@cd packages/e2e && API_BASE_URL=http://localhost:2801 BASE_URL=http://localhost:2800 pnpm exec playwright test
	@make test-down

seed:
	@echo "🌱 Seeding database..."
	@curl -X POST 'http://localhost:2801/api/seed?force=true' | python3 -m json.tool || echo "⚠️ Seed failed - check API logs"

# Utility commands
health:
	@echo "🏥 Health Check"
	@echo "==============="
	@echo -n "Web: "
	@curl -s http://localhost:2800 > /dev/null && echo "✅" || echo "❌"
	@echo -n "API: "
	@curl -s http://localhost:2801/api/health > /dev/null && echo "✅" || echo "❌"
	@echo -n "MongoDB: "
	@docker-compose exec -T mongodb mongosh --quiet --eval "db.adminCommand('ping').ok" 2>/dev/null && echo "✅" || echo "❌"
	@echo -n "MailHog: "
	@curl -s http://localhost:2804 > /dev/null && echo "✅" || echo "❌"

build:
	DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 docker-compose build
	@echo "✅ Compose images built"

build-workers:
	@./scripts/build-workers.sh
	@echo "✅ Workers image built"

clean:
	@echo "🧹 Cleaning up..."
	docker-compose down -v
	docker-compose -f docker-compose.test.yml down -v
	@echo "✅ Cleanup complete"

# Quick start for E2E tests
test-all:
	@make test-up
	@sleep 10
	@make seed
	@cd packages/e2e && API_BASE_URL=http://localhost:2801 BASE_URL=http://localhost:2800 pnpm exec playwright test
	@make test-down
