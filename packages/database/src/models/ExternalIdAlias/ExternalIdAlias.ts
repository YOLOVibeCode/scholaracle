export type ExternalIdAliasKind = 'adapterId';

export interface IExternalIdAliasData {
  readonly alias: string;
  readonly canonicalAdapterId: string;
  readonly kind: ExternalIdAliasKind;
  readonly updatedAt: Date;
}
