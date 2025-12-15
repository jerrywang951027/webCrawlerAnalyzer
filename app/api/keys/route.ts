import { NextRequest, NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';

export async function GET(request: NextRequest) {
  try {
    const client = await getRedisClient();
    const keys = await client.keys('*');
    
    return NextResponse.json({ keys: keys.sort() });
  } catch (error: any) {
    console.error('Error fetching Redis keys:', error);
    return NextResponse.json(
      { error: `Failed to fetch keys: ${error.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}


