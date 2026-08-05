# Parent Square scraper

Community / sideload scraper scaffold for Scholaracle Helper.

## Entities

- `course`
- `assignment`
- `message`
- `studentProfile`

## Workflow

1. Edit `index.ts` `scrape()` — use `host.driver` (`goto` / `evaluate` / `wait`).
2. Adjust `transform.ts` if your raw JSON shape differs.
3. Update `fixtures/sample.json` with a realistic extract.
4. Run harness:

```bash
cd packages/scraper-core
pnpm test -- parent-square
```

5. When green, sideload in Helper or register with `CompositeScraperResolver`.

See repo `docs/DATA_EXTRACTION_CHECKLIST.md` for every field to chase on the portal.
