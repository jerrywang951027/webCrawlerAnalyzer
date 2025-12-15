import { createClient } from 'redis';

let client: ReturnType<typeof createClient> | null = null;

function createRedisClient() {
  // Use REDIS_URL if available (Heroku), otherwise use host/port
  if (process.env.REDIS_URL) {
    console.log('Redis: Using REDIS_URL for connection');
    const redisUrl = process.env.REDIS_URL;
    const isTLS = redisUrl.startsWith('rediss://');
    
    // For rediss:// URLs, parse and use discrete parameters to avoid TLS configuration conflicts
    if (isTLS) {
      try {
        const url = new URL(redisUrl);
        const password = url.password || (url.username ? decodeURIComponent(url.username) : undefined);
        
        console.log('Redis: Parsing rediss:// URL to use discrete parameters');
        return createClient({
          socket: {
            host: url.hostname,
            port: parseInt(url.port) || 6380,
            tls: {
              rejectUnauthorized: false, // Handle self-signed certificate chain issues
            },
            reconnectStrategy: (retries: number) => {
              if (retries > 10) {
                console.error('Redis: Too many reconnection attempts');
                return new Error('Too many reconnection attempts');
              }
              return Math.min(retries * 100, 3000);
            },
          },
          password: password,
        });
      } catch (error) {
        console.error('Redis: Error parsing URL, falling back to URL string:', error);
        // Fallback to URL if parsing fails
        return createClient({
          url: redisUrl,
          socket: {
            reconnectStrategy: (retries: number) => {
              if (retries > 10) {
                console.error('Redis: Too many reconnection attempts');
                return new Error('Too many reconnection attempts');
              }
              return Math.min(retries * 100, 3000);
            },
          },
        });
      }
    } else {
      // For redis:// URLs, use URL directly
      return createClient({
        url: redisUrl,
        socket: {
          reconnectStrategy: (retries: number) => {
            if (retries > 10) {
              console.error('Redis: Too many reconnection attempts');
              return new Error('Too many reconnection attempts');
            }
            return Math.min(retries * 100, 3000);
          },
        },
      });
    }
  } else {
    console.log('Redis: Using host/port for connection');
    return createClient({
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        reconnectStrategy: (retries: number) => {
          if (retries > 10) {
            console.error('Redis: Too many reconnection attempts');
            return new Error('Too many reconnection attempts');
          }
          return Math.min(retries * 100, 3000);
        },
      },
    });
  }
}

export async function getRedisClient() {
  // Create new client if none exists
  if (!client) {
    client = createRedisClient();

    client.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    client.on('connect', () => {
      console.log('Redis Client: Connected');
    });

    client.on('reconnecting', () => {
      console.log('Redis Client: Reconnecting...');
    });

    client.on('ready', () => {
      console.log('Redis Client: Ready');
    });
  }

  // Ensure connection is open
  try {
    if (!client.isOpen) {
      console.log('Redis Client: Connecting...');
      await client.connect();
      console.log('Redis Client: Connected successfully');
    }
  } catch (error) {
    console.error('Failed to connect to Redis:', error);
    // Reset client to allow retry on next call
    client = null;
    throw error;
  }

  return client;
}

