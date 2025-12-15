import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json(
        { error: 'Missing required field: url' },
        { status: 400 }
      );
    }

    console.log(`[ROBOTS] Fetching robots.txt from: ${url}`);

    // Fetch robots.txt
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SitemapAnalyzer/1.0)',
      },
    });

    const robotsContent = response.data;
    console.log(`[ROBOTS] Received ${robotsContent.length} bytes`);

    // Parse robots.txt to extract Sitemap URLs
    // Look for lines starting with "Sitemap:" (case-insensitive)
    const sitemapLines = robotsContent
      .split('\n')
      .map((line: string) => line.trim())
      .filter((line: string) => {
        // Match lines that start with "Sitemap:" (case-insensitive)
        return /^sitemap:\s*/i.test(line);
      });

    const sitemaps = sitemapLines.map((line: string) => {
      // Extract URL after "Sitemap:"
      const match = line.match(/^sitemap:\s*(.+)$/i);
      return match ? match[1].trim() : '';
    }).filter((url: string) => url.length > 0);

    console.log(`[ROBOTS] Found ${sitemaps.length} sitemap(s)`);

    return NextResponse.json({
      sitemaps,
      robotsContent: robotsContent.substring(0, 5000), // Include first 5KB for debugging
    });
  } catch (error: any) {
    console.error('[ROBOTS] Error fetching robots.txt:', error);
    
    let errorMessage = 'Failed to fetch robots.txt';
    if (error.response) {
      errorMessage = `HTTP ${error.response.status}: ${error.response.statusText}`;
    } else if (error.request) {
      errorMessage = 'No response from server. Check if the URL is correct.';
    } else if (error.message) {
      errorMessage = error.message;
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

