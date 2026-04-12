import { spawn } from "child_process";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import type { ToolCall, ToolResult } from "@shared/schema";
import { storage } from "./storage";

// Directories
const SANDBOX_DIR = path.join(process.cwd(), "sandbox");
const ARTIFACTS_DIR = path.join(process.cwd(), "artifacts");

// Ensure dirs exist
for (const dir of [SANDBOX_DIR, ARTIFACTS_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ===== CODE EXECUTION SANDBOX =====
async function executeCode(input: { language: string; code: string }): Promise<ToolResult> {
  const { language, code } = input;
  const execId = randomUUID().slice(0, 8);
  const start = Date.now();

  // Create temp workspace for this execution
  const workDir = path.join(SANDBOX_DIR, execId);
  fs.mkdirSync(workDir, { recursive: true });

  try {
    let cmd: string;
    let args: string[];
    let filename: string;

    if (language === "python" || language === "python3") {
      filename = "script.py";
      cmd = "python3";
      args = [filename];
    } else if (language === "javascript" || language === "node") {
      filename = "script.js";
      cmd = "node";
      args = [filename];
    } else {
      return {
        toolCallId: execId,
        tool: "run_code",
        success: false,
        output: "",
        error: `Unsupported language: ${language}. Use 'python' or 'javascript'.`,
        duration: Date.now() - start,
      };
    }

    // Write code to file
    fs.writeFileSync(path.join(workDir, filename), code);

    // Execute with timeout
    const result = await new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve) => {
      let stdout = "";
      let stderr = "";
      let killed = false;

      const proc = spawn(cmd, args, {
        cwd: workDir,
        timeout: 30000, // 30 second timeout
        env: { ...process.env, HOME: workDir, TMPDIR: workDir },
      });

      proc.stdout.on("data", (data) => { stdout += data.toString(); });
      proc.stderr.on("data", (data) => { stderr += data.toString(); });

      const timer = setTimeout(() => {
        killed = true;
        proc.kill("SIGKILL");
      }, 30000);

      proc.on("close", (exitCode) => {
        clearTimeout(timer);
        if (killed) {
          stderr += "\n[Execution timed out after 30 seconds]";
        }
        resolve({ stdout: stdout.slice(0, 10000), stderr: stderr.slice(0, 5000), exitCode: exitCode ?? 1 });
      });

      proc.on("error", (err) => {
        clearTimeout(timer);
        resolve({ stdout: "", stderr: err.message, exitCode: 1 });
      });
    });

    // Check for generated files in workDir
    const generatedFiles: { filename: string; url: string; mimetype: string }[] = [];
    const files = fs.readdirSync(workDir).filter((f) => f !== filename);
    for (const f of files) {
      const srcPath = path.join(workDir, f);
      const stat = fs.statSync(srcPath);
      if (stat.isFile() && stat.size > 0 && stat.size < 50 * 1024 * 1024) {
        const artifactName = `${execId}-${f}`;
        const destPath = path.join(ARTIFACTS_DIR, artifactName);
        fs.copyFileSync(srcPath, destPath);
        const ext = path.extname(f).toLowerCase();
        const mimeMap: Record<string, string> = {
          ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml",
          ".pdf": "application/pdf", ".csv": "text/csv", ".json": "application/json",
          ".html": "text/html", ".txt": "text/plain", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        };
        generatedFiles.push({
          filename: artifactName,
          url: `/api/artifacts/${artifactName}`,
          mimetype: mimeMap[ext] || "application/octet-stream",
        });
      }
    }

    const output = result.stdout || (result.stderr && result.exitCode !== 0 ? "" : "(no output)");
    const success = result.exitCode === 0;

    return {
      toolCallId: execId,
      tool: "run_code",
      success,
      output: success ? output : `Error (exit ${result.exitCode}):\n${result.stderr}\n${output}`,
      error: success ? undefined : result.stderr,
      artifacts: generatedFiles.length > 0 ? generatedFiles : undefined,
      duration: Date.now() - start,
    };
  } finally {
    // Cleanup sandbox workdir (but keep artifacts)
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {}
  }
}

// ===== WEB BROWSING =====
async function browseWeb(input: { url: string; extract?: string }): Promise<ToolResult> {
  const start = Date.now();
  const { url, extract = "text" } = input;

  try {
    // Validate URL
    new URL(url);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AIProxy/1.0; +https://aiproxy.io)",
        "Accept": "text/html,application/json,text/plain,*/*",
      },
    });

    clearTimeout(timeout);

    if (!res.ok) {
      return {
        toolCallId: randomUUID().slice(0, 8),
        tool: "browse_web",
        success: false,
        output: "",
        error: `HTTP ${res.status}: ${res.statusText}`,
        duration: Date.now() - start,
      };
    }

    const contentType = res.headers.get("content-type") || "";
    let content: string;

    if (contentType.includes("application/json")) {
      const json = await res.json();
      content = JSON.stringify(json, null, 2).slice(0, 15000);
    } else {
      const html = await res.text();
      // Strip HTML tags for readable text
      content = extractTextFromHtml(html).slice(0, 15000);
    }

    return {
      toolCallId: randomUUID().slice(0, 8),
      tool: "browse_web",
      success: true,
      output: `--- Content from ${url} ---\n\n${content}`,
      duration: Date.now() - start,
    };
  } catch (e: any) {
    return {
      toolCallId: randomUUID().slice(0, 8),
      tool: "browse_web",
      success: false,
      output: "",
      error: e.name === "AbortError" ? "Request timed out (15s)" : e.message,
      duration: Date.now() - start,
    };
  }
}

// Simple HTML text extractor
function extractTextFromHtml(html: string): string {
  // Remove script and style tags with content
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<nav[\s\S]*?<\/nav>/gi, "");
  text = text.replace(/<footer[\s\S]*?<\/footer>/gi, "");
  // Replace block elements with newlines
  text = text.replace(/<(br|hr|p|div|h[1-6]|li|tr|blockquote)[^>]*>/gi, "\n");
  // Remove remaining HTML tags
  text = text.replace(/<[^>]+>/g, " ");
  // Decode common HTML entities
  text = text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"").replace(/&#039;/g, "'").replace(/&nbsp;/g, " ");
  // Clean whitespace
  text = text.replace(/[ \t]+/g, " ").replace(/\n\s*\n/g, "\n\n").trim();
  return text;
}

// ===== FILE GENERATION =====
async function generateFile(
  input: { format: string; title: string; content: string },
  userId: number,
  conversationId?: number,
  messageId?: number
): Promise<ToolResult> {
  const start = Date.now();
  const { format, title, content } = input;
  const fileId = randomUUID().slice(0, 8);

  try {
    let filename: string;
    let mimetype: string;
    let fileContent: Buffer | string;

    switch (format.toLowerCase()) {
      case "csv": {
        filename = `${fileId}-${sanitizeFilename(title)}.csv`;
        mimetype = "text/csv";
        fileContent = content;
        break;
      }
      case "html": {
        filename = `${fileId}-${sanitizeFilename(title)}.html`;
        mimetype = "text/html";
        fileContent = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;line-height:1.6;color:#1a1a1a;}
h1{border-bottom:2px solid #2196F3;padding-bottom:10px;}h2{color:#1565C0;margin-top:30px;}
pre{background:#f5f5f5;padding:16px;border-radius:8px;overflow-x:auto;}code{background:#f0f0f0;padding:2px 6px;border-radius:4px;}
table{border-collapse:collapse;width:100%;}th,td{border:1px solid #ddd;padding:8px 12px;text-align:left;}th{background:#f5f5f5;}
blockquote{border-left:4px solid #2196F3;margin:16px 0;padding:8px 16px;background:#f8f9fa;}</style>
</head><body><h1>${escapeHtml(title)}</h1>${markdownToHtml(content)}</body></html>`;
        break;
      }
      case "txt":
      case "text": {
        filename = `${fileId}-${sanitizeFilename(title)}.txt`;
        mimetype = "text/plain";
        fileContent = `${title}\n${"=".repeat(title.length)}\n\n${content}`;
        break;
      }
      case "json": {
        filename = `${fileId}-${sanitizeFilename(title)}.json`;
        mimetype = "application/json";
        try {
          fileContent = JSON.stringify(JSON.parse(content), null, 2);
        } catch {
          fileContent = JSON.stringify({ title, content }, null, 2);
        }
        break;
      }
      case "md":
      case "markdown": {
        filename = `${fileId}-${sanitizeFilename(title)}.md`;
        mimetype = "text/markdown";
        fileContent = `# ${title}\n\n${content}`;
        break;
      }
      case "pdf": {
        // Generate HTML and serve as downloadable - for real PDF would need puppeteer or pdfkit
        filename = `${fileId}-${sanitizeFilename(title)}.html`;
        mimetype = "text/html";
        fileContent = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>@media print{body{margin:0;}}body{font-family:Georgia,serif;max-width:700px;margin:40px auto;padding:0 20px;line-height:1.8;color:#222;}
h1{font-size:28px;border-bottom:2px solid #333;padding-bottom:10px;}h2{font-size:22px;margin-top:30px;}
p{margin:12px 0;}pre{background:#f5f5f5;padding:16px;border-radius:4px;font-size:13px;}
.print-note{background:#FFF3CD;padding:12px;border-radius:8px;margin-bottom:20px;font-size:14px;}</style>
</head><body>
<div class="print-note">💡 Use <strong>Ctrl+P</strong> (or Cmd+P) and select "Save as PDF" to download as PDF.</div>
<h1>${escapeHtml(title)}</h1>${markdownToHtml(content)}</body></html>`;
        break;
      }
      default: {
        filename = `${fileId}-${sanitizeFilename(title)}.txt`;
        mimetype = "text/plain";
        fileContent = content;
      }
    }

    // Write file
    const filePath = path.join(ARTIFACTS_DIR, filename);
    fs.writeFileSync(filePath, fileContent);
    const stat = fs.statSync(filePath);

    // Save artifact to database
    await storage.createArtifact({
      userId,
      conversationId: conversationId || null,
      messageId: messageId || null,
      filename,
      originalName: `${title}.${format}`,
      mimetype,
      size: stat.size,
      path: filePath,
      url: `/api/artifacts/${filename}`,
      artifactType: "file",
      description: title,
    });

    return {
      toolCallId: fileId,
      tool: "generate_file",
      success: true,
      output: `Created ${format.toUpperCase()} file: "${title}" (${formatBytes(stat.size)})`,
      artifacts: [{ filename, url: `/api/artifacts/${filename}`, mimetype }],
      duration: Date.now() - start,
    };
  } catch (e: any) {
    return {
      toolCallId: fileId,
      tool: "generate_file",
      success: false,
      output: "",
      error: e.message,
      duration: Date.now() - start,
    };
  }
}

// ===== WEB SEARCH (via Perplexity API) =====
async function searchWeb(input: { query: string }, providerKey?: string): Promise<ToolResult> {
  const start = Date.now();
  const { query } = input;

  if (!providerKey) {
    return {
      toolCallId: randomUUID().slice(0, 8),
      tool: "search_web",
      success: false,
      output: "",
      error: "No Perplexity API key configured. Go to Admin > Providers to add one.",
      duration: Date.now() - start,
    };
  }

  try {
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${providerKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          { role: "system", content: "Be precise and concise. Provide factual information with sources." },
          { role: "user", content: query },
        ],
      }),
    });

    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();

    const content = data.choices?.[0]?.message?.content || "No results";
    const citations = data.citations ? `\n\nSources:\n${data.citations.map((c: string, i: number) => `${i + 1}. ${c}`).join("\n")}` : "";

    return {
      toolCallId: randomUUID().slice(0, 8),
      tool: "search_web",
      success: true,
      output: `Search results for "${query}":\n\n${content}${citations}`,
      duration: Date.now() - start,
    };
  } catch (e: any) {
    return {
      toolCallId: randomUUID().slice(0, 8),
      tool: "search_web",
      success: false,
      output: "",
      error: e.message,
      duration: Date.now() - start,
    };
  }
}

// ===== MAIN TOOL DISPATCHER =====
export async function executeTool(
  toolCall: ToolCall,
  context: {
    userId: number;
    conversationId?: number;
    messageId?: number;
    perplexityKey?: string;
  }
): Promise<ToolResult> {
  switch (toolCall.tool) {
    case "run_code":
      return executeCode(toolCall.input as { language: string; code: string });
    case "browse_web":
      return browseWeb(toolCall.input as { url: string; extract?: string });
    case "generate_file":
      return generateFile(
        toolCall.input as { format: string; title: string; content: string },
        context.userId,
        context.conversationId,
        context.messageId
      );
    case "search_web":
      return searchWeb(toolCall.input as { query: string }, context.perplexityKey);
    case "analyze_data":
      // Analyze data reuses code execution with a data analysis wrapper
      const analysisCode = `
import json
# Data analysis task: ${(toolCall.input as any).task || "analyze the data"}
data = """${((toolCall.input as any).data || "").replace(/"/g, '\\"').slice(0, 5000)}"""
print("Analysis of provided data:")
print(f"Data length: {len(data)} characters")
if data.strip():
    lines = data.strip().split("\\n")
    print(f"Lines: {len(lines)}")
    if "," in lines[0]:
        print(f"Detected CSV format with {len(lines[0].split(','))} columns")
        print(f"Headers: {lines[0]}")
        print(f"Rows: {len(lines) - 1}")
print("\\nNote: For complex analysis, use run_code with custom Python code.")
`;
      return executeCode({ language: "python", code: analysisCode });
    default:
      return {
        toolCallId: randomUUID().slice(0, 8),
        tool: toolCall.tool,
        success: false,
        output: "",
        error: `Unknown tool: ${toolCall.tool}`,
      };
  }
}

// ===== PARSE TOOL CALLS FROM AI RESPONSE =====
export function parseToolCalls(text: string): { toolCalls: ToolCall[]; cleanText: string } {
  const toolCalls: ToolCall[] = [];
  let cleanText = text;

  // Match ```tool_call ... ``` blocks
  const regex = /```tool_call\s*\n?([\s\S]*?)```/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed.tool && parsed.input) {
        toolCalls.push({
          id: randomUUID().slice(0, 8),
          tool: parsed.tool,
          input: parsed.input,
        });
      }
    } catch {
      // Skip invalid JSON
    }
    cleanText = cleanText.replace(match[0], "").trim();
  }

  return { toolCalls, cleanText };
}

// ===== HELPERS =====
function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 50).toLowerCase();
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Basic markdown to HTML converter for file generation
function markdownToHtml(md: string): string {
  let html = md;
  // Headers
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");
  // Bold and italic
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  // Code blocks
  html = html.replace(/```[\w]*\n([\s\S]*?)```/g, "<pre><code>$1</code></pre>");
  html = html.replace(/`(.+?)`/g, "<code>$1</code>");
  // Lists
  html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
  html = html.replace(/^(\d+)\. (.+)$/gm, "<li>$2</li>");
  // Blockquotes
  html = html.replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>");
  // Links
  html = html.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank">$1</a>');
  // Paragraphs (lines not already wrapped)
  html = html.replace(/^(?!<[hblpuo]|<li|<pre|<code|<block)([\s\S]+?)$/gm, "<p>$1</p>");
  // Clean empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, "");
  return html;
}
