.PHONY: up down logs backend-dev frontend-dev

up:
	cd docker && docker compose up --build

down:
	cd docker && docker compose down

logs:
	cd docker && docker compose logs -f

backend-dev:
	cd backend && . .venv/bin/activate && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

frontend-dev:
	cd frontend && npm run dev
