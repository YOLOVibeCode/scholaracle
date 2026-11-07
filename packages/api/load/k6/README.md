# k6 load smoke (on demand)

Requires [k6](https://k6.io/docs/get-started/installation/) on the runner.

1. Start API on port 2801 (seed data recommended).
2. Export a parent JWT:

```bash
source ./scripts/k6-get-token.sh
```

3. Run smoke:

```bash
k6 run packages/api/load/k6/smoke.js
```

Optional: `API_BASE_URL=http://127.0.0.1:2801 k6 run ...`

Not wired as a blocking PR gate; use `workflow_dispatch` or local runs.
