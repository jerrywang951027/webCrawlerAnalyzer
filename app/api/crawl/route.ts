import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import * as cheerio from 'cheerio';

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

// Helper function to get domain from URL
function getDomain(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return urlObj.origin;
  } catch {
    return null;
  }
}

// Helper function to normalize URL (remove fragments, trailing slashes, etc.)
function normalizeUrl(url: string, baseUrl?: string): string | null {
  try {
    let urlObj: URL;
    if (baseUrl) {
      urlObj = new URL(url, baseUrl);
    } else {
      urlObj = new URL(url);
    }
    
    // Remove fragment
    urlObj.hash = '';
    
    // Normalize pathname (remove trailing slash except for root)
    if (urlObj.pathname.length > 1 && urlObj.pathname.endsWith('/')) {
      urlObj.pathname = urlObj.pathname.slice(0, -1);
    }
    
    return urlObj.href;
  } catch {
    return null;
  }
}

// Check if URL is internal (same domain)
function isInternalUrl(url: string, baseDomain: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.origin === baseDomain;
  } catch {
    return false;
  }
}

// Extract internal links from HTML content
function extractInternalLinks(html: string, baseUrl: string, baseDomain: string): string[] {
  const links: string[] = [];
  const $ = cheerio.load(html);
  
  // Find all anchor tags with href attributes
  $('a[href]').each((_, element) => {
    const href = $(element).attr('href');
    if (!href) return;
    
    // Normalize the URL
    const normalizedUrl = normalizeUrl(href, baseUrl);
    if (!normalizedUrl) return;
    
    // Check if it's an internal link
    if (isInternalUrl(normalizedUrl, baseDomain)) {
      links.push(normalizedUrl);
    }
  });
  
  // Remove duplicates
  return [...new Set(links)];
}

// Recursively crawl HTML pages for internal links
async function crawlHtmlLinks(
  url: string,
  baseDomain: string,
  visitedUrls: Set<string>,
  globalUrls: Map<string, UrlEntry>,
  statusLog: string[],
  errorLog: string[],
  delay: number = 500,
  maxDepth: number = 10,
  currentDepth: number = 0
): Promise<void> {
  // Check depth limit
  if (currentDepth >= maxDepth) {
    console.log(`[HTML CRAWL] Max depth reached (${maxDepth}) for ${url}`);
    return;
  }
  
  // Normalize URL and check if already visited
  const normalizedUrl = normalizeUrl(url);
  if (!normalizedUrl) {
    console.log(`[HTML CRAWL] Failed to normalize URL: ${url}`);
    return;
  }
  
  if (visitedUrls.has(normalizedUrl)) {
    console.log(`[HTML CRAWL] Already visited, skipping: ${normalizedUrl}`);
    return;
  }
  
  // Mark as visited
  visitedUrls.add(normalizedUrl);
  
  try {
    // Add delay for politeness
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    console.log(`[HTML CRAWL] [Depth ${currentDepth}] Fetching: ${normalizedUrl}`);
    statusLog.push(`Crawling HTML: ${normalizedUrl} (depth: ${currentDepth})`);
    
    // Fetch the HTML page
    const response = await axios.get(normalizedUrl, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SitemapCrawler/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      maxRedirects: 5,
      validateStatus: (status) => status >= 200 && status < 400,
    });
    
    // Check if response is HTML
    const contentType = response.headers['content-type'] || '';
    if (!contentType.includes('text/html')) {
      console.log(`[HTML CRAWL] Skipping non-HTML content: ${normalizedUrl} (${contentType})`);
      statusLog.push(`Skipping non-HTML content: ${normalizedUrl} (${contentType})`);
      return;
    }
    
    // Add URL to global list if not already present
    const isNewUrl = !globalUrls.has(normalizedUrl);
    if (isNewUrl) {
      // For HTML crawled URLs, use a descriptive source format
      // If depth is 0, it means this URL came directly from sitemap, otherwise show depth
      const htmlSource = currentDepth === 0 
        ? 'HTML_CRAWL:sitemap' 
        : `HTML_CRAWL:depth_${currentDepth}`;
      
      globalUrls.set(normalizedUrl, {
        url: normalizedUrl,
        source: htmlSource,
      });
      console.log(`[HTML CRAWL] Added new URL with source "${htmlSource}": ${normalizedUrl.substring(0, 80)}... (Total: ${globalUrls.size})`);
    } else {
      // Log when URL already exists (for debugging)
      const existing = globalUrls.get(normalizedUrl);
      console.log(`[HTML CRAWL] URL already exists with source "${existing?.source}": ${normalizedUrl.substring(0, 80)}...`);
    }
    
    // Extract internal links
    const html = response.data;
    const internalLinks = extractInternalLinks(html, normalizedUrl, baseDomain);
    
    console.log(`[HTML CRAWL] Found ${internalLinks.length} internal links on ${normalizedUrl}`);
    
    if (internalLinks.length > 0) {
      statusLog.push(`Found ${internalLinks.length} internal links on ${normalizedUrl}`);
      // Log first few links for debugging
      if (internalLinks.length > 0) {
        const sampleLinks = internalLinks.slice(0, 3).join(', ');
        console.log(`[HTML CRAWL] Sample links: ${sampleLinks}`);
        statusLog.push(`Sample links: ${sampleLinks}`);
      }
      
      // Recursively crawl each internal link
      for (let i = 0; i < internalLinks.length; i++) {
        const link = internalLinks[i];
        console.log(`[HTML CRAWL] Processing link ${i + 1}/${internalLinks.length}: ${link}`);
        await crawlHtmlLinks(
          link,
          baseDomain,
          visitedUrls,
          globalUrls,
          statusLog,
          errorLog,
          delay,
          maxDepth,
          currentDepth + 1
        );
      }
    } else {
      console.log(`[HTML CRAWL] No internal links found on ${normalizedUrl}`);
      statusLog.push(`No internal links found on ${normalizedUrl}`);
    }
  } catch (error: any) {
    const errorMessage = `Error crawling HTML ${normalizedUrl}: ${error.message || 'Unknown error'}`;
    console.error(`[HTML CRAWL] ERROR: ${errorMessage}`, error);
    errorLog.push(errorMessage);
    statusLog.push(errorMessage);
    // Continue crawling other links even if one fails
  }
}

// Recursive sitemap crawler
async function crawlSitemap(
  sitemapUrl: string,
  sourcePath: string,
  globalUrls: Map<string, UrlEntry>,
  statusLog: string[],
  errorLog: string[],
  delay: number = 500
): Promise<void> {
  try {
    // Add delay for politeness
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    const filename = getFilename(sitemapUrl);
    console.log(`[SITEMAP] Fetching: ${filename} (${sitemapUrl})`);
    statusLog.push(`Fetching: ${filename}`);

    // Fetch the sitemap
    const response = await axios.get(sitemapUrl, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SitemapCrawler/1.0)',
      },
    });

    const xmlContent = response.data;
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      removeNSPrefix: true,
      parseTagValue: false,
    });

    const parsed = parser.parse(xmlContent);

    // Helper function to extract URL from sitemap/url entry
    const extractUrl = (entry: any): string | null => {
      if (typeof entry === 'string') {
        return entry;
      }
      if (entry && typeof entry === 'object') {
        // Try multiple possible structures
        if (entry.loc) {
          return typeof entry.loc === 'string' ? entry.loc : null;
        }
        if (entry['@_loc']) {
          return typeof entry['@_loc'] === 'string' ? entry['@_loc'] : null;
        }
        // Sometimes the parser might nest it differently
        if (entry.url && typeof entry.url === 'object' && entry.url.loc) {
          return typeof entry.url.loc === 'string' ? entry.url.loc : null;
        }
      }
      return null;
    };

    // Check if it's a sitemap index (contains <sitemap> tags)
    // Handle both namespaced and non-namespaced versions
    const sitemapIndex = parsed.sitemapindex || parsed['sitemap:index'] || parsed['sitemapindex'];
    if (sitemapIndex && sitemapIndex.sitemap) {
      const sitemaps = Array.isArray(sitemapIndex.sitemap)
        ? sitemapIndex.sitemap
        : [sitemapIndex.sitemap];

      console.log(`[SITEMAP] Found ${sitemaps.length} nested sitemaps in ${getFilename(sitemapUrl)}`);
      statusLog.push(`Found ${sitemaps.length} nested sitemaps in ${getFilename(sitemapUrl)}`);

      // Recursively crawl each nested sitemap
      for (let i = 0; i < sitemaps.length; i++) {
        const sitemap = sitemaps[i];
        console.log(`[SITEMAP] Processing nested sitemap ${i + 1}/${sitemaps.length}`);
        const nestedUrl = extractUrl(sitemap);
        if (nestedUrl) {
          const nestedFilename = getFilename(nestedUrl);
          // Always build the source path - if sourcePath is empty, start with nestedFilename
          const newSourcePath = sourcePath && sourcePath.trim()
            ? `${sourcePath}=>${nestedFilename}`
            : nestedFilename;

          await crawlSitemap(nestedUrl, newSourcePath, globalUrls, statusLog, errorLog, delay);
        }
      }
    }
    // Check if it's a URL set (contains <url> tags)
    // Handle both namespaced and non-namespaced versions
    else {
      const urlset = parsed.urlset || parsed['url:urlset'] || parsed['urlset'];
      if (urlset && urlset.url) {
        const urls = Array.isArray(urlset.url)
          ? urlset.url
          : [urlset.url];

        console.log(`[SITEMAP] Found ${urls.length} URLs in ${getFilename(sitemapUrl)}`);
        statusLog.push(`Found ${urls.length} URLs in ${getFilename(sitemapUrl)}`);

        // Ensure sourcePath is set - use current sitemap filename if not provided
        let currentSourcePath = sourcePath && sourcePath.trim() 
          ? sourcePath.trim() 
          : getFilename(sitemapUrl);
        
        // Final fallback to ensure we always have a source
        if (!currentSourcePath || currentSourcePath.trim() === '') {
          currentSourcePath = getFilename(sitemapUrl) || 'sitemap.xml';
        }

        console.log(`[SITEMAP] Processing URLs with source path: "${currentSourcePath}"`);
        statusLog.push(`Processing URLs with source path: "${currentSourcePath}"`);

        // Extract URLs and add to global list
        let urlCount = 0;
        for (const urlEntry of urls) {
          const url = extractUrl(urlEntry);
          
          if (url && typeof url === 'string') {
            // Only add if URL doesn't exist (first encountered source path is retained)
            if (!globalUrls.has(url)) {
              // Ensure source is never empty
              const finalSource = currentSourcePath && currentSourcePath.trim() 
                ? currentSourcePath.trim() 
                : getFilename(sitemapUrl) || 'sitemap.xml';
              
              globalUrls.set(url, {
                url: url,
                source: finalSource,
              });
              console.log(`[SITEMAP] Added URL with source "${finalSource}": ${url.substring(0, 80)}...`);
              urlCount++;
            } else {
              // Log when URL already exists (for debugging)
              const existing = globalUrls.get(url);
              console.log(`[SITEMAP] URL already exists with source "${existing?.source}": ${url.substring(0, 80)}...`);
            }
          } else {
            // Log if URL extraction failed for debugging
            const warningMsg = `Warning: Failed to extract URL from entry: ${JSON.stringify(urlEntry).substring(0, 100)}`;
            console.warn(`[SITEMAP] ${warningMsg}`);
            statusLog.push(warningMsg);
          }
        }
        
        console.log(`[SITEMAP] Extracted ${urlCount} URLs from ${urls.length} entries`);
        if (urlCount === 0 && urls.length > 0) {
          const warningMsg = `Warning: Found ${urls.length} URL entries but extracted 0 URLs. First entry structure: ${JSON.stringify(urls[0]).substring(0, 200)}`;
          console.warn(`[SITEMAP] ${warningMsg}`);
          statusLog.push(warningMsg);
        }
      } else {
        errorLog.push(`Unknown sitemap format in ${sitemapUrl}. Expected sitemapindex or urlset.`);
        // Log parsed structure for debugging
        statusLog.push(`Debug: Parsed keys: ${Object.keys(parsed).join(', ')}`);
      }
    }
  } catch (error: any) {
    const errorMessage = `Error processing ${sitemapUrl}: ${error.message || 'Unknown error'}`;
    console.error(`[SITEMAP] ERROR: ${errorMessage}`, error);
    errorLog.push(errorMessage);
    statusLog.push(errorMessage);
    // Continue crawling other sitemaps even if one fails
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sitemapUrl, delay = 500, crawlHtmlLinks: shouldCrawlHtmlLinks = false } = body;

    if (!sitemapUrl || typeof sitemapUrl !== 'string') {
      return NextResponse.json(
        { error: 'Invalid sitemap URL provided' },
        { status: 400 }
      );
    }

    // Validate URL format
    let baseDomain: string | null = null;
    try {
      const urlObj = new URL(sitemapUrl);
      baseDomain = urlObj.origin;
    } catch {
      return NextResponse.json(
        { error: 'Invalid URL format' },
        { status: 400 }
      );
    }

    const globalUrls = new Map<string, UrlEntry>();
    const statusLog: string[] = [];
    const errorLog: string[] = [];
    const visitedUrls = new Set<string>();

    const entryFilename = getFilename(sitemapUrl);
    console.log(`[SITEMAP CRAWL] Starting crawl from: ${entryFilename}`);
    console.log(`[SITEMAP CRAWL] Sitemap URL: ${sitemapUrl}`);
    console.log(`[SITEMAP CRAWL] Initial source path: ${entryFilename}`);
    statusLog.push(`Starting crawl from: ${entryFilename}`);
    statusLog.push(`Initial source path will be: ${entryFilename}`);

    // Ensure entryFilename is valid
    const initialSourcePath = entryFilename && entryFilename.trim() 
      ? entryFilename.trim() 
      : 'sitemap.xml';
    
    console.log(`[SITEMAP CRAWL] Using source path: "${initialSourcePath}"`);

    // Start recursive crawl with entry filename as initial source path
    await crawlSitemap(sitemapUrl, initialSourcePath, globalUrls, statusLog, errorLog, delay);
    
    console.log(`[SITEMAP CRAWL] Completed. Found ${globalUrls.size} URLs from sitemap`);
    
    // Verify sources are set correctly
    const sampleUrls = Array.from(globalUrls.values()).slice(0, 5);
    console.log(`[SITEMAP CRAWL] Sample URLs with sources:`);
    sampleUrls.forEach(entry => {
      console.log(`  - URL: ${entry.url.substring(0, 60)}... | Source: "${entry.source}"`);
    });

    // If HTML link crawling is enabled, crawl each URL found in sitemap
    if (shouldCrawlHtmlLinks && baseDomain) {
      console.log(`[HTML CRAWL] ========================================`);
      console.log(`[HTML CRAWL] Starting HTML link crawling`);
      console.log(`[HTML CRAWL] Base domain: ${baseDomain}`);
      console.log(`[HTML CRAWL] URLs from sitemap: ${globalUrls.size}`);
      console.log(`[HTML CRAWL] ========================================`);
      
      statusLog.push(`Starting HTML link crawling for ${globalUrls.size} URLs...`);
      statusLog.push(`Base domain: ${baseDomain}`);
      
      const sitemapUrls = Array.from(globalUrls.keys());
      const startTime = Date.now();
      let crawledCount = 0;
      
      for (const url of sitemapUrls) {
        // Don't mark as visited here - let crawlHtmlLinks handle it
        // This allows the function to process the URL and extract links
        
        console.log(`[HTML CRAWL] ========================================`);
        console.log(`[HTML CRAWL] Processing sitemap URL ${crawledCount + 1}/${sitemapUrls.length}: ${url}`);
        console.log(`[HTML CRAWL] Current total URLs: ${globalUrls.size}`);
        
        // Crawl HTML links from this URL
        await crawlHtmlLinks(
          url,
          baseDomain,
          visitedUrls,
          globalUrls,
          statusLog,
          errorLog,
          delay,
          10, // max depth
          0   // start at depth 0
        );
        
        crawledCount++;
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const avgTime = (Date.now() - startTime) / crawledCount / 1000;
        const estimatedRemaining = ((sitemapUrls.length - crawledCount) * avgTime).toFixed(1);
        
        console.log(`[HTML CRAWL] Progress: ${crawledCount}/${sitemapUrls.length} (${((crawledCount / sitemapUrls.length) * 100).toFixed(1)}%)`);
        console.log(`[HTML CRAWL] Elapsed: ${elapsed}s | Avg: ${avgTime.toFixed(2)}s/page | Est. remaining: ${estimatedRemaining}s`);
        console.log(`[HTML CRAWL] Total URLs discovered: ${globalUrls.size}`);
        
        if (crawledCount % 10 === 0) {
          statusLog.push(`HTML crawl progress: ${crawledCount}/${sitemapUrls.length} pages crawled, total URLs: ${globalUrls.size}`);
        }
      }
      
      const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[HTML CRAWL] ========================================`);
      console.log(`[HTML CRAWL] HTML link crawling completed!`);
      console.log(`[HTML CRAWL] Total time: ${totalTime}s`);
      console.log(`[HTML CRAWL] Pages crawled: ${crawledCount}`);
      console.log(`[HTML CRAWL] Total URLs found: ${globalUrls.size} (started with ${sitemapUrls.length} from sitemap)`);
      console.log(`[HTML CRAWL] New URLs discovered: ${globalUrls.size - sitemapUrls.length}`);
      console.log(`[HTML CRAWL] ========================================`);
      
      statusLog.push(`HTML link crawling completed. Total URLs found: ${globalUrls.size} (started with ${sitemapUrls.length} from sitemap)`);
    } else {
      if (!shouldCrawlHtmlLinks) {
        console.log(`[HTML CRAWL] HTML link crawling is disabled`);
        statusLog.push(`HTML link crawling is disabled`);
      }
      if (!baseDomain) {
        console.error(`[HTML CRAWL] Warning: Could not determine base domain for HTML crawling`);
        statusLog.push(`Warning: Could not determine base domain for HTML crawling`);
      }
    }

    // Convert Map to Array
    const urls = Array.from(globalUrls.values());

    console.log(`[CRAWL] ========================================`);
    console.log(`[CRAWL] Final Results:`);
    console.log(`[CRAWL] Total unique URLs: ${urls.length}`);
    console.log(`[CRAWL] Errors: ${errorLog.length}`);
    console.log(`[CRAWL] ========================================`);

    statusLog.push(`Crawl completed. Total unique URLs found: ${urls.length}`);

    const result: CrawlResult = {
      urls,
      status: statusLog,
      errors: errorLog,
      sitemapUrl: sitemapUrl,
    };

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: `Server error: ${error.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}

