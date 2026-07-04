# AUTH LOGIN Phase - Kok Neden Analizi

## Gozlem (production)

```json
{
  "ok": false,
  "code": "LOGIN_TEMPORARILY_UNAVAILABLE",
  "step": "login_unavailable",
  "timings": { "total_ms": 6001 }
}
```

`total_ms: 6001` - 6 saniyelik route deadline tam sinirda tetikleniyor.

## Kok neden

Onceki `handleAuthLogin` tum login akisini tek `withRouteDeadline(6000ms)` icine aliyordu:

- `primeSqlConnection` (~1500ms)
- Rate limit (2x runSql)
- Credential lookup (repair/UPDATE, genis SELECT)
- `getSessionIdentityForLogin`
- `runSqlLoginRead` (ic ice retry)
- `createSessionOnce`
- `buildLoginSuccessBody`

DB yavasladiginda kimlik dogrulama bitmeden deadline doluyor; generic `step: login_unavailable` donuluyordu.

En olasi production darbogaz: **credential_lookup**.

## Bu hotfix

1. 6sn deadline yalnizca credential path (rate_limit + runSqlLoginRead).
2. session_create ve response_enrichment deadline disinda.
3. `findCustomerForLogin` minimal SELECT.
4. `runSqlLoginRead`: retries 0, timeout 2200ms.
5. `loginPhase.js` ile guvenli step + timings (phase, elapsed_ms, deadline_ms, requestId).

## Beklenen 503 (deploy sonrasi)

```json
{
  "ok": false,
  "code": "LOGIN_TEMPORARILY_UNAVAILABLE",
  "step": "credential_lookup",
  "requestId": "...",
  "timings": {
    "phase": "credential_lookup",
    "elapsed_ms": 6001,
    "deadline_ms": 6000,
    "total_ms": 6001
  }
}
```
