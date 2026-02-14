'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function CoursesPage() {
  return (
    <div className="space-y-4" data-testid="courses-page">
      <h1 className="text-3xl font-bold tracking-tight">Courses</h1>
      <p className="text-muted-foreground">
        Course details and assignments are available per student. View grades and assignments by student below.
      </p>
      <Button asChild variant="outline">
        <Link href="/dashboard/students">View students & grades</Link>
      </Button>
    </div>
  );
}


