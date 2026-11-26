/**
 * The encoder inside the `qrcode` package, without its canvas and file renderers.
 * Only what lib/qr/qrPicture.ts uses is declared.
 */
declare module 'qrcode/lib/core/qrcode' {
  export interface IQrModules {
    /** Squares along one side of the code. */
    readonly size: number;
    /** Truthy when the square at this row and column is dark. */
    get(row: number, col: number): number | boolean;
  }

  export interface IQrSymbol {
    readonly modules: IQrModules;
  }

  export function create(
    data: string,
    options?: { readonly errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H' }
  ): IQrSymbol;
}
