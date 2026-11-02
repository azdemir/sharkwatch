import { NextResponse } from 'next/server';
import { listRecordings } from '@/components/demo/server/sessions';
export const dynamic = 'force-dynamic';
export async function GET() { return NextResponse.json(listRecordings()); }
