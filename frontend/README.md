# Persona Vectors Frontend

A React frontend for the Persona Vectors API, built with React Router 7 and Vite.

## Setup

1. Install dependencies:
```bash
cd frontend
npm install
```

2. Make sure the API server is running:
```bash
# In the project root
python app.py
```

3. Start the development server:
```bash
npm run dev
```

The frontend will be available at `http://localhost:3000`

## Features

### Routes

- **`/`** - Dashboard with API health status and overview
- **`/traits`** - View all available personality traits
- **`/evaluate`** - Evaluate models with optional steering
- **`/generate-vector`** - Generate persona vectors from evaluations
- **`/projection`** - Calculate activation projections
- **`/results`** - Browse and download evaluation results
- **`/vectors`** - Browse generated persona vectors

### Key Capabilities

- ✅ Real-time API health monitoring
- ✅ Interactive forms for all API endpoints
- ✅ Enable/disable steering with configurable parameters
- ✅ File browsing and downloads
- ✅ Responsive design with clean UI
- ✅ Error handling and loading states

## Building for Production

```bash
npm run build
```

The build output will be in the `dist/` directory.

## API Proxy

The development server proxies API requests to `http://localhost:5000`. This is configured in `vite.config.js`.

## Technology Stack

- React 18
- React Router 7
- Vite
- Vanilla CSS
