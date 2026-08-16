# Student-Mentor Portal

A full-stack mentorship platform connecting students with faculty for project-based learning.

## Project Structure

```
packages/
├── frontend/     # React + TypeScript frontend
├── backend/      # Express + TypeScript backend
└── shared/       # Shared types and utilities
```

## Getting Started

### Prerequisites
- Node.js 18+
- npm 9+

### Installation

```bash
npm install
```

This installs dependencies for all packages (monorepo setup).

### Development

Run both frontend and backend:
```bash
npm run dev
```

Or run individually:
```bash
npm run dev -w frontend   # Frontend only
npm run dev -w backend    # Backend only
```

### Build

```bash
npm run build -w frontend
npm run build -w backend
```

## Tech Stack

- **Frontend**: React 18, Vite, TypeScript, React Router, Axios
- **Backend**: Express, TypeScript, JWT, bcryptjs, CORS
- **Shared**: Shared types and validation logic
