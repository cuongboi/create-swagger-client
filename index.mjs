#!/usr/bin/env node
import { existsSync, readFileSync } from "fs";
import openapiTS, { astToString } from "openapi-typescript";
import ora from "ora";
import { resolve } from "path";
import * as tsMorph from "ts-morph";

var args = process.argv.slice(2);
var source = args[0];
var outPut = args[1] || "swagger-client.ts";
if (!source) {
  console.error("Please provide a source URL or file path.");
  process.exit(1);
}
var isUrl = (str) => {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
};
async function generate() {
  if (!source) return;
  if (isUrl(source) === false) {
    source = resolve(process.cwd(), source);
  }

  if (existsSync(source)) {
    source = readFileSync(source, "utf-8");
  }

  const spinner = ora(`Generating API client from ${source}...`).start();
  const ast = await openapiTS(source);
  const contents = astToString(ast);
  const project = new tsMorph.Project();
  const sourceFile = project.createSourceFile(
    resolve(process.cwd(), outPut),
    contents,
    {
      overwrite: true,
    },
  );
  sourceFile.addTypeAlias({
    name: "RestMethod",
    isExported: true,
    type: '"get" | "post" | "put" | "delete" | "patch"',
  });
  sourceFile.addTypeAlias({
    name: "KeyPaths",
    isExported: true,
    type: "keyof paths",
  });
  sourceFile.addTypeAlias({
    name: "ExtractPathParams",
    isExported: true,
    typeParameters: ["K extends KeyPaths", "M extends RestMethod"],
    type: "paths[K][M] extends { parameters: { path?: infer P } } ? P : never",
  });
  sourceFile.addTypeAlias({
    name: "ExtractQueryParams",
    isExported: true,
    typeParameters: ["K extends KeyPaths", "M extends RestMethod"],
    type: "paths[K][M] extends { parameters: { query?: infer Q } } ? Q : never",
  });
  sourceFile.addTypeAlias({
    name: "ExtractHeaderParams",
    isExported: true,
    typeParameters: ["K extends KeyPaths", "M extends RestMethod"],
    type: "paths[K][M] extends { parameters: { header?: infer H } } ? H : never",
  });
  sourceFile.addTypeAlias({
    name: "ExtractBody",
    isExported: true,
    typeParameters: ["K extends KeyPaths", "M extends RestMethod"],
    type: `paths[K][M] extends {
  requestBody: { content: { "application/json": infer B } };
}
  ? B
  : never`,
  });
  sourceFile.addTypeAlias({
    name: "APIResponse",
    isExported: true,
    typeParameters: ["K extends KeyPaths", "M extends RestMethod"],
    type: `paths[K][M] extends { responses: infer R }
  ? R extends { "200"?: { content: { "application/json": infer C } } }
    ? C
    : R extends { content: { "application/json": infer C } }
    ? C
    : R extends Record<number | string, { content: { "application/json": infer C } }>
    ? C
    : never
  : never`,
  });
  sourceFile.addTypeAlias({
    name: "ApiPayload",
    isExported: true,
    typeParameters: ["T extends KeyPaths", "M extends RestMethod"],
    type: `{
  path?: ExtractPathParams<T, M>;
  query?: ExtractQueryParams<T, M>;
  body?: M extends "post" | "put" | "patch" ? ExtractBody<T, M> : never;
  headers?: ExtractHeaderParams<T, M> & Record<string, string>;
}`,
  });
  sourceFile.addTypeAlias({
    name: "PathsForMethod",
    typeParameters: ["M extends RestMethod"],
    type: `{
  [K in KeyPaths]: paths[K] extends Record<M, unknown> ? K : never;
}[KeyPaths]`,
  });
  sourceFile.addClass({
    name: "RestApiClient",
    isExported: true,
    ctors: [
      {
        parameters: [
          { name: "baseUrl", type: "string", scope: tsMorph.Scope.Private },
          {
            name: "defaultOptions",
            type: "RequestInit",
            initializer: "{}",
            scope: tsMorph.Scope.Private,
          },
          {
            name: "defaultTimeoutMs",
            type: "number",
            initializer: "30000",
            scope: tsMorph.Scope.Private,
          },
        ],
        statements: `this.baseUrl = baseUrl.replace(/\\/+$/, "");`,
      },
    ],
    methods: [
      {
        name: "buildUrl",
        scope: tsMorph.Scope.Private,
        typeParameters: ["P extends KeyPaths", "M extends RestMethod"],
        parameters: [
          { name: "pathTemplate", type: "P" },
          { name: "pathParams", type: "ExtractPathParams<P, M>", hasQuestionToken: true },
        ],
        returnType: "URL",
        statements: `let pathname = pathTemplate as string;

    if (pathParams) {
      pathname = pathname.replace(/\\{([^}]+)\\}/g, (_, paramName) => {
        const value = (pathParams as Record<string, unknown>)[paramName];
        if (value === undefined || value === null) {
          throw new Error(\`Missing required path parameter: \${paramName}\`);
        }
        return encodeURIComponent(String(value));
      });
    }

    return new URL(this.baseUrl + pathname);`,
      },
      {
        name: "appendQueryParams",
        scope: tsMorph.Scope.Private,
        parameters: [
          { name: "url", type: "URL" },
          { name: "query", type: "Record<string, unknown>", hasQuestionToken: true },
        ],
        returnType: "void",
        statements: `if (!query) return;

    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;

      if (Array.isArray(value)) {
        value.forEach((v) => {
          if (v !== undefined && v !== null) {
            url.searchParams.append(key, String(v));
          }
        });
      } else {
        url.searchParams.append(key, String(value));
      }
    }`,
      },
      {
        name: "prepareBody",
        scope: tsMorph.Scope.Private,
        typeParameters: ["M extends RestMethod"],
        parameters: [
          { name: "method", type: "M" },
          { name: "body", type: "unknown", hasQuestionToken: true },
        ],
        returnType: "BodyInit | null",
        statements: `if (!body || !["post", "put", "patch"].includes(method)) return null;
    return JSON.stringify(body);`,
      },
      {
        name: "fetchWithTimeout",
        scope: tsMorph.Scope.Private,
        isAsync: true,
        parameters: [
          { name: "input", type: "RequestInfo" },
          { name: "init", type: "RequestInit" },
          { name: "timeoutMs", type: "number" },
        ],
        returnType: "Promise<Response>",
        statements: `const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(input, {
        ...init,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new Error(\`Request timed out after \${timeoutMs}ms\`);
      }
      throw err;
    }`,
      },
      {
        name: "createError",
        scope: tsMorph.Scope.Private,
        parameters: [
          { name: "response", type: "Response" },
          { name: "body", type: "string | null" },
        ],
        statements: `return Object.assign(new Error(), {
      name: "ApiError",
      message: \`API request failed: \${response.status} \${response.statusText}\`,
      status: response.status,
      statusText: response.statusText,
      body: body ? JSON.parse(body) : null,
    });`,
      },
      {
        name: "request",
        isAsync: true,
        typeParameters: ["M extends RestMethod", "P extends PathsForMethod<M>"],
        parameters: [
          { name: "method", type: "M" },
          { name: "path", type: "P" },
          {
            name: "payload",
            type: "ApiPayload<P, M>",
            initializer: "{} as ApiPayload<P, M>",
          },
          {
            name: "options",
            type: "RequestInit",
            initializer: "{}",
          },
        ],
        returnType: "Promise<APIResponse<P, M>>",
        statements: `const url = this.buildUrl(path, payload.path);
    this.appendQueryParams(url, payload.query ?? {});

    const headers = {
      "Content-Type": "application/json",
      ...this.defaultOptions.headers,
      ...payload.headers,
      ...options.headers,
    };

    const requestInit: RequestInit = {
      method: method.toUpperCase(),
      ...this.defaultOptions,
      ...options,
      headers,
      body: this.prepareBody(method, payload.body),
    };

    const response = await this.fetchWithTimeout(
      url.toString(),
      requestInit,
      this.defaultTimeoutMs,
    );

    let responseBody: unknown;

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      responseBody = await response.json();
    } else {
      responseBody = await response.text();
    }

    if (!response.ok) {
      throw this.createError(
        response,
        typeof responseBody === "string" ? responseBody : null,
      );
    }

    return responseBody as APIResponse<P, M>;`,
      },
      {
        name: "get",
        scope: tsMorph.Scope.Public,
        typeParameters: ['P extends PathsForMethod<"get">'],
        parameters: [
          { name: "path", type: "P" },
          { name: "payload", type: 'ApiPayload<P, "get">', hasQuestionToken: true },
          { name: "options", type: "RequestInit", hasQuestionToken: true },
        ],
        returnType: 'Promise<APIResponse<P, "get">>',
        statements: 'return this.request("get", path, payload, options);',
      },
      {
        name: "post",
        scope: tsMorph.Scope.Public,
        typeParameters: ['P extends PathsForMethod<"post">'],
        parameters: [
          { name: "path", type: "P" },
          { name: "payload", type: 'ApiPayload<P, "post">', hasQuestionToken: true },
          { name: "options", type: "RequestInit", hasQuestionToken: true },
        ],
        returnType: 'Promise<APIResponse<P, "post">>',
        statements: 'return this.request("post", path, payload, options);',
      },
      {
        name: "put",
        scope: tsMorph.Scope.Public,
        typeParameters: ['P extends PathsForMethod<"put">'],
        parameters: [
          { name: "path", type: "P" },
          { name: "payload", type: 'ApiPayload<P, "put">', hasQuestionToken: true },
          { name: "options", type: "RequestInit", hasQuestionToken: true },
        ],
        returnType: 'Promise<APIResponse<P, "put">>',
        statements: 'return this.request("put", path, payload, options);',
      },
      {
        name: "patch",
        scope: tsMorph.Scope.Public,
        typeParameters: ['P extends PathsForMethod<"patch">'],
        parameters: [
          { name: "path", type: "P" },
          { name: "payload", type: 'ApiPayload<P, "patch">', hasQuestionToken: true },
          { name: "options", type: "RequestInit", hasQuestionToken: true },
        ],
        returnType: 'Promise<APIResponse<P, "patch">>',
        statements: 'return this.request("patch", path, payload, options);',
      },
      {
        name: "delete",
        scope: tsMorph.Scope.Public,
        typeParameters: ['P extends PathsForMethod<"delete">'],
        parameters: [
          { name: "path", type: "P" },
          { name: "payload", type: 'ApiPayload<P, "delete">', hasQuestionToken: true },
          { name: "options", type: "RequestInit", hasQuestionToken: true },
        ],
        returnType: 'Promise<APIResponse<P, "delete">>',
        statements: 'return this.request("delete", path, payload, options);',
      },
    ],
  });

  await sourceFile.formatText();
  await project.save();
  spinner.stopAndPersist({
    symbol: "✔",
    text: `API client generated at ${resolve(process.cwd(), outPut)}`,
  });
}

generate();
