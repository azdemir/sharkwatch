import { NextResponse } from 'next/server';
import { alertHub } from '@/components/demo/server/alerts/hub';
export const dynamic = 'force-dynamic';
export async function GET() { return NextResponse.json(alertHub.list()); }
