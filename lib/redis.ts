import { createClient } from 'redis';

let client: ReturnType<typeof createClient> | null = null;

function createRedisClient() {
  // Use REDIS_URL if available (Heroku), otherwise use host/port
  if (process.env.REDIS_URL) {
    console.log('Redis: Using REDIS_URL for connection');
    return createClient({
      url: process.env.REDIS_URL,
      socket: {
        tls: process.env.REDIS_URL?.startsWith('rediss://') || false,
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            console.error('Redis: Too many reconnection attempts');
            return new Error('Too many reconnection attempts');
          }
          return Math.min(retries * 100, 3000);
        },
      },
    });
  } else {
    console.log('Redis: Using host/port for connection');
    return createClient({
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        reconnectStrategy: (retries) => {
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

