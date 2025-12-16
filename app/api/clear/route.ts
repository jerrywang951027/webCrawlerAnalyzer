import { NextRequest, NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';

export async function DELETE(request: NextRequest) {
  try {
    const client = await getRedisClient();
    
    // Get memory info before deletion
    let memoryBeforeMB = 0;
    try {
      const infoBefore = await client.info('memory');
      const usedMemoryMatch = infoBefore.match(/used_memory:(\d+)/);
      const usedMemory = usedMemoryMatch ? parseInt(usedMemoryMatch[1]) : 0;
      memoryBeforeMB = usedMemory / (1024 * 1024);
      console.log(`[CLEAR] Memory before deletion: ${memoryBeforeMB.toFixed(2)} MB`);
    } catch (error) {
      console.warn('[CLEAR] Could not get memory info before deletion');
    }
    
    // Get all keys first to count them
    const keys = await client.keys('*');
    const keyCount = keys.length;
    
    console.log(`[CLEAR] Found ${keyCount} keys in Redis`);
    if (keyCount > 0) {
      console.log(`[CLEAR] Keys to delete: ${keys.join(', ')}`);
    }
    
    if (keyCount === 0) {
      // Even if no keys, try to get memory info
      try {
        const info = await client.info('memory');
        const usedMemoryMatch = info.match(/used_memory:(\d+)/);
        const usedMemory = usedMemoryMatch ? parseInt(usedMemoryMatch[1]) : 0;
        const usedMemoryMB = usedMemory / (1024 * 1024);
        
        return NextResponse.json({ 
          success: true, 
          message: 'No keys to delete',
          deletedCount: 0,
          memoryBeforeMB: memoryBeforeMB,
          memoryAfterMB: usedMemoryMB,
          memoryFreedMB: memoryBeforeMB - usedMemoryMB
        });
      } catch (error) {
        return NextResponse.json({ 
          success: true, 
          message: 'No keys to delete',
          deletedCount: 0
        });
      }
    }
    
    console.log(`[CLEAR] Deleting ${keyCount} keys from Redis...`);
    
    // Use FLUSHDB to clear the entire database - this is more thorough than DEL
    // FLUSHDB removes all keys and helps Redis free memory more effectively
    await client.flushDb();
    console.log(`[CLEAR] Executed FLUSHDB to clear database and free memory`);
    
    // Wait a moment for Redis to process the deletion and memory cleanup
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Get memory info after deletion
    let memoryAfterMB = 0;
    let peakMemoryMB = 0;
    let remainingKeys = 0;
    try {
      const info = await client.info('memory');
      const usedMemoryMatch = info.match(/used_memory:(\d+)/);
      const usedMemory = usedMemoryMatch ? parseInt(usedMemoryMatch[1]) : 0;
      memoryAfterMB = usedMemory / (1024 * 1024);
      
      // Also get memory_peak to see peak usage
      const peakMemoryMatch = info.match(/used_memory_peak:(\d+)/);
      const peakMemory = peakMemoryMatch ? parseInt(peakMemoryMatch[1]) : 0;
      peakMemoryMB = peakMemory / (1024 * 1024);
      
      // Verify no keys remain
      const remainingKeysArray = await client.keys('*');
      remainingKeys = remainingKeysArray.length;
      
      console.log(`[CLEAR] Memory after deletion: ${memoryAfterMB.toFixed(2)} MB`);
      console.log(`[CLEAR] Peak memory: ${peakMemoryMB.toFixed(2)} MB`);
      console.log(`[CLEAR] Memory freed: ${(memoryBeforeMB - memoryAfterMB).toFixed(2)} MB`);
      console.log(`[CLEAR] Remaining keys after deletion: ${remainingKeys}`);
      
      // Note: Redis may still show some memory usage due to:
      // 1. Memory allocator overhead (Redis keeps memory for reuse)
      // 2. Memory fragmentation
      // 3. Internal Redis data structures
      // This is normal Redis behavior - memory is freed but may not be returned to OS immediately
      
      return NextResponse.json({ 
        success: true, 
        message: `Successfully deleted ${keyCount} keys`,
        deletedCount: keyCount,
        memoryBeforeMB: memoryBeforeMB,
        memoryAfterMB: memoryAfterMB,
        memoryFreedMB: memoryBeforeMB - memoryAfterMB,
        remainingKeys: remainingKeys,
        peakMemoryMB: peakMemoryMB,
        note: 'Redis may retain some memory due to allocator overhead and fragmentation. This is normal behavior.'
      });
    } catch (error) {
      return NextResponse.json({ 
        success: true, 
        message: `Successfully deleted ${keyCount} keys`,
        deletedCount: keyCount,
        memoryBeforeMB: memoryBeforeMB
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
