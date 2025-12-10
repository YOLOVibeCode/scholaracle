# @scholaracle/agents

Notification agent implementations for Scholaracle.

## Installation

```bash
pnpm add @scholaracle/agents
```

## Dependencies

- `@scholaracle/interfaces` - Interface definitions
- `@scholaracle/contracts` - Data contracts

## Components

### Generators

- `StudentNotificationGenerator` - Generates student-facing notifications

### Templates

- `MissingAssignmentTemplate` - Missing assignment notifications
- `DeadlineTemplate` - Upcoming deadline notifications
- `GradeDropTemplate` - Grade drop notifications
- `TestTemplate` - Upcoming test notifications
- `WorkloadTemplate` - High workload notifications
- `PositiveTemplate` - Positive achievement notifications

## Usage

```typescript
import { StudentNotificationGenerator } from '@scholaracle/agents';
import { Alert, AlertType } from '@scholaracle/contracts';

const generator = new StudentNotificationGenerator();
const alert = new Alert({
  type: AlertType.MISSING_ASSIGNMENT,
  studentId: 'student-123',
  severity: 'high',
  relatedData: {
    course: 'Math',
    assignment: 'Homework 5',
    daysAgo: 2,
    points: 25,
  },
});

const notification = generator.generate(alert);
```

## Testing

```bash
pnpm test
pnpm test:coverage
```

## Standards

All code follows:
- [CODING_STANDARDS.md](../../CODING_STANDARDS.md)
- [TECHNOLOGY_BEST_PRACTICES.md](../../TECHNOLOGY_BEST_PRACTICES.md)

## License

MIT

