# @scholaracle/contracts

Data contracts, models, enums, and errors for Scholaracle.

## Installation

```bash
pnpm add @scholaracle/contracts
```

## Components

### Models

- `Notification` - Notification ready for delivery
- `Alert` - Alert that triggers a notification
- `DeliveryResult` - Result of notification delivery

### Enums

- `NotificationPriority` - Priority levels (CRITICAL, HIGH, MEDIUM, LOW)
- `NotificationChannel` - Delivery channels (EMAIL, PUSH, SMS, IN_APP)
- `AgentType` - Agent types (STUDENT, PARENT)
- `AlertType` - Alert types (MISSING_ASSIGNMENT, DEADLINE, etc.)

### Errors

- `NotificationError` - Base error for notifications
- `DeliveryError` - Error for delivery failures

## Usage

```typescript
import { Notification, NotificationPriority, AgentType } from '@scholaracle/contracts';

const notification = new Notification({
  agentType: AgentType.STUDENT,
  studentId: 'student-123',
  userId: 'user-456',
  subject: 'Missing Assignment',
  body: 'You have a missing assignment in Math',
  priority: NotificationPriority.HIGH,
  triggerType: 'missing_assignment'
});
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

