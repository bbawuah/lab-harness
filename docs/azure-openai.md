# Azure OpenAI in the landing zone

LAB uses Pi 1.4.0's native `azure` provider for OpenAI models and the Responses
API. Saving a route and opening the workspace send no model request. Typing a
prompt sends project context to the configured endpoint and can consume quota.

## Ask the landing-zone owner

Get these answers before attaching a credential:

- What exact HTTPS API base URL should clients use? Is it the Azure resource
  root, or an APIM gateway with a path such as `/team/openai/v1`?
- Does that endpoint expose the Responses API? Which API version does it accept
  (`v1` by default)? LAB appends `/responses`; do not include it in a gateway URL.
- What is the exact deployment name, and which underlying OpenAI model/version
  does it serve? The deployment name and Pi capability model ID can differ.
- Is authentication Azure `api-key`, a custom gateway header, or an Entra bearer
  token? For a gateway, what is the exact header name? Does it require additional
  headers or both a subscription key and a bearer token?
- For Entra, which tenant, identity, token audience/scope and role are approved?
  Which installed command prints only the access token, without opening a login
  flow? Sign in with the approved identity tool before starting LAB.
- Which proxy URL, bypass hosts and corporate CA PEM bundle must WSL use? Does
  deployment access depend on private DNS, a network allowlist or RBAC?

The first version supports one key header OR one bearer token. A gateway requiring
both needs an owner-approved gateway policy or a follow-up LAB change.

## Interactive setup

Run `lab --configure`, choose `azure`, and enter the endpoint, exact Pi model ID,
deployment, API version and authentication mode. For example, a deployment named
`team-code` can use the capability model `gpt-5.4`.

Choose one authentication mode:

- `api-key`: enter the Azure resource key at the hidden prompt.
- `custom-header`: enter the header name, for example
  `Ocp-Apim-Subscription-Key`, then enter its value at the hidden prompt.
- `bearer-command`: enter a trusted command at the hidden prompt. Its stdout must
  contain only a token. For example, an already authenticated Azure CLI can use
  `az account get-access-token --resource https://cognitiveservices.azure.com/ --query accessToken -o tsv`
  if that audience is approved by the owner. See Microsoft's [Responses authentication reference](https://learn.microsoft.com/en-us/rest/api/aifoundry/azureopenai/responses)
  for the documented scope. The command must not contain inline
  passwords, client secrets or tokens. Prefer an absolute executable path.

The key or command lives only in the guarded private `key` file (0600), outside
installed code and the project. The command is fed to `/bin/sh` over stdin, never
as an argument. LAB discards command stderr, bounds output and stops after 30
seconds. The resulting bearer token is held in Pi's launch environment, not saved
in generated configuration. It is resolved once per launch; restart LAB after
expiry. LAB does not install Azure CLI, sign in, or refresh tokens automatically.

Pi's Azure SDK normally adds `api-key`. LAB's explicit Azure extension omits that
header for custom-header and bearer modes. It sends only the chosen credential
header. Generated `models.json` contains environment references, never key bytes.
Do not enable HTTP debug tracing or copy a process environment into a report.

## Scripted setup without a terminal

Create a non-secret route file with mode 0600, and obtain a separate 0600 key
file from your approved secret-delivery mechanism. Both must be user-owned,
regular files without symlinks or hardlinks. Do not put the real key in a shell
command, here-document, environment assignment or source checkout.

Example route file (fictional endpoint):

```json
{
  "version": 2,
  "kind": "azure",
  "endpoint": "https://gateway.example.invalid/team/openai/v1",
  "deployment": "team-code",
  "model": "gpt-5.4",
  "apiVersion": "v1",
  "auth": { "mode": "custom-header", "header": "Ocp-Apim-Subscription-Key" }
}
```

Then run:

```sh
LAB_ROUTE_CONFIG_FILE="$HOME/private/azure-route.json" \
LAB_ROUTE_KEY_FILE="$HOME/private/azure-credential" lab --configure
```

This path saves and exits without starting a workspace, requiring a TTY, or
sending a model request. Omitting `LAB_ROUTE_KEY_FILE` uses hidden terminal input.
For bearer mode, set `auth.mode` to `bearer-command` and put the trusted token
command in the private credential file. A final newline in that file is accepted.
Run `lab` separately to start a fresh workspace.

## Model capacities and old route files

For catalog models, LAB changes the `azure` provider's endpoint and authentication
without replacing any models. Pi retains its bundled context window, output cap,
reasoning and image input. LAB checks exact catalog membership offline before
saving or launching, so an unknown ID cannot silently select a fuzzy match.
Pi 1.4.0 lists `azure/gpt-5.4` as approximately 1.1M context, 128K output, reasoning
and image input. These are catalog capabilities, not a statement of your gateway's
quota or the deployed model version.

For an unknown model, supply explicit capabilities interactively or in the route:

```json
"capabilities": {
  "contextWindow": 128000,
  "maxTokens": 16384,
  "reasoning": true,
  "input": ["text", "image"]
}
```

Only assert features supported by the deployment. Unknown OpenAI models still use
`azure-openai-responses`; Foundry non-OpenAI Chat Completions deployments are
outside this route's scope.

Existing version-1 local and LiteLLM route files remain readable without rewriting
the saved file or key. They migrate in memory to version 2 with Pi's documented
custom-model defaults: 128000 context and 16384 output, text input and reasoning
off. These defaults are operational assumptions, not detected server capacities.
Reconfigure smaller servers with their real limits. Local/LiteLLM setup now asks
for capacities, reasoning and image support. The minimum context is 4096 and the
output cap must be smaller than context. LAB also scales Pi's compaction reserve
and retained context for small configured windows.

## Proxy, CA and automatic network activity

LAB explicitly passes `HTTPS_PROXY`, `HTTP_PROXY`, `NO_PROXY` and
`NODE_EXTRA_CA_CERTS` from the launch environment to Pi. Lowercase proxy/bypass
variants are passed too. For example, set the proxy URL and a WSL-readable PEM
bundle in the environment before starting `lab`. Include private model hosts in
`NO_PROXY` if the landing zone requires direct routing. Proxy credentials are
sensitive; do not put them in command history or shared diagnostics.

Pi also documents agent-directory `settings.json` `httpProxy`, which sets both
proxy variables for Pi-managed HTTP clients. LAB uses environment pass-through
instead, so a proxy URL never needs to be written to generated settings.
`NODE_EXTRA_CA_CERTS` extends trust; do not disable TLS verification. Certificate
trust and proxy behavior must be qualified with the organisation's real WSL
network and corporate CA.

Every launch sets `PI_OFFLINE=1`, `PI_SKIP_VERSION_CHECK=1`, `PI_TELEMETRY=0`, passes
`--offline`, and disables install telemetry and analytics in settings. In pinned
Pi this suppresses automatic model catalog refreshes, pi.dev latest-version
checks and package update activity. The bundled catalog remains usable, and
explicit model requests still reach the configured endpoint. LAB also starts
with no external packages or automatically loaded integrations. These controls
do not make model prompts local or prohibit an explicit operator-triggered network
action. They are not an OS network firewall.

## Troubleshooting

- **401**: check auth mode and credential, exact custom header name, or the Entra
  token's audience and expiry. Reconfigure or restart after refreshing identity.
- **403**: ask the owner to check RBAC, APIM policy, network allowlists and access
  to the deployment. A valid token does not imply deployment access.
- **404**: check API base path, deployment name, Responses support and API version.
  A custom gateway's root is preserved, unlike Azure resource roots which Pi
  normalizes to `/openai/v1`.
- **429**: wait before retrying and check deployment quota/capacity and APIM limits.
  Pi can retry transient failures; quota errors need an owner decision.
- **Connection or TLS failure**: check DNS, WSL reachability, proxy/bypass settings
  and the corporate CA file. Send setting names and sanitized status to the owner,
  never keys, tokens, command output, or whole environments.
- **Model absent from catalog**: verify the underlying model ID or enter explicit
  capacities. LAB refuses fuzzy model fallback for an Azure route.

## Local evidence and remaining qualification

`LAB_AZURE_ACTUAL=1 bun --no-env-file test tests/azure*.test.ts` uses the pinned Pi
binary and a `Bun.serve` loopback fixture. It checks Responses paths, deployment
mapping, API version, all authentication modes and streamed output. It also
executes one harmless read-tool round trip, checks 401/403/404/429 repair messages,
and observes zero connections to a recording HTTP proxy while loopback model
requests succeed with NO_PROXY. No Azure
account or paid model is used. Unit tests cover migration, private files and
proxy/CA allowlisting. These results establish local protocol behavior; they do
not establish real landing-zone access, corporate CA trust, deployment quality,
quota, or Entra identity policy. Run the owner's airgap qualification before
calling the deployment ready.
