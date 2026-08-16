# Docker Setup Guide

## Prerequisites

- Docker Desktop installed
- Docker Compose installed

## Quick Start

### 1. Create Environment Files

```bash
cp .env.example .env
cp packages/backend/.env.example packages/backend/.env
cp packages/frontend/.env.example packages/frontend/.env
```

Update `.env` with your configuration (database credentials, JWT secret, etc.)

### 2. Start Development Environment

```bash
docker-compose up --build
```

This starts:

- **PostgreSQL Database** on `localhost:5432`
- **Backend API** on `localhost:8080`
- **Frontend App** on `localhost:5173`

### 3. Stop Services

```bash
docker-compose down
```

## Development Workflow

### Access Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f db
docker-compose logs -f frontend
```

### Database Access

```bash
# Connect to PostgreSQL
docker exec -it student_mentor_db psql -U postgres -d student_mentor

# View database
\dt  # list tables
\d+ table_name  # describe table
```

### Rebuild After Code Changes

```bash
# Rebuild and restart
docker-compose up --build

# Rebuild specific service
docker-compose up --build backend
```

## Production Build

### Build Images

```bash
# Backend
docker build -f packages/backend/Dockerfile -t student-mentor-backend:latest .

# Frontend
docker build -f packages/frontend/Dockerfile -t student-mentor-frontend:latest .
```

### Run Production

```bash
docker run -p 8080:8080 \
  -e DB_HOST=your_db_host \
  -e DB_USER=postgres \
  -e DB_PASSWORD=your_password \
  -e JWT_SECRET=your_jwt_secret \
  student-mentor-backend:latest
```

## Troubleshooting

### Port Already in Use

```bash
# Change port in docker-compose.yml
# Or kill process using port
docker-compose down && docker system prune
```

### Database Connection Failed

```bash
# Check database health
docker-compose logs db

# Wait for database to be ready
docker-compose up db
# Wait for "database system is ready to accept connections"
```

### Rebuild From Scratch

```bash
docker-compose down -v  # removes volumes too
docker-compose up --build
```

## Environment Variables

See `.env.example` for all available configuration options.

Key variables:

- `NODE_ENV` - development/production
- `DB_HOST` - database host
- `JWT_SECRET` - JWT signing secret (change in production!)
- `ALLOWED_ORIGINS` - CORS allowed origins
