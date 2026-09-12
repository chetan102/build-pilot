import { NextResponse } from 'next/server';

export async function GET() {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  return NextResponse.redirect(`${apiBaseUrl}/api/v1/github/oauth/authorize?redirect=true`);
}
