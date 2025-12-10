# @scholaracle/interfaces

Interface definitions for Scholaracle notification system (ISP - Interface Segregation Principle).

## Installation

```bash
pnpm add @scholaracle/interfaces
```

## Dependencies

- `@scholaracle/contracts` - Data contracts and models

## Interfaces

### Agents

- `INotificationGenerator` - Generates notifications from alerts
- `INotificationDelivery` - Delivers notifications through channels
- `INotificationScheduler` - Schedules notifications for delivery
- `INotificationTracker` - Tracks notification engagement
- `INotificationAnalyzer` - Analyzes alerts for notification strategy

## Usage

```typescript
import { INotificationGenerator } from '@scholaracle/interfaces';
import { Alert } from '@scholaracle/contracts';

class MyGenerator implements INotificationGenerator {
  generate(alert: Alert): Notification {
    // Implementation
  }
}
```

## Standards

All interfaces follow:
- [CODING_STANDARDS.md](../../CODING_STANDARDS.md)
- [TECHNOLOGY_BEST_PRACTICES.md](../../TECHNOLOGY_BEST_PRACTICES.md)

## License

MIT

