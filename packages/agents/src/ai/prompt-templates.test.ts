import { AgentType } from '@scholaracle/contracts';
import {
  buildPersonalizationSystemPrompt,
  buildPersonalizationUserPrompt,
  buildRecommendationPrompt,
  parsePersonalizationResponse,
} from './prompt-templates';

describe('buildPersonalizationSystemPrompt', () => {
  it('should include tone description for formal', () => {
    const prompt = buildPersonalizationSystemPrompt('formal', AgentType.STUDENT);
    expect(prompt).toContain('Professional and respectful');
    expect(prompt).toContain('student');
  });

  it('should include tone description for casual', () => {
    const prompt = buildPersonalizationSystemPrompt('casual', AgentType.PARENT);
    expect(prompt).toContain('Friendly and approachable');
    expect(prompt).toContain('parent');
  });

  it('should include tone description for encouraging', () => {
    const prompt = buildPersonalizationSystemPrompt('encouraging', AgentType.STUDENT);
    expect(prompt).toContain('Warm and supportive');
  });

  it('should include core rules', () => {
    const prompt = buildPersonalizationSystemPrompt('formal', AgentType.STUDENT);
    expect(prompt).toContain('Keep the core information intact');
    expect(prompt).toContain('concise');
  });
});

describe('buildPersonalizationUserPrompt', () => {
  it('should include alert type, tone, subject, and body', () => {
    const prompt = buildPersonalizationUserPrompt({
      alertType: 'deadline',
      agentType: AgentType.STUDENT,
      tone: 'casual',
      subject: 'Assignment Due Tomorrow',
      body: 'Math: HW3\nDue: Oct 15\nValue: 50 points',
    });

    expect(prompt).toContain('deadline');
    expect(prompt).toContain('casual');
    expect(prompt).toContain('Assignment Due Tomorrow');
    expect(prompt).toContain('Math: HW3');
  });

  it('should include additional context when provided', () => {
    const prompt = buildPersonalizationUserPrompt({
      alertType: 'grade_drop',
      agentType: AgentType.PARENT,
      tone: 'formal',
      subject: 'Grade Drop',
      body: 'Grade dropped 10%',
      context: { studentName: 'Alex', course: 'Biology' },
    });

    expect(prompt).toContain('Additional context');
    expect(prompt).toContain('Alex');
    expect(prompt).toContain('Biology');
  });

  it('should not include context section when context is empty', () => {
    const prompt = buildPersonalizationUserPrompt({
      alertType: 'positive',
      agentType: AgentType.STUDENT,
      tone: 'encouraging',
      subject: 'Great Job!',
      body: 'You did well.',
      context: {},
    });

    expect(prompt).not.toContain('Additional context');
  });
});

describe('buildRecommendationPrompt', () => {
  it('should include recommendation type and context', () => {
    const prompt = buildRecommendationPrompt(
      'study_habit',
      'Student has declining grades in Math over 3 weeks'
    );

    expect(prompt).toContain('study_habit');
    expect(prompt).toContain('declining grades in Math');
    expect(prompt).toContain('actionable');
  });
});

describe('parsePersonalizationResponse', () => {
  it('should parse valid response with subject and body', () => {
    const response = `Subject: Hey, HW3 is due soon!
Body:
Math class - HW3 is coming up tomorrow.
Worth 50 points, so don't forget!`;

    const result = parsePersonalizationResponse(response);
    expect(result).toBeDefined();
    expect(result?.subject).toBe('Hey, HW3 is due soon!');
    expect(result?.body).toContain('Math class');
    expect(result?.body).toContain('50 points');
  });

  it('should return undefined for malformed response', () => {
    const result = parsePersonalizationResponse('Just some random text');
    expect(result).toBeUndefined();
  });

  it('should return undefined when subject is missing', () => {
    const result = parsePersonalizationResponse('Body:\nSome content');
    expect(result).toBeUndefined();
  });

  it('should return undefined when body is missing', () => {
    const result = parsePersonalizationResponse('Subject: Hello');
    expect(result).toBeUndefined();
  });

  it('should trim whitespace from parsed values', () => {
    const response = `Subject:   Trimmed Subject
Body:
  Trimmed body content  `;

    const result = parsePersonalizationResponse(response);
    expect(result?.subject).toBe('Trimmed Subject');
    expect(result?.body).toBe('Trimmed body content');
  });
});
