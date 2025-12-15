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
        // Heroku Redis URLs format: rediss://:password@host:port
        // Password is in url.password, or if empty, might be in url.username
        let password = url.password;
        if (!password && url.username) {
          // Sometimes password is encoded in username field
          password = decodeURIComponent(url.username);
        }
        // Remove leading colon if present (rediss://:password@host)
        if (password && password.startsWith(':')) {
          password = password.substring(1);
        }
        
        const host = url.hostname;
        const port = parseInt(url.port) || 6380;
        
        console.log(`Redis: Parsing rediss:// URL - host: ${host}, port: ${port}, password: ${password ? '***' : 'none'}`);
        
        // For node-redis v5, socket.tls should be boolean TRUE for TLS connections
        // To handle self-signed certificates, we set NODE_TLS_REJECT_UNAUTHORIZED in the environment
        // or accept that Heroku Redis uses valid certificates
        const socketOptions: any = {
          host: host,
          port: port,
          tls: true, // Boolean true enables TLS
          reconnectStrategy: (retries: number) => {
            if (retries > 10) {
              console.error('Redis: Too many reconnection attempts');
              return new Error('Too many reconnection attempts');
            }
            return Math.min(retries * 100, 3000);
          },
        };
        
        // Set rejectUnauthorized at process level for TLS connections
        // This is necessary for Heroku Redis self-signed certificates
        if (process.env.NODE_ENV === 'production') {
          process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
          console.log('Redis: Disabled TLS certificate validation for production');
        }
        
        return createClient({
          socket: socketOptions,
          password: password || undefined,
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

