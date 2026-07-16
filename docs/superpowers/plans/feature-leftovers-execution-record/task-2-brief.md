## Task 2: Fix `webpack-cli` `--node-env` flag in the remaining microservices

`apps/api/project.json` was already fixed (commit `d37b52b`) to use `env: { NODE_ENV }` instead of `args: ["--node-env=..."]`, because webpack-cli v7 removed the `--node-env` flag. Task 1's `nx migrate` already bumped `webpack-cli` to `7.2.1` as a transitive dependency change (confirmed: `package.json` now pins `7.2.1`, no further version bump needed here). That migration surfaced the live bug: `yarn nx run-many -t build` now fails identically for **5** microservices, not the 3 originally assumed — `apps/microservices/{auth,notes,payment,jobs,upload}/project.json` all still use the old `args: ["--node-env=..."]` form (confirmed via `grep -rn "node-env" apps/microservices/*/project.json`). Align all 5 with the `env`-based pattern `apps/api/project.json` already uses.

**Files:**
- Modify: `apps/microservices/auth/project.json`
- Modify: `apps/microservices/notes/project.json`
- Modify: `apps/microservices/payment/project.json`
- Modify: `apps/microservices/jobs/project.json`
- Modify: `apps/microservices/upload/project.json`

**Interfaces:** None.

- [ ] **Step 1: Confirm the current break (webpack-cli is already 7.2.1 post-Task-1)**

```bash
yarn nx build auth
```
Expected: FAIL — webpack-cli 7 rejects `--node-env`. Record the exact error text here before moving on (Task 1 saw: `Error: Unknown option '--node-env=production'`).

- [ ] **Step 2: Fix `apps/microservices/auth/project.json`**

Change:
```json
        "command": "webpack-cli build",
        "args": ["--node-env=production"],
        "cwd": "apps/microservices/auth"
      },
      "configurations": {
        "development": {
          "args": ["--node-env=development"]
        }
      }
```
to:
```json
        "command": "webpack-cli build",
        "env": { "NODE_ENV": "production" },
        "cwd": "apps/microservices/auth"
      },
      "configurations": {
        "development": {
          "env": { "NODE_ENV": "development" }
        }
      }
```

- [ ] **Step 3: Verify auth build passes**

```bash
yarn nx build auth
```
Expected: PASS, `webpack compiled successfully`.

- [ ] **Step 4: Repeat Step 2's edit for `apps/microservices/notes/project.json`** (identical `args`→`env` pattern, same two spots — top-level `build.options` and `configurations.development`)

- [ ] **Step 5: Verify**
```bash
yarn nx build notes
```
Expected: PASS.

- [ ] **Step 6: Repeat Step 2's edit for `apps/microservices/payment/project.json`**

- [ ] **Step 7: Verify**
```bash
yarn nx build payment
```
Expected: PASS.

- [ ] **Step 8: Repeat Step 2's edit for `apps/microservices/jobs/project.json`**

- [ ] **Step 9: Verify**
```bash
yarn nx build jobs
```
Expected: PASS.

- [ ] **Step 10: Repeat Step 2's edit for `apps/microservices/upload/project.json`**

- [ ] **Step 11: Verify**
```bash
yarn nx build upload
```
Expected: PASS.

- [ ] **Step 12: Full sanity pass**
```bash
npx prettier --write apps/microservices/auth/project.json apps/microservices/notes/project.json apps/microservices/payment/project.json apps/microservices/jobs/project.json apps/microservices/upload/project.json
yarn nx run-many -t build
```
Expected: all green.

- [ ] **Step 13: Commit**
```bash
git add apps/microservices/auth/project.json apps/microservices/notes/project.json apps/microservices/payment/project.json apps/microservices/jobs/project.json apps/microservices/upload/project.json
git commit -m "fix(scaffold): webpack-cli 7 --node-env removal, align auth/notes/payment/jobs/upload with apps/api"
```

---

