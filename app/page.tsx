'use client';

import { useState, useEffect } from 'react';

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

export default function Home() {
  const [sitemapUrl, setSitemapUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<CrawlResult | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: keyof UrlEntry | null; direction: 'asc' | 'desc' }>({
    key: null,
    direction: 'asc',
  });
  const [filterText, setFilterText] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [isSaving, setIsSaving] = useState(false);
  const [historyKeys, setHistoryKeys] = useState<string[]>([]);
  const [selectedHistoryKey, setSelectedHistoryKey] = useState('');
  const [crawlHtmlLinks, setCrawlHtmlLinks] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [activeTab, setActiveTab] = useState<'analyze' | 'load' | 'sitemaps'>('analyze');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [isLoadingSitemaps, setIsLoadingSitemaps] = useState(false);
  const [foundSitemaps, setFoundSitemaps] = useState<string[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [savedResultsSummary, setSavedResultsSummary] = useState<Array<{
    name: string;
    sitemapUrl: string;
    totalUrls: number;
    totalSubSitemaps: number;
  }>>([]);
  const [redisMemory, setRedisMemory] = useState<{
    usedMB: number;
    maxMB: number;
    availableMB: number;
    isHeroku: boolean;
    hasLimit: boolean;
  } | null>(null);

  // Load dark mode preference from localStorage
  useEffect(() => {
    const savedDarkMode = localStorage.getItem('darkMode') === 'true';
    setDarkMode(savedDarkMode);
  }, []);

  // Save dark mode preference to localStorage
  useEffect(() => {
    localStorage.setItem('darkMode', darkMode.toString());
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Fetch history keys on component mount
  useEffect(() => {
    fetchHistoryKeys();
  }, []);

  // Fetch Redis memory info when Load Saved Result tab is active
  useEffect(() => {
    if (activeTab === 'load') {
      fetchRedisMemory();
    }
  }, [activeTab]);

  const fetchRedisMemory = async () => {
    try {
      const response = await fetch('/api/memory');
      if (response.ok) {
        const data = await response.json();
        setRedisMemory(data);
      }
    } catch (error) {
      console.error('Error fetching Redis memory info:', error);
    }
  };

  const fetchHistoryKeys = async () => {
    try {
      const response = await fetch('/api/keys');
      if (response.ok) {
        const data = await response.json();
        setHistoryKeys(data.keys || []);
      }
    } catch (error) {
      console.error('Error fetching history keys:', error);
    }
  };

  // Validate URL format
  const isValidUrl = (url: string): boolean => {
    try {
      new URL(url);
      return url.trim().length > 0;
    } catch {
      return false;
    }
  };

  const handleCrawl = async () => {
    if (!isValidUrl(sitemapUrl)) {
      alert('Please enter a valid URL');
      return;
    }

    setIsLoading(true);
    setResults(null);
    setCurrentPage(1);

    try {
      const response = await fetch('/api/crawl', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          sitemapUrl, 
          delay: 500,
          crawlHtmlLinks: crawlHtmlLinks 
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to crawl sitemap');
      }

      const data: CrawlResult = await response.json();
      setResults(data);
      await fetchHistoryKeys(); // Refresh history after new crawl
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!results || !sitemapUrl) {
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch('/api/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sitemapUrl, results }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Handle size limit error (413) with detailed message
        if (response.status === 413 && data.dataSize) {
          const sizeInfo = data.dataSize;
          const errorMsg = `${data.error}\n\nSize Details:\n- Current size: ${sizeInfo.mb.toFixed(2)} MB\n- Limit: ${sizeInfo.limitMB} MB\n- URLs: ${data.urlCount || 0}\n\nPlease reduce the number of URLs or split the data.`;
          alert(errorMsg);
        } 
        // Handle Redis OOM error (507) with memory information
        else if (response.status === 507 && data.redisMemory) {
          const sizeInfo = data.dataSize;
          const memInfo = data.redisMemory;
          const errorMsg = `${data.error}\n\nRedis Memory Status:\n- Max memory: ${memInfo.maxMB.toFixed(2)} MB\n- Used memory: ${memInfo.usedMB.toFixed(2)} MB\n- Available: ${memInfo.availableMB.toFixed(2)} MB\n\nTrying to save: ${sizeInfo.mb.toFixed(2)} MB\n\nPlease delete old saved results or upgrade your Redis plan.`;
          alert(errorMsg);
        }
        else {
          throw new Error(data.error || 'Failed to save');
        }
        return;
      }

      await fetchHistoryKeys(); // Refresh history after save
      
      // Show success message with size information
      if (data.dataSize) {
        const sizeInfo = data.dataSize;
        alert(`Results saved successfully!\n\nSize: ${sizeInfo.mb.toFixed(2)} MB (${sizeInfo.kb.toFixed(2)} KB)\nURLs: ${data.urlCount || 0}`);
      } else {
        alert('Results saved successfully!');
      }
    } catch (error: any) {
      alert(`Error saving: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadHistory = async (key: string) => {
    if (!key) {
      return;
    }

    // Handle "All" option
    if (key === '__ALL__') {
      await handleLoadAllHistory();
      return;
    }

    // Clear summary when loading single result
    setSavedResultsSummary([]);

    setIsLoadingHistory(true);
    try {
      const response = await fetch('/api/load', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ key }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to load');
      }

      const data = await response.json();
      setResults(data.results);
      setCurrentPage(1);
      // Use saved sitemapUrl if available, otherwise use placeholder
      setSitemapUrl(data.results.sitemapUrl || `https://example.com/${key}`);
    } catch (error: any) {
      alert(`Error loading: ${error.message}`);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleFetchSitemaps = async () => {
    if (!isValidUrl(websiteUrl)) {
      alert('Please enter a valid URL');
      return;
    }

    setIsLoadingSitemaps(true);
    setFoundSitemaps([]);
    
    try {
      // Normalize URL - ensure it has protocol
      let normalizedUrl = websiteUrl.trim();
      if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
        normalizedUrl = 'https://' + normalizedUrl;
      }
      
      // Remove trailing slash and append /robots.txt
      const robotsUrl = normalizedUrl.replace(/\/$/, '') + '/robots.txt';
      
      const response = await fetch('/api/robots', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: robotsUrl }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch robots.txt');
      }

      const data = await response.json();
      setFoundSitemaps(data.sitemaps || []);
    } catch (error: any) {
      alert(`Error fetching sitemaps: ${error.message}`);
    } finally {
      setIsLoadingSitemaps(false);
    }
  };

  // Helper function to count sub-sitemaps from source paths
  const countSubSitemaps = (urls: UrlEntry[]): number => {
    const sitemapSet = new Set<string>();
    urls.forEach(entry => {
      // Count "=>" delimiters to determine nesting level
      // Each "=>" represents a nested sitemap
      const parts = entry.source.split('=>');
      parts.forEach(part => {
        sitemapSet.add(part.trim());
      });
    });
    return sitemapSet.size;
  };

  const handleLoadAllHistory = async () => {
    if (historyKeys.length === 0) {
      alert('No saved results found');
      return;
    }

    setIsLoadingHistory(true);
    try {
      // Load all saved results
      const allResults: UrlEntry[] = [];
      const allStatus: string[] = [];
      const allErrors: string[] = [];
      const summary: Array<{
        name: string;
        sitemapUrl: string;
        totalUrls: number;
        totalSubSitemaps: number;
      }> = [];

      for (const key of historyKeys) {
        try {
          const response = await fetch('/api/load', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ key }),
          });

          if (response.ok) {
            const data = await response.json();
            if (data.results) {
              const urls = data.results.urls || [];
              
              // Calculate sub-sitemaps count for this saved result
              const subSitemapsCount = countSubSitemaps(urls);
              
              // Add to summary
              summary.push({
                name: key,
                sitemapUrl: data.results.sitemapUrl || 'N/A',
                totalUrls: urls.length,
                totalSubSitemaps: subSitemapsCount,
              });
              
              // Merge URLs, avoiding duplicates
              const existingUrls = new Set(allResults.map(r => r.url));
              urls.forEach((entry: UrlEntry) => {
                if (!existingUrls.has(entry.url)) {
                  allResults.push(entry);
                  existingUrls.add(entry.url);
                }
              });
              
              // Merge status and errors
              if (data.results.status) {
                allStatus.push(`--- Loaded from ${key} ---`);
                allStatus.push(...data.results.status);
              }
              if (data.results.errors) {
                allErrors.push(...data.results.errors);
              }
            }
          }
        } catch (error) {
          console.error(`Error loading ${key}:`, error);
        }
      }

      setSavedResultsSummary(summary);
      setResults({
        urls: allResults,
        status: allStatus,
        errors: allErrors,
        sitemapUrl: 'All saved results',
      });
      setCurrentPage(1);
      setSitemapUrl('All saved results');
    } catch (error: any) {
      alert(`Error loading all results: ${error.message}`);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleSort = (key: keyof UrlEntry) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const getSortedUrls = (): UrlEntry[] => {
    if (!results || !sortConfig.key || !results.urls) {
      return results?.urls || [];
    }

    const sorted = [...results.urls].sort((a, b) => {
      const aValue = a[sortConfig.key!];
      const bValue = b[sortConfig.key!];

      if (aValue < bValue) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });

    return sorted;
  };

  const getFilteredUrls = (): UrlEntry[] => {
    const sorted = getSortedUrls();
    if (!filterText.trim()) {
      return sorted;
    }

    const filter = filterText.toLowerCase();
    return sorted.filter(
      (entry) =>
        entry.url.toLowerCase().includes(filter) ||
        entry.source.toLowerCase().includes(filter)
    );
  };

  const filteredUrls = getFilteredUrls();
  const totalPages = Math.ceil(filteredUrls.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedUrls = filteredUrls.slice(startIndex, endIndex);

  // Reset to page 1 when filter or page size changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filterText, pageSize]);

  return (
    <main className={`min-h-screen p-8 transition-colors ${
      darkMode 
        ? 'bg-gradient-to-br from-gray-900 to-gray-800' 
        : 'bg-gradient-to-br from-blue-50 to-indigo-100'
    }`}>
      <div className="max-w-7xl mx-auto">
        {/* Dark Mode Toggle */}
        <div className="flex justify-end mb-4">
          <button
            onClick={() => setDarkMode(!darkMode)}
            className={`p-2 rounded-lg transition-colors ${
              darkMode
                ? 'bg-gray-700 text-yellow-400 hover:bg-gray-600'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
            aria-label="Toggle dark mode"
          >
            {darkMode ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>
        </div>

        <h1 className={`text-4xl font-bold text-center mb-8 ${
          darkMode ? 'text-white' : 'text-gray-800'
        }`}>
          Recursive Sitemap Analyzer & Source Tracker
        </h1>

        {/* Tabs */}
        <div className={`rounded-lg shadow-lg mb-6 ${
          darkMode ? 'bg-gray-800' : 'bg-white'
        }`}>
          <div className={`flex border-b ${
            darkMode ? 'border-gray-600' : 'border-gray-300'
          }`}>
            <button
              onClick={() => setActiveTab('analyze')}
              className={`flex-1 px-6 py-4 font-semibold transition-colors ${
                activeTab === 'analyze'
                  ? darkMode
                    ? 'bg-gray-700 text-white border-b-2 border-blue-500'
                    : 'bg-gray-100 text-gray-800 border-b-2 border-blue-500'
                  : darkMode
                    ? 'text-gray-400 hover:text-white hover:bg-gray-700'
                    : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
              }`}
            >
              Analyze Sitemap
            </button>
            <button
              onClick={() => setActiveTab('load')}
              className={`flex-1 px-6 py-4 font-semibold transition-colors ${
                activeTab === 'load'
                  ? darkMode
                    ? 'bg-gray-700 text-white border-b-2 border-blue-500'
                    : 'bg-gray-100 text-gray-800 border-b-2 border-blue-500'
                  : darkMode
                    ? 'text-gray-400 hover:text-white hover:bg-gray-700'
                    : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
              }`}
            >
              Load Saved Result
            </button>
            <button
              onClick={() => setActiveTab('sitemaps')}
              className={`flex-1 px-6 py-4 font-semibold transition-colors ${
                activeTab === 'sitemaps'
                  ? darkMode
                    ? 'bg-gray-700 text-white border-b-2 border-blue-500'
                    : 'bg-gray-100 text-gray-800 border-b-2 border-blue-500'
                  : darkMode
                    ? 'text-gray-400 hover:text-white hover:bg-gray-700'
                    : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
              }`}
            >
              Get all sitemaps
            </button>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'analyze' && (
              <div>
                <div className="flex gap-4 mb-4">
                  <input
                    type="text"
                    value={sitemapUrl}
                    onChange={(e) => setSitemapUrl(e.target.value)}
                    placeholder="Enter Sitemap URL (e.g., https://example.com/sitemap-index.xml)"
                    className={`flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      darkMode
                        ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
                        : 'border-gray-300 text-black'
                    }`}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && isValidUrl(sitemapUrl) && !isLoading) {
                        handleCrawl();
                      }
                    }}
                  />
                  <button
                    onClick={handleCrawl}
                    disabled={!isValidUrl(sitemapUrl) || isLoading}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                  >
                    {isLoading ? 'Analyzing...' : 'Start Analysis'}
                  </button>
                </div>
                
                {/* Options */}
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={crawlHtmlLinks}
                      onChange={(e) => setCrawlHtmlLinks(e.target.checked)}
                      className={`w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 ${
                        darkMode ? 'bg-gray-700 border-gray-600' : ''
                      }`}
                      disabled={isLoading}
                    />
                    <span className={`text-sm ${
                      darkMode ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      Crawl HTML links recursively (finds internal links from each page)
                    </span>
                  </label>
                </div>
              </div>
            )}

            {activeTab === 'load' && (
              <div>
                {/* Redis Memory Usage Display */}
                {redisMemory && (
                  <div className={`mb-4 p-4 rounded-lg border ${
                    darkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-300'
                  }`}>
                    <div className={`text-sm font-medium ${
                      darkMode ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      Redis Memory Usage:{' '}
                      <span className={`font-semibold ${
                        darkMode ? 'text-white' : 'text-gray-900'
                      }`}>
                        {redisMemory.usedMB.toFixed(1)}M
                        {redisMemory.hasLimit ? (
                          `/${redisMemory.maxMB.toFixed(0)}M`
                        ) : (
                          '/∞'
                        )}
                        {' '}(Redis)
                      </span>
                    </div>
                    {redisMemory.hasLimit && (
                      <div className="mt-2">
                        <div className={`w-full h-2 rounded-full overflow-hidden ${
                          darkMode ? 'bg-gray-600' : 'bg-gray-200'
                        }`}>
                          <div
                            className={`h-full transition-all ${
                              redisMemory.usedMB / redisMemory.maxMB > 0.9
                                ? 'bg-red-500'
                                : redisMemory.usedMB / redisMemory.maxMB > 0.7
                                ? 'bg-yellow-500'
                                : 'bg-green-500'
                            }`}
                            style={{
                              width: `${Math.min((redisMemory.usedMB / redisMemory.maxMB) * 100, 100)}%`
                            }}
                          />
                        </div>
                        <div className={`text-xs mt-1 ${
                          darkMode ? 'text-gray-400' : 'text-gray-600'
                        }`}>
                          {redisMemory.availableMB.toFixed(1)}M available
                        </div>
                      </div>
                    )}
                  </div>
                )}
                
                <div className="mb-4">
                  <label className={`block text-sm font-medium mb-2 ${
                    darkMode ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    Select a saved result to load:
                  </label>
                  <div className="flex gap-4">
                    <select
                      value={selectedHistoryKey}
                      onChange={(e) => {
                        setSelectedHistoryKey(e.target.value);
                      }}
                      className={`flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        darkMode
                          ? 'bg-gray-700 border-gray-600 text-white'
                          : 'border-gray-300 text-black bg-white'
                      }`}
                    >
                      <option value="">Select a saved result...</option>
                      {historyKeys.length > 0 && (
                        <option value="__ALL__">All ({historyKeys.length} saved)</option>
                      )}
                      {historyKeys.map((key) => (
                        <option key={key} value={key}>
                          {key}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => {
                        if (selectedHistoryKey) {
                          handleLoadHistory(selectedHistoryKey);
                        }
                      }}
                      disabled={!selectedHistoryKey || isLoadingHistory}
                      className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                    >
                      {isLoadingHistory ? 'Loading...' : 'Load Selected'}
                    </button>
                  </div>
                </div>
                
                {/* Display loaded sitemap URL */}
                {results && results.sitemapUrl && (
                  <div className={`mt-4 p-4 rounded-lg ${
                    darkMode ? 'bg-gray-700' : 'bg-gray-50'
                  }`}>
                    <label className={`block text-sm font-medium mb-2 ${
                      darkMode ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      Loaded Sitemap URL:
                    </label>
                    <div className={`px-4 py-2 rounded border ${
                      darkMode
                        ? 'bg-gray-800 border-gray-600 text-gray-300'
                        : 'bg-white border-gray-300 text-gray-800'
                    }`}>
                      {results.sitemapUrl}
                    </div>
                  </div>
                )}
              </div>
            )}
            {activeTab === 'sitemaps' && (
              <div>
                <div className="mb-4">
                  <label className={`block text-sm font-medium mb-2 ${
                    darkMode ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    Enter website URL to fetch robots.txt:
                  </label>
                  <div className="flex gap-4">
                    <input
                      type="text"
                      value={websiteUrl}
                      onChange={(e) => setWebsiteUrl(e.target.value)}
                      placeholder="https://docs.nvidia.com"
                      className={`flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        darkMode
                          ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
                          : 'border-gray-300 text-black'
                      }`}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && isValidUrl(websiteUrl) && !isLoadingSitemaps) {
                          handleFetchSitemaps();
                        }
                      }}
                    />
                    <button
                      onClick={handleFetchSitemaps}
                      disabled={!isValidUrl(websiteUrl) || isLoadingSitemaps}
                      className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                    >
                      {isLoadingSitemaps ? 'Fetching...' : 'Fetch Sitemaps'}
                    </button>
                  </div>
                </div>
                
                {foundSitemaps.length > 0 && (
                  <div className={`rounded-lg shadow-lg p-6 ${
                    darkMode ? 'bg-gray-800' : 'bg-white'
                  }`}>
                    <h2 className={`text-2xl font-semibold mb-4 ${
                      darkMode ? 'text-white' : 'text-gray-800'
                    }`}>
                      Found Sitemaps ({foundSitemaps.length})
                    </h2>
                    <div className={`rounded-lg p-4 max-h-96 overflow-y-auto font-mono text-sm whitespace-pre-wrap ${
                      darkMode ? 'bg-gray-900 text-gray-300' : 'bg-gray-50 text-gray-800'
                    }`}>
                      {foundSitemaps.map((sitemap, index) => (
                        <div key={index} className="mb-2">
                          <span className="text-blue-500">Sitemap:</span>{' '}
                          <a
                            href={sitemap}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`hover:underline ${
                              darkMode ? 'text-blue-400' : 'text-blue-600'
                            }`}
                          >
                            {sitemap}
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Saved Results Summary Table */}
        {savedResultsSummary.length > 0 && (
          <div className={`rounded-lg shadow-lg p-6 mb-6 ${
            darkMode ? 'bg-gray-800' : 'bg-white'
          }`}>
            <h2 className={`text-2xl font-semibold mb-4 ${
              darkMode ? 'text-white' : 'text-gray-800'
            }`}>
              Saved Results Summary
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse table-fixed">
                <colgroup>
                  <col className="w-1/4" />
                  <col className="w-2/5" />
                  <col className="w-1/5" />
                  <col className="w-1/5" />
                </colgroup>
                <thead>
                  <tr className={darkMode ? 'bg-gray-700' : 'bg-gray-100'}>
                    <th className={`border px-4 py-3 text-left font-bold ${
                      darkMode ? 'text-white border-gray-600' : 'text-black border-gray-300'
                    }`}>
                      Saved Name
                    </th>
                    <th className={`border px-4 py-3 text-left font-bold ${
                      darkMode ? 'text-white border-gray-600' : 'text-black border-gray-300'
                    }`}>
                      Sitemap URL
                    </th>
                    <th className={`border px-4 py-3 text-left font-bold ${
                      darkMode ? 'text-white border-gray-600' : 'text-black border-gray-300'
                    }`}>
                      Total URLs
                    </th>
                    <th className={`border px-4 py-3 text-left font-bold ${
                      darkMode ? 'text-white border-gray-600' : 'text-black border-gray-300'
                    }`}>
                      Sub Sitemaps
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {savedResultsSummary.map((item, index) => (
                    <tr
                      key={index}
                      className={`transition-colors ${
                        darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'
                      }`}
                    >
                      <td className={`border px-4 py-2 break-words ${
                        darkMode ? 'border-gray-600 text-gray-300' : 'border-gray-300 text-gray-800'
                      }`}>
                        {item.name}
                      </td>
                      <td className={`border px-4 py-2 break-words ${
                        darkMode ? 'border-gray-600 text-gray-300' : 'border-gray-300 text-gray-800'
                      }`}>
                        <a
                          href={item.sitemapUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={darkMode ? 'text-blue-400 hover:underline' : 'text-blue-600 hover:underline'}
                        >
                          {item.sitemapUrl}
                        </a>
                      </td>
                      <td className={`border px-4 py-2 text-center ${
                        darkMode ? 'border-gray-600 text-gray-300' : 'border-gray-300 text-gray-800'
                      }`}>
                        {item.totalUrls.toLocaleString()}
                      </td>
                      <td className={`border px-4 py-2 text-center ${
                        darkMode ? 'border-gray-600 text-gray-300' : 'border-gray-300 text-gray-800'
                      }`}>
                        {item.totalSubSitemaps}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Status Display */}
        {(isLoading || results) && (
          <div className={`rounded-lg shadow-lg p-6 mb-6 ${
            darkMode ? 'bg-gray-800' : 'bg-white'
          }`}>
            <div className="flex justify-between items-center mb-4">
              <h2 className={`text-2xl font-semibold ${
                darkMode ? 'text-white' : 'text-gray-800'
              }`}>Status Log</h2>
              {results && (
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  {isSaving ? 'Saving...' : 'Save to Redis'}
                </button>
              )}
            </div>
            <div className={`rounded-lg p-4 max-h-64 overflow-y-auto font-mono text-sm ${
              darkMode ? 'bg-gray-900' : 'bg-gray-50'
            }`}>
              {isLoading && !results && (
                <div className="text-blue-400">Starting crawl...</div>
              )}
              {results?.status && results.status.map((status, index) => (
                <div key={index} className={darkMode ? 'text-gray-300 mb-1' : 'text-gray-700 mb-1'}>
                  {status}
                </div>
              ))}
              {results?.errors && results.errors.length > 0 && (
                <>
                  <div className="text-red-500 font-semibold mt-4 mb-2">Errors:</div>
                  {results.errors.map((error, index) => (
                    <div key={index} className="text-red-500 mb-1">
                      {error}
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        )}

        {/* Results Table */}
        {results && (
          <div className={`rounded-lg shadow-lg p-6 ${
            darkMode ? 'bg-gray-800' : 'bg-white'
          }`}>
            <div className="flex justify-between items-center mb-4">
              <h2 className={`text-2xl font-semibold ${
                darkMode ? 'text-white' : 'text-gray-800'
              }`}>
                Results ({filteredUrls.length} {filteredUrls.length === 1 ? 'URL' : 'URLs'})
              </h2>
              <div className="flex gap-4 items-center">
                <input
                  type="text"
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  placeholder="Filter URLs or sources..."
                  className={`px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    darkMode
                      ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
                      : 'border-gray-300 text-black'
                  }`}
                />
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className={`px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    darkMode
                      ? 'bg-gray-700 border-gray-600 text-white'
                      : 'border-gray-300 text-black bg-white'
                  }`}
                >
                  <option value={50}>50 per page</option>
                  <option value={100}>100 per page</option>
                  <option value={200}>200 per page</option>
                  <option value={500}>500 per page</option>
                  <option value={1000}>1000 per page</option>
                </select>
              </div>
            </div>

            {filteredUrls.length === 0 ? (
              <div className={`text-center py-8 ${
                darkMode ? 'text-gray-400' : 'text-gray-500'
              }`}>
                {filterText ? 'No URLs match your filter' : 'No URLs found'}
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse table-fixed">
                    <colgroup>
                      <col className="w-16" />
                      <col className="w-3/5" />
                      <col className="w-2/5" />
                    </colgroup>
                    <thead>
                      <tr className={darkMode ? 'bg-gray-700' : 'bg-gray-100'}>
                        <th
                          className={`border px-4 py-3 text-center font-bold transition-colors ${
                            darkMode
                              ? 'text-white border-gray-600'
                              : 'text-black border-gray-300'
                          }`}
                        >
                          #
                        </th>
                        <th
                          className={`border px-4 py-3 text-left cursor-pointer font-bold transition-colors ${
                            darkMode
                              ? 'text-white border-gray-600 hover:bg-gray-600'
                              : 'text-black border-gray-300 hover:bg-gray-200'
                          }`}
                          onClick={() => handleSort('url')}
                        >
                          URL
                          {sortConfig.key === 'url' && (
                            <span className="ml-2">
                              {sortConfig.direction === 'asc' ? '↑' : '↓'}
                            </span>
                          )}
                        </th>
                        <th
                          className={`border px-4 py-3 text-left cursor-pointer font-bold transition-colors ${
                            darkMode
                              ? 'text-white border-gray-600 hover:bg-gray-600'
                              : 'text-black border-gray-300 hover:bg-gray-200'
                          }`}
                          onClick={() => handleSort('source')}
                        >
                          Source
                          {sortConfig.key === 'source' && (
                            <span className="ml-2">
                              {sortConfig.direction === 'asc' ? '↑' : '↓'}
                            </span>
                          )}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedUrls.map((entry, index) => {
                        // Calculate the row number starting from 1 for the current page
                        const rowNumber = (currentPage - 1) * pageSize + index + 1;
                        return (
                          <tr
                            key={index}
                            className={`transition-colors ${
                              darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'
                            }`}
                          >
                            <td className={`border px-4 py-2 text-center ${
                              darkMode
                                ? 'border-gray-600 text-gray-300'
                                : 'border-gray-300 text-gray-800'
                            }`}>
                              {rowNumber}
                            </td>
                            <td className={`border px-4 py-2 break-words overflow-wrap-anywhere word-break-break-all ${
                              darkMode ? 'border-gray-600' : 'border-gray-300'
                            }`}>
                              <a
                                href={entry.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`${darkMode ? 'text-blue-400 hover:underline' : 'text-blue-600 hover:underline'} break-all`}
                              >
                                {entry.url}
                              </a>
                            </td>
                            <td className={`border px-4 py-2 break-words font-mono text-sm overflow-wrap-anywhere word-break-break-all ${
                              darkMode
                                ? 'border-gray-600 text-gray-300'
                                : 'border-gray-300 text-gray-800'
                            }`}>
                              {entry.source}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="flex justify-between items-center mt-4">
                    <div className={`text-sm ${
                      darkMode ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      Showing {startIndex + 1} to {Math.min(endIndex, filteredUrls.length)} of {filteredUrls.length} URLs
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                        className={`px-4 py-2 border rounded-lg transition-colors ${
                          darkMode
                            ? 'border-gray-600 hover:bg-gray-700 disabled:bg-gray-800 disabled:cursor-not-allowed text-gray-300'
                            : 'border-gray-300 hover:bg-gray-50 disabled:bg-gray-100 disabled:cursor-not-allowed'
                        }`}
                      >
                        Previous
                      </button>
                      <span className={`px-4 py-2 ${
                        darkMode ? 'text-gray-300' : 'text-gray-700'
                      }`}>
                        Page {currentPage} of {totalPages}
                      </span>
                      <button
                        onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages}
                        className={`px-4 py-2 border rounded-lg transition-colors ${
                          darkMode
                            ? 'border-gray-600 hover:bg-gray-700 disabled:bg-gray-800 disabled:cursor-not-allowed text-gray-300'
                            : 'border-gray-300 hover:bg-gray-50 disabled:bg-gray-100 disabled:cursor-not-allowed'
                        }`}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
