# Task Details - Usage Example

## Problem

When an agent sees pending tasks on the board via `get_board`, it only gets a summary:

```markdown
## Pending Tasks
| ID | Title | From | Status | Created At |
| EXT-123456 | Implement authentication | project-api | PENDING | 2024-01-28T10:30:00 |
```

The agent can see:
- ✅ Task ID
- ✅ Title
- ✅ Origin project
- ✅ Status

But **cannot see**:
- ❌ Detailed description
- ❌ Technical context
- ❌ Implementation requirements

## Solution

Use `get_task_details` action to retrieve complete task information.

## Usage Flow

### 1. Check Board for Pending Tasks

```json
{
  "projectId": "my-project",
  "action": "get_board"
}
```

**Response:**
```markdown
## Pending Tasks
| ID | Title | From | Status | Created At |
| EXT-123456 | Implement authentication | project-api | PENDING | 2024-01-28T10:30:00 |
| EXT-123457 | Add logging service | project-worker | PENDING | 2024-01-28T11:00:00 |
```

### 2. Get Full Details of a Task

```json
{
  "projectId": "my-project",
  "action": "get_task_details",
  "taskId": "EXT-123456"
}
```

**Response:**
```json
{
  "success": true,
  "task": {
    "id": "EXT-123456",
    "projectId": "my-project",
    "title": "Implement authentication",
    "description": "Need to implement JWT-based authentication for the API.\n\nContext:\nThe API project needs authentication middleware but the auth logic should live in the lib-auth shared library. Please create:\n1. AuthService class with login/validate methods\n2. JWT token generation and validation\n3. Password hashing utilities\n4. Export all from index.ts for API to consume",
    "fromProject": "project-api",
    "status": "PENDING",
    "createdAt": "2024-01-28T10:30:00.000Z"
  }
}
```

### 3. Claim the Task (After Understanding It)

```json
{
  "projectId": "my-project",
  "action": "claim_task",
  "taskId": "EXT-123456"
}
```

### 4. Work on the Task

- Route: Verify this is your responsibility
- Search: Look for existing patterns
- Implement: Create the code
- Reindex: Update the memory bank

### 5. Complete the Task

```json
{
  "projectId": "my-project",
  "action": "complete_task",
  "taskId": "EXT-123456"
}
```

## Complete Workflow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Register & Check Board                                   │
│    action: "register" → action: "get_board"                 │
└───────────────────┬─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Get Task Details (NEW!)                                  │
│    action: "get_task_details"                               │
│    → Returns: full description, context, requirements       │
└───────────────────┬─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Claim Task                                                │
│    action: "claim_task"                                      │
│    → Status: PENDING → IN_PROGRESS                          │
└───────────────────┬─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Implement Task                                            │
│    Route → Search → Code → Reindex                          │
└───────────────────┬─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Complete Task                                             │
│    action: "complete_task"                                   │
│    → Status: IN_PROGRESS → COMPLETED                        │
└─────────────────────────────────────────────────────────────┘
```

## Why This Matters

### Before (Without `get_task_details`)

Agent sees: "Implement authentication"
- Agent guesses what's needed
- May implement in wrong project
- May miss important context
- High chance of errors

### After (With `get_task_details`)

Agent reads full context:
- ✅ Knows exact requirements
- ✅ Understands where it belongs
- ✅ Has technical context
- ✅ Can ask clarifying questions if needed
- ✅ Implements correctly the first time

## API Reference

### get_task_details

**Input:**
```typescript
{
  projectId: string;      // Your project ID
  action: "get_task_details";
  taskId: string;         // Task ID from get_board (e.g., "EXT-123456")
}
```

**Output (Success):**
```typescript
{
  success: true;
  task: {
    id: string;           // Task ID
    projectId: string;    // Target project
    title: string;        // Short title
    description: string;  // Full description + context
    fromProject?: string; // Delegating project (for EXT-* tasks)
    fromAgent?: string;   // Creating agent (for TASK-* tasks)
    status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
    claimedBy?: string;   // Agent ID if claimed
    createdAt: string;    // ISO timestamp
    claimedAt?: string;   // ISO timestamp
    completedAt?: string; // ISO timestamp
  }
}
```

**Output (Not Found):**
```typescript
{
  success: false;
  message: "Task EXT-123456 not found"
}
```

## Best Practices

1. **Always get details before claiming**
   ```json
   // ✅ GOOD: Understand first, then claim
   get_task_details → claim_task
   
   // ❌ BAD: Claim blindly
   claim_task (without reading details)
   ```

2. **Use description field for requirements**
   - The `description` field contains both the description AND context
   - When delegating, format as: `${description}\n\nContext:\n${context}`
   - This ensures all information is preserved

3. **Check task status before claiming**
   - Task may already be IN_PROGRESS by another agent
   - `get_task_details` shows current status and who claimed it

4. **External vs Internal Tasks**
   - `EXT-*`: Delegated from another project (has `fromProject`)
   - `TASK-*`: Created internally (has `fromAgent`)
   - Both have full `description` with context
