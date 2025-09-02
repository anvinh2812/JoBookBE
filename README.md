# JoBookBE Backend

This folder contains a copy of the backend from JoBook (`server/`), without modifying anything in the original JoBook project.

## Setup

1. Create a `.env` file based on `.env.example` and fill in values for:

   - PORT (optional, defaults to 5001)
   - DATABASE_URL
   - JWT_SECRET
   - NODE_ENV

2. Install dependencies:

```sh
npm install
```

3. Run development server with auto-reload:

```sh
npm run dev
```

4. Or run once:

```sh
npm start
```

The API will be available at `http://localhost:<PORT>` with routes under `/api/*`.
