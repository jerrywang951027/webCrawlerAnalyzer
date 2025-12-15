# Recursive Sitemap Analyzer & Source Tracker

A full-stack web application that recursively crawls website sitemaps, extracts all associated URLs, and tracks the exact sitemap path (source) for each discovered URL. The application also supports HTML link crawling to discover additional internal links beyond what's in the sitemap.

## Features

- **Recursive Sitemap Crawling**: Automatically follows nested sitemap indexes and extracts all URLs
- **Source Path Tracking**: Tracks the hierarchical path from root to nested sitemaps (e.g., `rootSiteMap.xml=>childSiteMap.xml`)
- **HTML Link Crawling**: Optionally crawl HTML pages to discover internal links recursively
- **Redis Persistence**: Save and load crawl results with Redis
- **Pagination**: View results with configurable page sizes (50, 100, 200, 500, 1000)
- **Dark Mode**: Toggle between light and dark themes
- **History Management**: Load individual or all saved results with summary statistics

## Tech Stack

- **Frontend**: Next.js 16 with TypeScript and React
- **Backend**: Next.js API Routes
- **Styling**: Tailwind CSS
- **Storage**: Redis
- **Dependencies**:
  - `axios` - HTTP requests
  - `fast-xml-parser` - XML parsing
  - `cheerio` - HTML parsing and link extraction
  - `redis` - Redis client

## Prerequisites

- Node.js (v18 or higher)
- Redis server running locally (default: localhost:6379)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/jerrywang951027/webCrawlerAnalyzer.git
cd webCrawlerAnalyzer
```

2. Install dependencies:
```bash
npm install
```

3. Start Redis server (if not already running):
```bash
# macOS
brew services start redis

# Linux
sudo systemctl start redis

# Or use Docker
docker run -d -p 6379:6379 redis
```

4. Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:3201`

## Usage

### Analyze Sitemap Tab

1. Enter a sitemap URL (e.g., `https://example.com/sitemap-index.xml`)
2. Optionally enable "Crawl HTML links recursively" to discover additional internal links
3. Click "Start Analysis"
4. View results in the paginated table
5. Click "Save to Redis" to persist results

### Load Saved Result Tab

1. Select a saved result from the dropdown (or select "All" to load all saved results)
2. Click "Load Selected"
3. View the loaded results
4. When loading "All", a summary table shows:
   - Saved name
   - Sitemap URL
   - Total URLs retrieved
   - Total sub-sitemaps included

## Project Structure

```
webCrawlerAnalyzer/
├── app/
│   ├── api/
│   │   ├── crawl/route.ts      # Main crawling endpoint
│   │   ├── save/route.ts       # Save results to Redis
│   │   ├── load/route.ts       # Load results from Redis
│   │   └── keys/route.ts       # Get all Redis keys
│   ├── globals.css             # Global styles
│   ├── layout.tsx              # Root layout
│   └── page.tsx                # Main page component
├── lib/
│   └── redis.ts                # Redis client configuration
├── Prompt/                     # Project requirements and specifications
└── package.json
```

## API Endpoints

### POST `/api/crawl`
Crawl a sitemap and optionally HTML links.

**Request Body:**
```json
{
  "sitemapUrl": "https://example.com/sitemap.xml",
  "delay": 500,
  "crawlHtmlLinks": false
}
```

**Response:**
```json
{
  "urls": [
    {
      "url": "https://example.com/page1",
      "source": "sitemap.xml"
    }
  ],
  "status": ["Fetching: sitemap.xml", ...],
  "errors": [],
  "sitemapUrl": "https://example.com/sitemap.xml"
}
```

### POST `/api/save`
Save crawl results to Redis.

**Request Body:**
```json
{
  "sitemapUrl": "https://example.com/sitemap.xml",
  "results": { ... }
}
```

### POST `/api/load`
Load saved results from Redis.

**Request Body:**
```json
{
  "key": "sitemap.xml"
}
```

### GET `/api/keys`
Get all saved result keys from Redis.

## Configuration

### Redis Connection

By default, the application connects to Redis at `localhost:6379`. You can configure this using environment variables:

```bash
REDIS_HOST=localhost
REDIS_PORT=6379
```

### Port Configuration

The application runs on port 3201 by default. This can be changed in `package.json`:

```json
{
  "scripts": {
    "dev": "next dev -p 3201"
  }
}
```

## Source Path Format

The source field tracks the hierarchical path from the entry sitemap:

- **Direct URL**: `sitemap.xml`
- **Nested URL**: `sitemap.xml=>child.xml=>grandchild.xml`
- **HTML Crawled**: `HTML_CRAWL:sitemap` or `HTML_CRAWL:depth_X`

## License

MIT License

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

