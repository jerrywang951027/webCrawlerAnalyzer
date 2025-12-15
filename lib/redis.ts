import { createClient } from 'redis';

let client: ReturnType<typeof createClient> | null = null;

export async function getRedisClient() {
  if (!client) {
    client = createClient({
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
    });

    client.on('error', (err) => {
      console.error('Redis Client Error', err);
    });

    try {
      if (!client.isOpen) {
        await client.connect();
      }
    } catch (error) {
      console.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  return client;
}

