import { classifyResource } from './resourceClassifier';

// ---------------------------------------------------------------------------
// Native portal file URLs → rehost
// ---------------------------------------------------------------------------

describe('classifyResource — rehost cases', () => {
  it('Canvas /files/{id}/download URL with type document → rehost', () => {
    expect(
      classifyResource({
        url: 'https://canvas.instructure.com/courses/123/files/456/download',
        type: 'document',
      })
    ).toBe('rehost');
  });

  it('Canvas /files URL with ?download_frd=1 → rehost', () => {
    expect(
      classifyResource({
        url: 'https://myschool.instructure.com/files/789/download?download_frd=1',
        type: 'document',
      })
    ).toBe('rehost');
  });

  it('type: presentation without content-type probe → rehost', () => {
    expect(
      classifyResource({
        url: 'https://docs.google.com/presentation/d/abc/export/pdf',
        type: 'presentation',
      })
    ).toBe('rehost');
  });

  it('type: video → rehost', () => {
    expect(
      classifyResource({
        url: 'https://cdn.example.com/video.mp4',
        type: 'video',
      })
    ).toBe('rehost');
  });

  it('type: handout → rehost', () => {
    expect(classifyResource({ url: 'https://example.com/file.pdf', type: 'handout' })).toBe(
      'rehost'
    );
  });

  it('type: rubric → rehost', () => {
    expect(classifyResource({ url: 'https://example.com/rubric.docx', type: 'rubric' })).toBe(
      'rehost'
    );
  });

  it('type: study_guide → rehost', () => {
    expect(classifyResource({ url: 'https://example.com/guide.pdf', type: 'study_guide' })).toBe(
      'rehost'
    );
  });

  // Step 2: link URL whose Content-Type reveals it is a binary file
  it('type: link but content-type application/pdf → rehost', () => {
    expect(
      classifyResource({
        url: 'https://example.com/some-resource',
        contentType: 'application/pdf',
        type: 'link',
      })
    ).toBe('rehost');
  });

  it('type: link but content-type image/png → rehost', () => {
    expect(
      classifyResource({
        url: 'https://example.com/diagram.png',
        contentType: 'image/png',
        type: 'link',
      })
    ).toBe('rehost');
  });

  it('type: link but content-type video/mp4 → rehost', () => {
    expect(
      classifyResource({
        url: 'https://cdn.school.com/lecture.mp4',
        contentType: 'video/mp4',
        type: 'link',
      })
    ).toBe('rehost');
  });

  it('content-type with charset suffix still detects binary', () => {
    expect(
      classifyResource({
        url: 'https://example.com/file',
        contentType: 'application/pdf; charset=utf-8',
        type: 'link',
      })
    ).toBe('rehost');
  });

  it('type: document without content-type → rehost (trust the type field)', () => {
    expect(classifyResource({ url: 'https://example.com/doc', type: 'document' })).toBe('rehost');
  });
});

// ---------------------------------------------------------------------------
// Public / session HTML pages → extractText
// ---------------------------------------------------------------------------

describe('classifyResource — extractText cases', () => {
  it('type: link with no content-type, non-portal public URL → extractText', () => {
    expect(
      classifyResource({
        url: 'https://example.com/page',
        type: 'link',
      })
    ).toBe('extractText');
  });

  it('type: link with content-type text/html on a static host → extractText', () => {
    expect(
      classifyResource({
        url: 'https://www.sparknotes.com/lit/mocking/',
        contentType: 'text/html; charset=utf-8',
        type: 'link',
      })
    ).toBe('extractText');
  });

  it('type: link with content-type text/plain → extractText', () => {
    expect(
      classifyResource({
        url: 'https://example.com/notes.txt',
        contentType: 'text/plain',
        type: 'link',
      })
    ).toBe('extractText');
  });

  it('type: other with no content-type → extractText', () => {
    expect(classifyResource({ url: 'https://example.com/something', type: 'other' })).toBe(
      'extractText'
    );
  });
});

// ---------------------------------------------------------------------------
// Authenticated portal pages with no export → leaveLink
// ---------------------------------------------------------------------------

describe('classifyResource — leaveLink cases', () => {
  it('Canvas course root URL with type: link → leaveLink', () => {
    expect(
      classifyResource({
        url: 'https://myschool.instructure.com/courses/123',
        type: 'link',
      })
    ).toBe('leaveLink');
  });

  it('Instructure viewer URL → leaveLink', () => {
    expect(
      classifyResource({
        url: 'https://myschool.instructure.com/courses/1/assignments/2',
        type: 'link',
      })
    ).toBe('leaveLink');
  });

  it('Skyward portal URL → leaveLink', () => {
    expect(
      classifyResource({
        url: 'https://skyward.iscorp.com/students/grades',
        type: 'link',
      })
    ).toBe('leaveLink');
  });

  it('Aeries portal URL → leaveLink', () => {
    expect(
      classifyResource({
        url: 'https://portal.aeries.com/student/scores',
        type: 'link',
      })
    ).toBe('leaveLink');
  });

  it('content-type text/html on a known portal host → leaveLink', () => {
    expect(
      classifyResource({
        url: 'https://canvas.instructure.com/courses/1/pages/chapter-5',
        contentType: 'text/html',
        type: 'link',
      })
    ).toBe('leaveLink');
  });

  it('missing url → leaveLink (cannot act on it)', () => {
    expect(classifyResource({ url: '', type: 'link' })).toBe('leaveLink');
  });
});

describe('classifyResource — interactive hosts → leaveLink', () => {
  it('Khan Academy HTML is not extracted', () => {
    expect(
      classifyResource({
        url: 'https://www.khanacademy.org/science/ap-biology/cell-communication-and-cell-cycle',
        contentType: 'text/html',
        type: 'link',
      })
    ).toBe('leaveLink');
  });

  it('YouTube type: video is not rehosted', () => {
    expect(
      classifyResource({
        url: 'https://www.youtube.com/watch?v=abc',
        type: 'video',
      })
    ).toBe('leaveLink');
  });

  it('Desmos calculator is not extracted', () => {
    expect(
      classifyResource({
        url: 'https://www.desmos.com/calculator',
        type: 'link',
      })
    ).toBe('leaveLink');
  });
});
