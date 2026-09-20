# Local AI Integration (Optional Phase 7)

## 1. Overview

**Status:** Optional enhancement, only if Phases 1-6 complete with time remaining

**Purpose:** Add natural language query capability using a locally-hosted LLM (Ollama)

**Critical Requirement:** The application MUST work fully without this feature. Local AI is an enhancement, not a dependency.

## 2. Non-Negotiable Constraints

### 2.1 Offline-First Architecture

**The local AI layer:**
- ✅ Runs entirely on user's machine (Ollama)
- ✅ No external API calls
- ✅ No internet required (after model download)
- ❌ Does NOT replace core analytics (rule-based engine remains primary)

**Clear Separation:**
```
Core Analytics (Phases 1-6)          Optional AI Layer (Phase 7)
├── Rule-based analysis              ├── Natural language query
├── Always available                 ├── Requires Ollama installed
├── Deterministic results            ├── User explicitly enables
└── Zero dependencies                └── Graceful fallback if unavailable
```

### 2.2 Graceful Degradation

**If Ollama is not installed or not running:**
- App launches normally
- All Phase 1-6 features work
- AI query button shows "AI unavailable" tooltip
- No errors, no degraded performance

**Implementation:**
```typescript
async function checkOllamaAvailability(): Promise<boolean> {
  try {
    const response = await fetch('http://localhost:11434/api/version', {
      signal: AbortSignal.timeout(2000)  // 2 second timeout
    });
    return response.ok;
  } catch {
    return false;  // Ollama not running, gracefully continue
  }
}
```

## 3. Use Case

### 3.1 Problem Statement

**Current workflow (Phases 1-6):**
1. Import dataset
2. System automatically runs all applicable analyses
3. User views pre-generated charts and insights

**Limitation:**
- User can't ask custom questions ("What's the average revenue in California?")
- Limited to predefined analysis types

**Phase 7 Enhancement:**
- User types natural language question
- System converts to SQL query
- Executes query and displays result
- Maintains evidence linking (shows generated SQL)

### 3.2 Example Queries

**Supported:**
- "What is the average age of students?"
- "Show me total revenue by region"
- "Which product has the highest sales?"
- "How many orders were placed in 2024?"
- "List the top 5 customers by purchase amount"

**NOT Supported (out of scope):**
- Predictions: "What will revenue be next month?"
- Causality: "Why did sales drop in Q3?"
- External knowledge: "Is this above industry average?"
- Multi-dataset queries: "Compare this to last year's data"
- Data modification: "Delete rows where revenue < 100"

## 4. Architecture

### 4.1 Component Overview

```
User Question (NL)
    ↓
Query Interface (React)
    ↓ (IPC)
Main Process
    ↓
Ollama Client (HTTP)
    ↓
Ollama Server (localhost:11434)
    ↓
LLM Model (e.g., Llama 3.1 7B)
    ↓
Generated SQL
    ↓
Validation Layer
    ↓
DuckDB Execution
    ↓
Result + Chart
    ↓
Display to User
```

### 4.2 Module Location

**New files:**
- `src/core/ai/ollamaClient.ts` — HTTP client for Ollama API
- `src/core/ai/promptBuilder.ts` — Construct LLM prompts with schema context
- `src/core/ai/sqlValidator.ts` — Validate generated SQL before execution
- `src/renderer/components/AiQueryPanel.tsx` — Natural language input UI

## 5. Technology Choice: Ollama

### 5.1 Why Ollama?

**Ollama = Local LLM runtime (like Docker for AI models)**

**Advantages:**
- ✅ Free and open source
- ✅ Simple installation (one command)
- ✅ Runs entirely offline
- ✅ Supports many models (Llama, Mistral, CodeLlama)
- ✅ REST API (easy to integrate)
- ✅ Automatic model management

**Alternative (Rejected):**
- ❌ Python + Transformers: Requires Python environment, complex setup
- ❌ ONNX Runtime: Limited model support
- ❌ LLaMA.cpp: C++ dependency, harder to integrate with Electron

### 5.2 Model Selection

**Recommended Model: Llama 3.1 7B Instruct**

**Rationale:**
- Instruction-tuned (follows prompts well)
- 7B parameters = runs on 8GB RAM systems
- Good at code generation (including SQL)
- ~4GB model size (reasonable download)

**Command to download:**
```bash
ollama pull llama3.1:7b-instruct-q4_0
```

**Alternative (Lighter):**
- `llama3.1:3b-instruct` — Faster, less capable
- `codellama:7b-instruct` — Specialized for code, may perform better on SQL

### 5.3 Resource Requirements

| Component | Requirement |
|-----------|------------|
| RAM | 8GB minimum (4GB for model + 4GB for system) |
| Disk | 5GB (model storage) |
| CPU | Any modern CPU (GPU optional, speeds up inference) |
| Startup | ~10 seconds (first query loads model into memory) |
| Query | 2-10 seconds per query (depends on complexity) |

## 6. Implementation

### 6.1 Ollama Client

```typescript
// src/core/ai/ollamaClient.ts
interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  stream?: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
  };
}

interface OllamaGenerateResponse {
  response: string;
  done: boolean;
}

export class OllamaClient {
  private baseUrl = 'http://localhost:11434';
  private model = 'llama3.1:7b-instruct-q4_0';
  
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/version`, {
        signal: AbortSignal.timeout(2000)
      });
      return response.ok;
    } catch {
      return false;
    }
  }
  
  async generate(prompt: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        prompt,
        stream: false,
        options: {
          temperature: 0.1,  // Low temperature for deterministic SQL
          max_tokens: 500
        }
      } as OllamaGenerateRequest)
    });
    
    if (!response.ok) {
      throw new Error(`Ollama error: ${response.statusText}`);
    }
    
    const data: OllamaGenerateResponse = await response.json();
    return data.response;
  }
}
```

### 6.2 Prompt Construction

```typescript
// src/core/ai/promptBuilder.ts
export function buildSqlPrompt(
  question: string,
  schema: Schema
): string {
  const columnDescriptions = schema.columns
    .map(col => `- ${col.name} (${col.detectedType})`)
    .join('\n');
  
  return `You are a SQL expert. Given a dataset schema and a natural language question, generate a valid DuckDB SQL query.

**Database Schema:**
Table name: dataset
Columns:
${columnDescriptions}

**Rules:**
1. Use only columns from the schema above
2. Table name is always "dataset"
3. Use double quotes for column names: SELECT "column_name" FROM dataset
4. Return ONLY the SQL query, no explanations
5. Use LIMIT 100 if no limit specified
6. Do not use INSERT, UPDATE, DELETE, DROP (read-only queries)

**Question:** ${question}

**SQL Query:**`;
}
```

**Example Prompt:**
```
You are a SQL expert. Given a dataset schema and a natural language question, generate a valid DuckDB SQL query.

**Database Schema:**
Table name: dataset
Columns:
- student_id (IDENTIFIER)
- name (TEXT)
- age (NUMERIC)
- grade (NUMERIC)
- enrolled (BOOLEAN)
- enrollment_date (DATE)

**Rules:**
1. Use only columns from the schema above
2. Table name is always "dataset"
3. Use double quotes for column names: SELECT "column_name" FROM dataset
4. Return ONLY the SQL query, no explanations
5. Use LIMIT 100 if no limit specified
6. Do not use INSERT, UPDATE, DELETE, DROP (read-only queries)

**Question:** What is the average age of enrolled students?

**SQL Query:**
```

**Expected LLM Output:**
```sql
SELECT AVG("age") FROM dataset WHERE "enrolled" = true
```

### 6.3 SQL Validation

```typescript
// src/core/ai/sqlValidator.ts
export function validateGeneratedSql(
  sql: string,
  schema: Schema
): { valid: boolean; error?: string } {
  // 1. Check for dangerous keywords
  const dangerousKeywords = /\b(DROP|DELETE|UPDATE|INSERT|ALTER|CREATE|TRUNCATE)\b/i;
  if (dangerousKeywords.test(sql)) {
    return { valid: false, error: 'Query contains forbidden operations' };
  }
  
  // 2. Verify table name is "dataset"
  if (!sql.includes('dataset')) {
    return { valid: false, error: 'Query must reference "dataset" table' };
  }
  
  // 3. Check column names exist in schema
  const columnPattern = /"([^"]+)"/g;
  const referencedColumns = Array.from(sql.matchAll(columnPattern))
    .map(match => match[1]);
  
  const validColumns = schema.columns.map(c => c.name);
  for (const col of referencedColumns) {
    if (!validColumns.includes(col)) {
      return { valid: false, error: `Column "${col}" does not exist in schema` };
    }
  }
  
  // 4. Basic syntax check (naive)
  if (!sql.trim().toUpperCase().startsWith('SELECT')) {
    return { valid: false, error: 'Query must start with SELECT' };
  }
  
  return { valid: true };
}
```

### 6.4 Query Execution Flow

```typescript
// Main process IPC handler
ipcMain.handle('query-natural-language', async (event, question: string) => {
  const db = getConnection();
  const schema = getSchema();  // Cached from import
  const ollamaClient = new OllamaClient();
  
  // 1. Check Ollama availability
  const available = await ollamaClient.isAvailable();
  if (!available) {
    return { error: 'Ollama is not running', code: 'OLLAMA_UNAVAILABLE' };
  }
  
  try {
    // 2. Generate SQL from natural language
    const prompt = buildSqlPrompt(question, schema);
    const generatedSql = await ollamaClient.generate(prompt);
    
    // 3. Extract SQL (LLM might add explanations)
    const sql = extractSqlFromResponse(generatedSql);
    
    // 4. Validate SQL
    const validation = validateGeneratedSql(sql, schema);
    if (!validation.valid) {
      return { error: validation.error, code: 'VALIDATION_FAILED', sql };
    }
    
    // 5. Execute query
    const result = await db.prepare(sql).all();
    
    // 6. Generate chart if applicable
    const chartConfig = tryMapToChart(result, sql);
    
    return {
      sql,
      result,
      chartConfig,
      rowCount: result.length
    };
    
  } catch (error) {
    return { error: error.message, code: 'EXECUTION_FAILED' };
  }
});
```

### 6.5 UI Component

```tsx
// src/renderer/components/AiQueryPanel.tsx
export function AiQueryPanel() {
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [ollamaAvailable, setOllamaAvailable] = useState<boolean | null>(null);
  
  useEffect(() => {
    // Check Ollama availability on mount
    window.electronAPI.checkOllama().then(setOllamaAvailable);
  }, []);
  
  async function handleSubmit() {
    setLoading(true);
    try {
      const response = await window.electronAPI.queryNaturalLanguage(question);
      
      if (response.error) {
        alert(response.error);
      } else {
        setResult(response);
      }
    } finally {
      setLoading(false);
    }
  }
  
  if (ollamaAvailable === false) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="font-semibold">AI Query Unavailable</p>
        <p className="text-sm mt-2">
          Install Ollama to enable natural language queries.
          <a href="https://ollama.ai" className="text-blue-600 ml-1">Learn more</a>
        </p>
      </div>
    );
  }
  
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-bold mb-4">Ask a Question</h2>
      
      <div className="flex gap-2">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g., What is the average revenue by region?"
          className="flex-1 border rounded px-4 py-2"
          disabled={loading}
        />
        <button
          onClick={handleSubmit}
          disabled={loading || !question.trim()}
          className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:bg-gray-400"
        >
          {loading ? 'Processing...' : 'Ask'}
        </button>
      </div>
      
      {result && (
        <div className="mt-6">
          <div className="mb-4">
            <p className="text-sm font-semibold">Generated SQL:</p>
            <pre className="bg-gray-50 p-3 rounded text-xs mt-2 overflow-x-auto">
              {result.sql}
            </pre>
          </div>
          
          {result.chartConfig ? (
            <ReactECharts option={result.chartConfig.echartsOption} />
          ) : (
            <DataTable data={result.result} />
          )}
          
          <p className="text-sm text-gray-600 mt-2">
            {result.rowCount} rows returned
          </p>
        </div>
      )}
    </div>
  );
}
```

## 7. Error Handling

### 7.1 Error Categories

**1. Ollama Unavailable:**
- Error: `OLLAMA_UNAVAILABLE`
- Message: "AI query feature requires Ollama to be installed and running"
- Action: Show installation instructions, disable AI panel

**2. Parse Failure:**
- Error: `PARSE_FAILED`
- Message: "Could not understand the question. Try rephrasing."
- Action: Suggest example questions

**3. Validation Failed:**
- Error: `VALIDATION_FAILED`
- Message: "Generated query references unknown column 'X'"
- Action: Show generated SQL, let user report issue

**4. Execution Failed:**
- Error: `EXECUTION_FAILED`
- Message: DuckDB error (e.g., syntax error, type mismatch)
- Action: Show SQL + error, suggest trying a different question

### 7.2 User Guidance

**Example Questions (in UI):**
- "What is the average [numeric_column]?"
- "Show me total [numeric_column] by [categorical_column]"
- "Which [categorical_column] has the highest [numeric_column]?"
- "How many rows are there?"
- "List the top 10 [categorical_column] by [numeric_column]"

## 8. Testing Strategy

### 8.1 Unit Tests (Without Ollama)

**Mock Ollama responses:**
```typescript
test('validateGeneratedSql rejects DROP statements', () => {
  const sql = 'DROP TABLE dataset';
  const validation = validateGeneratedSql(sql, mockSchema);
  expect(validation.valid).toBe(false);
  expect(validation.error).toContain('forbidden');
});
```

### 8.2 Integration Tests (With Ollama)

**Requires Ollama installed:**
```typescript
test('end-to-end natural language query', async () => {
  const question = 'What is the average age?';
  const result = await queryNaturalLanguage(question, mockSchema, db);
  
  expect(result.sql).toContain('AVG');
  expect(result.result).toHaveLength(1);
  expect(result.result[0]).toHaveProperty('avg');
});
```

### 8.3 Manual Testing Checklist

- [ ] Ollama not installed → graceful fallback
- [ ] Ollama installed but not running → error message
- [ ] Simple query → correct SQL generated
- [ ] Complex query → validation catches issues
- [ ] Invalid column name → validation error
- [ ] Dangerous keyword (DROP, DELETE) → blocked
- [ ] Chart-compatible result → chart renders
- [ ] Table-only result → table displays

## 9. Deployment Considerations

### 9.1 User Setup Instructions

**Documentation (README.md):**
```markdown
## Optional: Enable AI Queries (Phase 7)

1. Install Ollama:
   - Visit https://ollama.ai/download
   - Download for your OS (Windows/Mac/Linux)
   - Run installer

2. Download the AI model:
   ```bash
   ollama pull llama3.1:7b-instruct-q4_0
   ```

3. Start Ollama (automatic on most systems):
   ```bash
   ollama serve
   ```

4. Restart the app — AI query panel will now be enabled

**Note:** This feature is entirely optional. The app works fully without it.
```

### 9.2 Model Download Size

**User warning:**
- Model size: ~4.2 GB
- Download time: 5-30 minutes (depending on connection)
- One-time download (cached locally)

## 10. Limitations & Future Work

### 10.1 Current Limitations (Phase 7)

- English language only
- Simple queries only (single table, no complex joins)
- No query history or saved queries
- No query refinement ("try again with...")
- LLM accuracy not guaranteed (may generate incorrect SQL)

### 10.2 Potential Enhancements (Beyond Phase 7)

- Query history and favorites
- Multi-turn conversations ("Now filter by region")
- Query explanation ("This query calculates...")
- Automatic chart type selection
- Fine-tuned model on dataset-specific terminology
- Support for dataset-specific business logic

## 11. Document Status

- **Version:** 1.0  
- **Created:** 2026-09-08  
- **Status:** Optional Phase 7 feature specification  
- **Dependency:** Phases 1-6 must be complete first  
- **Related Docs:** ANALYTICS_ENGINE.md, SYSTEM_SPECIFICATION.md, PROJECT_REQUIREMENTS.md
