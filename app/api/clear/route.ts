import { NextRequest, NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';

export async function DELETE(request: NextRequest) {
  try {
    const client = await getRedisClient();
    
    // Get all keys first to count them
    const keys = await client.keys('*');
    const keyCount = keys.length;
    
    if (keyCount === 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'No keys to delete',
        deletedCount: 0
      });
    }
    
    console.log(`[CLEAR] Deleting ${keyCount} keys from Redis...`);
    
    // Delete all keys
    if (keys.length > 0) {
      await client.del(keys);
    }
    
    console.log(`[CLEAR] Successfully deleted ${keyCount} keys`);
    
    // Get memory info after deletion
    try {
      const info = await client.info('memory');
      const usedMemoryMatch = info.match(/used_memory:(\d+)/);
      const usedMemory = usedMemoryMatch ? parseInt(usedMemoryMatch[1]) : 0;
      const usedMemoryMB = usedMemory / (1024 * 1024);
      
      return NextResponse.json({ 
        success: true, 
        message: `Successfully deleted ${keyCount} keys`,
        deletedCount: keyCount,
        memoryAfterMB: usedMemoryMB
      });
    } catch (error) {
      return NextResponse.json({ 
        success: true, 
        message: `Successfully deleted ${keyCount} keys`,
        deletedCount: keyCount
      });
    }
  } catch (error: any) {
    console.error('[CLEAR] Error clearing Redis keys:', error);
    return NextResponse.json(
      { 
        error: `Failed to clear Redis keys: ${error.message || 'Unknown error'}`,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

