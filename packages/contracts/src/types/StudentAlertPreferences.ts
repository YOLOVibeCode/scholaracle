/** Per-student alert preference overrides. */
export interface IStudentAlertPreferences {
  readonly useCustomSettings: boolean;
  readonly gradeDrop?: number;
  readonly lowGradeThreshold?: number;
  readonly frequency?: 'minimal' | 'balanced' | 'proactive';
}
