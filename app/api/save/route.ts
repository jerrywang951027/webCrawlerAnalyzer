import { NextRequest, NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';

interface UrlEntry {
  url: string;
  source: string;
}

interface CrawlResult {
  urls: UrlEntry[];
  status: string[];
  errors: string[];
  sitemapUrl?: string;
}

// Helper function to extract filename from URL
function getFilename(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const parts = pathname.split('/');
    return parts[parts.length - 1] || 'sitemap.xml';
  } catch {
    return 'sitemap.xml';
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sitemapUrl, results } = body;

    if (!sitemapUrl || !results) {
      return NextResponse.json(
        { error: 'Missing required fields: sitemapUrl and results' },
        { status: 400 }
      );
    }

    const key = getFilename(sitemapUrl);
    
    console.log(`[SAVE] Attempting to save key: ${key}`);
    console.log(`[SAVE] Redis URL configured: ${process.env.REDIS_URL ? 'Yes' : 'No'}`);
    
    const client = await getRedisClient();
    console.log(`[SAVE] Redis client connected: ${client.isOpen ? 'Yes' : 'No'}`);

    // Check Redis memory info before saving
    try {
      const info = await client.info('memory');
      const maxMemoryMatch = info.match(/maxmemory:(\d+)/);
      const usedMemoryMatch = info.match(/used_memory:(\d+)/);
      const maxMemory = maxMemoryMatch ? parseInt(maxMemoryMatch[1]) : 0;
      const usedMemory = usedMemoryMatch ? parseInt(usedMemoryMatch[1]) : 0;
      const maxMemoryMB = maxMemory / (1024 * 1024);
      const usedMemoryMB = usedMemory / (1024 * 1024);
      const availableMemoryMB = maxMemoryMB - usedMemoryMB;
      
      console.log(`[SAVE] Redis memory - Max: ${maxMemoryMB.toFixed(2)} MB, Used: ${usedMemoryMB.toFixed(2)} MB, Available: ${availableMemoryMB.toFixed(2)} MB`);
      
      // Get all keys and their sizes
      const allKeys = await client.keys('*');
      console.log(`[SAVE] Existing keys in Redis: ${allKeys.length}`);
      if (allKeys.length > 0) {
        let totalKeysSize = 0;
        for (const existingKey of allKeys) {
          const size = await client.memoryUsage(existingKey).catch(() => 0);
          totalKeysSize += size || 0;
        }
        const totalKeysSizeMB = totalKeysSize / (1024 * 1024);
        console.log(`[SAVE] Total size of existing keys: ${totalKeysSizeMB.toFixed(2)} MB`);
      }
    } catch (error) {
      console.warn(`[SAVE] Could not get Redis memory info:`, error);
    }

    // Include sitemapUrl in the results before saving
    const resultsWithSitemapUrl = {
      ...results,
      sitemapUrl: sitemapUrl,
    };

    // Convert to JSON string and calculate size
    const jsonString = JSON.stringify(resultsWithSitemapUrl);
    const dataSizeBytes = Buffer.byteLength(jsonString, 'utf8');
    const dataSizeMB = dataSizeBytes / (1024 * 1024);
    const dataSizeKB = dataSizeBytes / 1024;
    
    console.log(`[SAVE] Data size: ${dataSizeBytes} bytes (${dataSizeKB.toFixed(2)} KB, ${dataSizeMB.toFixed(2)} MB)`);
    console.log(`[SAVE] Number of URLs: ${results.urls?.length || 0}`);
    
    // Check if data exceeds 25MB limit
    const MAX_SIZE_BYTES = 25 * 1024 * 1024; // 25MB
    if (dataSizeBytes > MAX_SIZE_BYTES) {
      const errorMsg = `Data size (${dataSizeMB.toFixed(2)} MB) exceeds Redis limit (25 MB). Please reduce the number of URLs or split the data.`;
      console.error(`[SAVE] ERROR: ${errorMsg}`);
      return NextResponse.json(
        { 
          error: errorMsg,
          dataSize: {
            bytes: dataSizeBytes,
            kb: dataSizeKB,
            mb: dataSizeMB,
            limitMB: 25
          },
          urlCount: results.urls?.length || 0
        },
        { status: 413 } // 413 Payload Too Large
      );
    }

    // Check if key already exists and delete it first to free memory
    const keyExists = await client.exists(key);
    if (keyExists) {
      console.log(`[SAVE] Key ${key} already exists, deleting old value to free memory...`);
      const oldKeySize = await client.memoryUsage(key).catch(() => 0);
      const oldKeySizeMB = (oldKeySize || 0) / (1024 * 1024);
      console.log(`[SAVE] Old key size: ${oldKeySizeMB.toFixed(2)} MB`);
      await client.del(key);
      console.log(`[SAVE] Deleted old key: ${key}`);
    }

    // Store the results as JSON string
    console.log(`[SAVE] Saving data for key: ${key} (${dataSizeMB.toFixed(2)} MB)`);
    try {
      await client.set(key, jsonString);
      console.log(`[SAVE] Successfully saved key: ${key}`);
    } catch (error: any) {
      // Handle OOM (Out of Memory) errors specifically
      if (error.message && error.message.includes('OOM') || error.message.includes('maxmemory')) {
        console.error(`[SAVE] Redis OOM Error: ${error.message}`);
        
        // Try to get memory info for better error message
        try {
          const info = await client.info('memory');
          const maxMemoryMatch = info.match(/maxmemory:(\d+)/);
          const usedMemoryMatch = info.match(/used_memory:(\d+)/);
          const maxMemory = maxMemoryMatch ? parseInt(maxMemoryMatch[1]) : 0;
          const usedMemory = usedMemoryMatch ? parseInt(usedMemoryMatch[1]) : 0;
          const maxMemoryMB = maxMemory / (1024 * 1024);
          const usedMemoryMB = usedMemory / (1024 * 1024);
          
          const errorMsg = `Redis out of memory! Trying to save ${dataSizeMB.toFixed(2)} MB, but Redis is at ${usedMemoryMB.toFixed(2)} MB / ${maxMemoryMB.toFixed(2)} MB limit. Please delete old keys or upgrade your Redis plan.`;
          
          return NextResponse.json(
            { 
              error: errorMsg,
              dataSize: {
                bytes: dataSizeBytes,
                kb: dataSizeKB,
                mb: dataSizeMB,
                limitMB: 25
              },
              redisMemory: {
                maxMB: maxMemoryMB,
                usedMB: usedMemoryMB,
                availableMB: maxMemoryMB - usedMemoryMB
              },
              urlCount: results.urls?.length || 0
            },
            { status: 507 } // 507 Insufficient Storage
          );
        } catch (infoError) {
          // Fallback error message
          return NextResponse.json(
            { 
              error: `Redis out of memory! Cannot save ${dataSizeMB.toFixed(2)} MB. Please delete old keys or upgrade your Redis plan.`,
              dataSize: {
                bytes: dataSizeBytes,
                kb: dataSizeKB,
                mb: dataSizeMB,
                limitMB: 25
              },
              urlCount: results.urls?.length || 0
            },
            { status: 507 } // 507 Insufficient Storage
          );
        }
      }
      throw error; // Re-throw if it's not an OOM error
    }

    return NextResponse.json({ 
      success: true, 
      key,
      dataSize: {
        bytes: dataSizeBytes,
        kb: dataSizeKB,
        mb: dataSizeMB,
        limitMB: 25
      },
      urlCount: results.urls?.length || 0
    });
  } catch (error: any) {
    console.error('[SAVE] Error saving to Redis:', error);
    console.error('[SAVE] Error details:', {
      message: error.message,
      stack: error.stack,
      redisUrl: process.env.REDIS_URL ? 'Set' : 'Not set',
    });
    return NextResponse.json(
      { 
        error: `Failed to save to Redis: ${error.message || 'Unknown error'}`,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}


