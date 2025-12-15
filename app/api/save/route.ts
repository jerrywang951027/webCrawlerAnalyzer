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
    const client = await getRedisClient();

    // Include sitemapUrl in the results before saving
    const resultsWithSitemapUrl = {
      ...results,
      sitemapUrl: sitemapUrl,
    };

    // Store the results as JSON string
    await client.set(key, JSON.stringify(resultsWithSitemapUrl));

    return NextResponse.json({ success: true, key });
  } catch (error: any) {
    console.error('Error saving to Redis:', error);
    return NextResponse.json(
      { error: `Failed to save to Redis: ${error.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}


