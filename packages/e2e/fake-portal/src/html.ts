export function htmlPage(body: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>Fake portal</title></head><body>${body}</body></html>`;
}

export interface ILoginFormOpts {
  readonly title: string;
  readonly action: string;
  readonly nextUrl: string;
}

export function loginForm(opts: ILoginFormOpts): string {
  return htmlPage(
    `<h1>${opts.title}</h1><form method="post" action="${opts.action}" data-testid="form-fake-login">` +
      `<input type="hidden" name="next" value="${opts.nextUrl}"/>` +
      `<label>Username <input name="username" type="text" data-testid="input-username"/></label><br/>` +
      `<label>Password <input name="password" type="password" data-testid="input-password"/></label><br/>` +
      `<button type="submit" data-testid="btn-submit">Sign in</button></form>`
  );
}
