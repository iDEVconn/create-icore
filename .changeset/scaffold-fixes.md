---
'@idevconn/create-icore': patch
---

Fix webpack-cli --node-env flag (removed in v7), use env object instead; fix husky hooks to use npx for PM-agnostic execution; fix lint-staged --config package.json to avoid picking up node_modules linter configs
