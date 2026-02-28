'use client';

import type { ComponentType } from 'react';
import { useCallback, useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  FileText,
  Link2,
  BookOpen,
  FileSpreadsheet,
  Presentation,
  Video,
  File,
  Download,
  Search,
  Lock,
  ExternalLink,
} from 'lucide-react';
import {
  studentsApi,
  type IStudentMaterialsResponse,
  type ICourseMaterial,
} from '@/lib/api/students';

const MATERIAL_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  document: FileText,
  link: Link2,
  syllabus: BookOpen,
  handout: FileSpreadsheet,
  presentation: Presentation,
  video: Video,
};

function formatFileSize(bytes?: number): string {
  if (bytes == null || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface StudentDocumentsTabProps {
  studentId: string;
}

export function StudentDocumentsTab({ studentId }: StudentDocumentsTabProps) {
  const [data, setData] = useState<IStudentMaterialsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const loadMaterials = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await studentsApi.getMaterials(studentId);
      if (res) {
        setData(res);
      } else {
        setError('Failed to load materials');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load materials');
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    void loadMaterials();
  }, [loadMaterials]);

  const allTypes = useMemo(() => {
    if (!data) return [];
    const types = new Set<string>();
    for (const course of data.courses) {
      for (const m of course.materials) {
        types.add(m.type);
      }
    }
    return Array.from(types).sort();
  }, [data]);

  const filteredCourses = useMemo(() => {
    if (!data) return [];
    const q = search.toLowerCase().trim();
    return data.courses
      .map((course) => {
        const filtered = course.materials.filter((m) => {
          if (typeFilter !== 'all' && m.type !== typeFilter) return false;
          if (q && !m.title.toLowerCase().includes(q) && !(m.fileName?.toLowerCase().includes(q)))
            return false;
          return true;
        });
        return { ...course, materials: filtered };
      })
      .filter((c) => c.materials.length > 0);
  }, [data, search, typeFilter]);

  const totalFiltered = useMemo(
    () => filteredCourses.reduce((sum, c) => sum + c.materials.length, 0),
    [filteredCourses],
  );

  if (loading) {
    return (
      <div
        className="text-muted-foreground py-8 text-center"
        data-testid="documents-tab-loading"
      >
        Loading materials…
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8 text-center" data-testid="documents-tab-error">
        <p className="text-red-600 dark:text-red-400">{error}</p>
        <Button variant="outline" className="mt-4" onClick={loadMaterials}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="documents-tab">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search materials…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="documents-search"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            data-testid="documents-type-filter"
          >
            <option value="all">All types</option>
            {allTypes.map((t) => (
              <option key={t} value={t}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>

          <span className="text-sm text-muted-foreground">
            {totalFiltered} {totalFiltered === 1 ? 'item' : 'items'}
          </span>
        </div>
      </div>

      {filteredCourses.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <File className="mx-auto h-10 w-10 text-muted-foreground/50" />
            <p className="mt-3 text-muted-foreground">
              {data && data.totalMaterials > 0
                ? 'No materials match your filters.'
                : 'No materials found for this student.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        filteredCourses.map((course) => (
          <Card key={course.courseExternalId}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{course.courseName}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 p-0">
              {course.materials.map((material) => (
                <MaterialRow key={material.externalId} material={material} />
              ))}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

function MaterialRow({ material }: { material: ICourseMaterial }) {
  const Icon = MATERIAL_ICONS[material.type] ?? File;
  const sizeLabel = formatFileSize(material.fileSize);

  return (
    <div
      className="flex items-center gap-3 border-t px-4 py-3 first:border-t-0"
      data-testid="material-item"
    >
      <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{material.title}</p>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {material.fileName && <span className="truncate">{material.fileName}</span>}
          {material.postedAt && (
            <span>{new Date(material.postedAt).toLocaleDateString()}</span>
          )}
          {sizeLabel && <span>{sizeLabel}</span>}
        </div>
      </div>

      <Badge variant="secondary" className="shrink-0 capitalize">
        {material.type}
      </Badge>

      {material.linkAccessibility === 'authenticated' && (
        <span
          className="shrink-0 text-muted-foreground"
          title="This link requires your school login"
        >
          <Lock className="h-4 w-4" aria-hidden />
        </span>
      )}

      {(material.downloadUrl ?? material.url) && (
        <Button
          variant="ghost"
          size="icon"
          asChild
          data-testid="material-download"
          title={material.downloadUrl ? 'Download' : 'Open link'}
        >
          <a
            href={material.downloadUrl ?? material.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {material.downloadUrl ? (
              <Download className="h-4 w-4" />
            ) : (
              <ExternalLink className="h-4 w-4" />
            )}
          </a>
        </Button>
      )}
    </div>
  );
}
