# Contract: OpenRouter provider

`OpenRouterProvider implements ModelProvider` (`key = "openrouter"`), in
`apps/api/src/modules/ai/gateway/providers/openrouter.provider.ts`. Research G10–G14.

## Construction

`new OpenRouterProvider({ apiKey, baseUrl, fetch? })`. Registered by
`productionAiDefinitions(config)` only when `OPENROUTER_API_KEY` is set. `baseUrl` defaults to
`https://openrouter.ai/api/v1` (the only place this host appears). `fetch` is injectable for
unit tests.

## `POST {baseUrl}/chat/completions`

Headers: `Authorization: Bearer <apiKey>`, `Content-Type: application/json`,
`X-Title: DevTrack`.

```jsonc
{
  "model": "<config.model>",
  "messages": [
    { "role": "system", "content": "<system instructions>" },
    { "role": "user", "content": [
      { "type": "text", "text": "<context JSON>" },
      { "type": "text", "text": "<untrusted block 1, already delimited by the 006 envelope>" }
    ] },
    { "role": "assistant", "content": null, "tool_calls": [
      { "id": "call_1", "type": "function", "function": { "name": "<toolKey>", "arguments": "<JSON>" } }
    ] },
    { "role": "tool", "tool_call_id": "call_1", "content": "<tool result text>" }
  ],
  "max_tokens": 16000,
  "temperature": 0.2,               // only allowlisted task parameters
  "reasoning": { "effort": "low" }, // from parameters.effort
  "tools": [{ "type": "function", "function": { "name": "…", "description": "…", "parameters": { }, "strict": true } }],
  "tool_choice": "auto",            // only when tools are present
  "response_format": { "type": "json_schema", "json_schema": { "name": "output", "strict": true, "schema": { } } }, // generateStructured only
  "provider": { "data_collection": "deny", "zdr": true, "require_parameters": true },
  "usage": { "include": true },
  "stream": false
}
```

Never sent: `models`, `route`, `transforms`, `user`, any teacher identifier.

## Response → `ModelResponse`

| Field | Mapping |
|-------|---------|
| `choices[0].finish_reason = "tool_calls"` | `{ kind: "tool_calls", calls: [{ toolKey: name, arguments: JSON.parse(arguments) or undefined }] }` |
| `"stop"` | `{ kind: "output", text: message.content ?? "" }` |
| `"length"`, `"content_filter"`, `"error"`, missing | `{ kind: "output", text: "" }` (validator fails it) |
| `usage.prompt_tokens / completion_tokens / total_tokens` | `ModelUsage` (null when absent) |
| `usage.cost` | `ModelUsage.cost = { amount, currency: "USD" }` |
| `model` | `servedModel`; must start with the requested model id, else `ProviderError("UNKNOWN")` |

## Errors → `ProviderError(category)`

| Condition | Category |
|-----------|----------|
| 400, 404, 413, 422; 403 with moderation metadata | `INVALID_REQUEST` |
| 401, 402, other 403 | `AUTH` |
| 408 | `TIMEOUT` |
| 429 | `RATE_LIMITED` |
| 500, 502, 503, 504, 529; network error | `UNAVAILABLE` |
| 200 whose body has `error` | same table by `error.code` |
| unparseable body, anything else | `UNKNOWN` |

The error never carries the body, the message, the request or the key.

## `healthCheck`

`GET {baseUrl}/key` with the same headers: 200 → `UP`; else → `DOWN`.
