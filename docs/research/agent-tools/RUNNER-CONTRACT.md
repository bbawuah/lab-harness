# Prepared model runner contract

2026-10-31. Follow-up authorized after the initial research/trial checkpoint. Same owned experiments/docs scope; no production changes, credential lookup or inference during preparation.

Prepare actual verified pinned Pi 1.4.0 + LAB workspace extension + owned Herdr + explicit fixture tool adapter. Use a fresh synthetic project/page and private run state, explicit configuration, no ambient shell/file tools, MCP, skills or context. Initial fixed route is `https://ollama.com/v1`, model `gemma4:31b`, using only an environment-injected key after root's credential-ready handoff. This route/model is root-coordinated, not a model-quality recommendation.

Bound the scenario to at most 12 requests, 20k input/4k output tokens as planned. Use native pre-request hooks if supported, request/output/time caps and recorded provider usage; label estimators explicitly without exact-tokenizer claims. If hooks cannot enforce the necessary bounds, propose an instrumentation change before implementing any local measurement proxy. No new production provider/gateway.

Observable acceptance: actual Pi event/tool call, owned browser fixture change, independent result assertion and final model response. Retain synthetic bounded events/results, strip credentials from browser subprocesses, always close the exact browser/listener/Herdr and verify cleanup, including failure paths. Prepared checks are not live acceptance. A fresh isolated review covers runner code plus the prior cleanup findings/responses. Public LAB launcher availability remains unchanged; model status stays PENDING KEY until an authorized successful run.
