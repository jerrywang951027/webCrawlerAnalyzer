# How to View Heroku Logs

## Method 1: Using Heroku CLI (Recommended)

### Install Heroku CLI
```bash
# macOS
brew tap heroku/brew && brew install heroku

# Or download from: https://devcenter.heroku.com/articles/heroku-cli
```

### Login to Heroku
```bash
heroku login
```

### View Logs

**Real-time logs (tail):**
```bash
heroku logs --tail -a webcrawleranalyzer
```

**Last 100 lines:**
```bash
heroku logs -n 100 -a webcrawleranalyzer
```

**Last 1000 lines:**
```bash
heroku logs -n 1000 -a webcrawleranalyzer
```

**Filter for Redis-related logs:**
```bash
heroku logs --tail -a webcrawleranalyzer | grep -i redis
```

**Filter for save operation logs:**
```bash
heroku logs --tail -a webcrawleranalyzer | grep -i "\[SAVE\]"
```

## Method 2: Using Heroku Dashboard

1. Go to: https://dashboard.heroku.com/apps/webcrawleranalyzer
2. Click on the **"More"** button (three dots) in the top right
3. Select **"View logs"**
4. This opens a log viewer in your browser

## Method 3: Using Heroku CLI (One-liner)

**View recent errors:**
```bash
heroku logs --tail -a webcrawleranalyzer | grep -i error
```

**View all Redis connection logs:**
```bash
heroku logs -a webcrawleranalyzer | grep -i "redis"
```

**View save operation logs:**
```bash
heroku logs -a webcrawleranalyzer | grep -i "\[SAVE\]"
```

## Common Log Patterns to Look For

### Redis Connection Issues:
- `Redis Client Error:`
- `Failed to connect to Redis:`
- `Redis: Using REDIS_URL for connection`
- `Redis Client: Connected`

### Save Operation Issues:
- `[SAVE] Attempting to save key:`
- `[SAVE] Data size:`
- `[SAVE] ERROR:`
- `[SAVE] Successfully saved key:`

### Size Limit Issues:
- `Data size exceeds Redis limit`
- `413 Payload Too Large`

## Debugging Steps

1. **Check if Redis addon is installed:**
   ```bash
   heroku addons -a webcrawleranalyzer
   ```

2. **Check Redis URL configuration:**
   ```bash
   heroku config:get REDIS_URL -a webcrawleranalyzer
   ```

3. **View all environment variables:**
   ```bash
   heroku config -a webcrawleranalyzer
   ```

4. **Test Redis connection:**
   ```bash
   heroku run node -e "const redis = require('redis'); const client = redis.createClient({url: process.env.REDIS_URL}); client.connect().then(() => console.log('Connected!')).catch(e => console.error('Error:', e));" -a webcrawleranalyzer
   ```

## Viewing Logs in Real-Time While Testing

1. Open a terminal and run:
   ```bash
   heroku logs --tail -a webcrawleranalyzer
   ```

2. Keep this terminal open while you test the save functionality

3. The logs will show in real-time as you interact with the application

