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

    // Store the results as JSON string
    console.log(`[SAVE] Saving data for key: ${key} (${dataSizeMB.toFixed(2)} MB)`);
    await client.set(key, jsonString);
    console.log(`[SAVE] Successfully saved key: ${key}`);

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


