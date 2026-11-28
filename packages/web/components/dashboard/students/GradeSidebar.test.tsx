/**
 * The course list of the grades page. Beside the grades on a wide screen (lg and up). Below that
 * a column 128 px wide left the grades 170 px on a phone and 280 px on an upright tablet, so
 * there it is a strip above them that scrolls sideways.
 * @jest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import { GradeSidebar } from './GradeSidebar';
import type { ICourseGrade } from '@/lib/api/students';

function course(id: string, name: string): ICourseGrade {
  return {
    courseExternalId: id,
    courseName: name,
    grade: 91,
    letterGrade: 'A',
    riskLevel: 'low',
    assignments: [],
  } as unknown as ICourseGrade;
}

const COURSES = [course('c-1', 'AP Biology'), course('c-2', 'Algebra II')];

const classesOf = (element: HTMLElement): string[] => element.className.split(/\s+/);

describe('GradeSidebar', () => {
  it('is a strip that scrolls sideways below lg and a column from lg up', () => {
    render(<GradeSidebar courseGrades={COURSES} selectedCourseId="c-1" onSelectCourse={jest.fn()} />);

    const list = classesOf(screen.getByTestId('grade-sidebar'));
    expect(list).toEqual(expect.arrayContaining(['flex', 'overflow-x-auto', 'lg:flex-col']));
    // Not a column on a phone or an upright tablet.
    expect(list).not.toContain('flex-col');
    expect(list).not.toContain('md:flex-col');
  });

  it('keeps each course at a readable width in the strip and full width in the column', () => {
    render(<GradeSidebar courseGrades={COURSES} selectedCourseId="c-1" onSelectCourse={jest.fn()} />);

    for (const id of ['c-1', 'c-2']) {
      const item = classesOf(screen.getByTestId(`grade-sidebar-course-${id}`));
      expect(item).toEqual(expect.arrayContaining(['w-28', 'shrink-0', 'lg:w-full', 'lg:shrink']));
      expect(item).not.toContain('w-full');
    }
  });

  it('gives a course that cannot be selected the same widths', () => {
    render(<GradeSidebar courseGrades={COURSES} />);

    const item = classesOf(screen.getByTestId('grade-sidebar-course-c-2'));
    expect(item).toEqual(expect.arrayContaining(['w-28', 'shrink-0', 'lg:w-full', 'lg:shrink']));
  });

  it('still marks the selected course and calls back with its id', () => {
    const onSelect = jest.fn();
    render(<GradeSidebar courseGrades={COURSES} selectedCourseId="c-1" onSelectCourse={onSelect} />);

    expect(screen.getByTestId('grade-sidebar-course-c-1').getAttribute('data-selected')).toBe('true');
    expect(screen.getByTestId('grade-sidebar-course-c-2').getAttribute('data-selected')).toBeNull();
    screen.getByTestId('grade-sidebar-course-c-2').click();
    expect(onSelect).toHaveBeenCalledWith('c-2');
  });
});
