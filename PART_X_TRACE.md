# Part X — Project Arms: End-to-End Flow Traces

This document traces the major Part X flows through the stack, file-by-file, so a
future session can follow any path from UI to DB without re-reading everything.

**Naming:** tables are `p10_`-prefixed in SQLite; Drizzle exports drop the prefix
(`arms` = `p10_arms`, `armDocuments` = `p10_arm_documents`, etc.).

---

## 0. Boot — migrations + seed

`server/storage.ts` runs at module load:

1. **ALTER** `agents` add `scope` (default `'global'`) + `display_name` (try/catch — ignore "column exists").
2. **CREATE TABLE IF NOT EXISTS** for all 7 `p10_` tables + indexes (incl. unique
   `idx_p10_arms_project_slug` on `(project_id, slug)`).
3. **Seed** (idempotent — checks existence before insert):
   - 4 arm agents: `arm-shira` (Shira), `arm-maya` (Maya), `arm-eitan` (Eitan),
     `arm-noa` (Noa). `provider='groq'`, `model='groq/llama-3.3-70b-versatile'`,
     `scope='arm'`, capabilities `["chat_reply","doc_assist","target_instructions"]`.
   - For each of 11 projects, 4 arms (`providers`/`marketing`/`legal`/`finance`)
     with `owner_user_id=NULL`, `visibility='owner_private'`, plus an empty living
     document shell. **44 arms total.**

**Verified:** first boot → `44 arms created across 11 projects`; second boot →
`0 arms created` (no-op). Idempotent.

---

## 1. List arms in a project

```
UI: project-detail.tsx → <ProjectArmsTab projectId>
  → GET /api/projects/:projectId/arms   (authFetch, Bearer token)
routes.ts: app.get("/api/projects/:projectId/arms")
  → membership check (isUserInProject || admin)
  → storage.listArms(projectId, userId, isAdmin)   [visibility-filtered]
  → enrich each with agentDisplayName / agentSlug (getP9Agent)
  ← Arm[] with manager display names
UI: cards (manager, owner, visibility, active) + Link to /projects/:id/arms/:slug
```

Visibility: `listArms` filters per `canViewArm` — admins all, `project_public`
to any member, `owner_private` to owner + admins.

---

## 2. Arm chat — tier-1 (Groq, 1 credit) and deep-work (Claude, 5 credits)

```
UI: arm-detail.tsx → ChatTab
  resolve arm: GET /api/projects/:projectId/arms → find by slug → armId
  GET /api/arms/:armId/messages   (history)
  POST /api/arms/:armId/messages { content, deepWork, lang }
routes.ts: app.post("/api/arms/:armId/messages")
  → loadArmForRead (visibility enforced)
  → storage.createArmMessage(role='user')
  → cost = deepWork ? 5 : 1
  → storage.debitCredits({...})           [credit_ledger; 402 if insufficient → queued]
  → buildArmSystemPrompt(arm, lang)        [agent.systemPrompt + living-doc context]
  → history = last 20 messages
  → deepWork ? callProvider('anthropic','claude-sonnet-4-5', msgs)
             : callGroqArm(msgs)           [Groq free pool, auth_profiles round-robin — NOT Base44]
  → storage.createArmMessage(role='assistant', agentId)
  → storage.logArmActivity(action='chat_reply', creditsCost=cost)
  ← { reply, creditsCharged, balanceAfter }
```

**Verified (storage layer):** assistant message persisted; `arm_activity_log` row
`chat_reply:1`.

`callGroqArm` (routes.ts, module level): direct `fetch` to
`https://api.groq.com/openai/v1/chat/completions`, Bearer `GROQ_API_KEY`, model
`llama-3.3-70b-versatile`; calls `pickAuthProfile('groq')` + `incrementProfileUsage`
for 5-entity round-robin.

---

## 3. Arm voice message (Whisper, 3 credits/min, min 1 min)

```
UI: ChatTab → MediaRecorder → Blob(audio/webm)
  POST /api/arms/:armId/messages/voice  (multipart, authFetch isFormData=true)
routes.ts: upload.single("audio")
  → uploadAudio(buffer, key, mime)        [R2, Part IX]
  → transcribeAudio(buffer, mime)         [Whisper tier ladder, Part IX]
  → minutes = max(1, ceil(durationSec/60)); cost = minutes * 3
  → storage.debitCredits
  → storage.createArmMessage(role='user', audioUrl, transcript)
  → storage.logArmActivity(action='voice_transcribed', creditsCost=cost)
```

---

## 4. Living document — edit, AI-assist (2 credits), version history, restore

```
GET  /api/arms/:armId/document            → { document, current, versionCount }
POST /api/arms/:armId/document { content, changeNote, aiAssist, lang }
  aiAssist=true → debit 2 credits → callGroqArm(revise) → finalContent = AI output
  → storage.createArmDocumentVersion(...)  [bumps version_number, sets current_version_id]
  → logArmActivity(action = aiAssist ? 'doc_assist' : 'doc_edit')
GET  /api/arms/:armId/document/versions    → DocVersion[]
POST /api/arms/:armId/document/versions/:versionId/restore
  → storage.restoreArmDocumentVersion(docId, versionId, userId)  [new version cloned from old, becomes current]
```

UI (DocumentTab): textarea seeded from current version; Save / AI-assist /
version-history panel with per-version Restore.

---

## 5. Target counterparty → AI instruction sheet → approval gate (Part IX)

```
UI: arm-detail.tsx → TargetsTab
  POST /api/arms/:armId/targets { name, contactInfo, notes }
  POST /api/arms/targets/:targetId/generate-instructions { lang }
routes.ts: generate-instructions
  → loadArm visibility check
  → debit 3 credits
  → buildArmSystemPrompt → callGroqArm(draft instruction sheet)
  → storage.createArmTargetInstruction(status='draft')
  → storage.createPendingAction({                       ← PART IX GATE
        sessionId: 0,
        actionType: 'arm_instruction',
        payload: { armId, projectId, targetId, instructionId, targetName },
        reasoning, status: 'pending',
        createdBy: <agent slug>
     })
  → storage.updateArmTargetInstruction(instructionId, { pendingActionId })
  → logArmActivity(action='target_instruction_drafted', creditsCost=3)
  ← { instruction, pendingActionId }
```

**Approve / reject (owner or admin only):**

```
POST /api/arm-instructions/:instructionId/approve
  → owner-or-admin guard (arm.ownerUserId === userId || isAdmin)
  → updateArmTargetInstruction(status='approved', approvedByUserId, approvedAt)
  → updatePendingActionStatus(pendingActionId, 'approved')
  → logArmActivity('instruction_approved')
POST /api/arm-instructions/:instructionId/reject   → mirror, status='rejected'
```

**Verified (storage layer):** instruction created with `pending_action_id` set;
`pending_actions` row has `action_type='arm_instruction'`; activity row
`target_instruction_drafted:3`. Approval gate enforced in the route.

---

## 6. Manager dashboard (admin only)

```
UI: admin-arms-dashboard.tsx
  GET /api/admin/arms/dashboard   (adminOnly guard in route)
routes.ts → storage.getArmsDashboard()
  aggregates over arms / armMessages / armTargets / armActivityLog / users / projects:
  { totalArms, activeArms, ownerlessArms, pendingInstructions,
    byAgent[{displayName, slug, armCount, messageCount, creditsSpent}],
    recentActivity[20], arms[{projectName, agentDisplayName, ownerEmail,
                              messageCount, targetCount, creditsSpent}] }
UI: 4 stat cards + by-manager panel + recent-activity panel + cross-project table.
```

**Verified:** dashboard returns `totalArms=44`, `byAgent` length `4`, and
`pendingInstructions` reflects draft-status instructions.

---

## Route registration order note

`GET /api/arms/agents` is registered **before** `GET /api/arms/:armId` so the
literal `agents` is not captured as an `:armId` param. The arm-detail route in
`App.tsx` (`/projects/:projectId/arms/:armSlug`) is registered **before**
`/projects/:id` so the more specific path wins in the wouter `<Switch>`.

---

## Spec deviations (intentional, consistent with "extension not rebuild")

1. **AI managers reuse the `agents` table** with `scope='arm'` instead of a new
   `arm_agents` table.
2. **Existing `model` column** is reused instead of adding `defaultModel`.

Both reduce surface area and keep the agent registry single-sourced.
