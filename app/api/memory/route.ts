import { NextRequest, NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';

export async function GET(request: NextRequest) {
  try {
    const client = await getRedisClient();
    
    // Get Redis memory information
    const info = await client.info('memory');
    const maxMemoryMatch = info.match(/maxmemory:(\d+)/);
    const usedMemoryMatch = info.match(/used_memory:(\d+)/);
    
    const maxMemory = maxMemoryMatch ? parseInt(maxMemoryMatch[1]) : 0;
    const usedMemory = usedMemoryMatch ? parseInt(usedMemoryMatch[1]) : 0;
    
    const maxMemoryMB = maxMemory / (1024 * 1024);
    const usedMemoryMB = usedMemory / (1024 * 1024);
    const availableMemoryMB = maxMemoryMB - usedMemoryMB;
    
    // Check if running on Heroku
    const isHeroku = !!process.env.REDIS_URL && process.env.REDIS_URL.includes('heroku');
    
    return NextResponse.json({
      usedMB: usedMemoryMB,
      maxMB: maxMemoryMB,
      availableMB: availableMemoryMB,
      isHeroku: isHeroku,
      // If maxMemory is 0, it means no limit (local Redis typically)
      hasLimit: maxMemory > 0,
    });
  } catch (error: any) {
    console.error('Error fetching Redis memory info:', error);
    return NextResponse.json(
      { error: `Failed to fetch memory info: ${error.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}

