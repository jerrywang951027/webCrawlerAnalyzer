import { NextRequest, NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { key } = body;

    if (!key) {
      return NextResponse.json(
        { error: 'Missing required field: key' },
        { status: 400 }
      );
    }

    const client = await getRedisClient();
    const data = await client.get(key);

    if (!data) {
      return NextResponse.json(
        { error: 'Key not found' },
        { status: 404 }
      );
    }

    const results = JSON.parse(data);
    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    console.error('Error loading from Redis:', error);
    return NextResponse.json(
      { error: `Failed to load from Redis: ${error.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}


