'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { GraduationCap } from 'lucide-react';

export default function StudentViewCoursesPage() {
  const params = useParams();
  const studentId = params.id as string;

  return (
    <div className="space-y-4" data-testid="student-view-courses-page">
      <h1 className="text-3xl font-bold tracking-tight">Courses</h1>
      <p className="text-muted-foreground">
        Your course grades and assignments are available in the grades view.
      </p>
      <Button asChild variant="outline">
        <Link href={`/dashboard/students/${studentId}/grades`} className="inline-flex items-center gap-2">
          <GraduationCap className="h-4 w-4" />
          View grades
        </Link>
      </Button>
    </div>
  );
}
