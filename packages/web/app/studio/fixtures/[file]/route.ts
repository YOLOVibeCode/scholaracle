import { NextRequest, NextResponse } from 'next/server';
import { studioFixturePdf } from '@/lib/studio/studioFixturePdf';

export async function GET(
  req: NextRequest,
  context: { readonly params: Promise<{ file: string }> }
): Promise<NextResponse> {
  const { file } = await context.params;
  const result = studioFixturePdf(file, req.headers.get('if-none-match'));
  if (result.status === 404) {
    return new NextResponse('Not found', { status: 404 });
  }
  if (result.status === 304) {
    return new NextResponse(null, { status: 304, headers: result.headers });
  }
  return new NextResponse(Buffer.from(result.body ?? []), {
    status: 200,
    headers: result.headers,
  });
}
