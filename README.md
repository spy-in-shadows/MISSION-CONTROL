# Mission Control

A React + Vite dashboard for live ISS tracking, latest news, data visualizations, and a dashboard-only AI chatbot.

## Features

- Live ISS location refresh every 15 seconds
- Leaflet map with custom ISS marker and last 15-position trajectory
- Haversine speed calculation and 30-reading speed chart
- Current people in space with reliable fallback data source
- Latest news dashboard with categories, search, sorting, refresh, loading states, errors, and 15-minute localStorage cache
- News distribution doughnut chart with click-to-filter behavior
- Floating chatbot using `mistralai/Mistral-7B-Instruct-v0.2` through Hugging Face
- Chatbot answers only from loaded dashboard data
- Dark/light mode persisted in localStorage
- Responsive layout and toast notifications

## Tech Stack

- React
- Vite
- Leaflet
- Chart.js / react-chartjs-2
- Hugging Face Inference API
- NewsAPI with public API fallbacks

## Environment Variables

Create a `.env` file:

```env
VITE_NEWS_API_KEY=your_newsapi_key_here
VITE_AI_TOKEN=your_huggingface_token_here
```

Never commit `.env`. It is ignored by `.gitignore`.

## Run Locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run lint
npm run build
```

## LLM Used

This application uses `mistralai/Mistral-7B-Instruct-v0.2` through Hugging Face because it is an instruction-tuned model suitable for chatbot responses and can be constrained to answer only from the dashboard's ISS and news data.
