#!/usr/bin/env node
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
    typeParameters: ["T extends KeyPaths", "K extends RestMethod"],
    type: "paths[T][K] extends { parameters: { path?: infer P } } ? P : never",
  });
  sourceFile.addTypeAlias({
    name: "ExtractQueryParams",
    isExported: true,
    typeParameters: ["T extends KeyPaths", "K extends RestMethod"],
    type: "paths[T][K] extends { parameters: { query?: infer Q } } ? Q : never",
  });
  sourceFile.addTypeAlias({
    name: "ExtractHeaderParams",
    isExported: true,
    typeParameters: ["T extends KeyPaths", "K extends RestMethod"],
    type: "paths[T][K] extends { parameters: { header?: infer H } } ? H : never",
  });
  sourceFile.addTypeAlias({
    name: "ExtractBody",
    isExported: true,
    typeParameters: ["T extends KeyPaths", "K extends RestMethod"],
    type: `paths[T][K] extends {
  requestBody: { content: { "application/json": infer B } };
}
  ? B
  : never`,
  });
  sourceFile.addTypeAlias({
    name: "APIResponse",
    isExported: true,
    typeParameters: ["T extends KeyPaths", "K extends RestMethod"],
    type: `paths[T][K] extends {
  responses:
    | { content: { "application/json": infer R } }
    | { [code: number]: { content: { "application/json": infer R } } };
}
  ? R
  : unknown`,
  });
  sourceFile.addTypeAlias({
    name: "ApiPayload",
    isExported: true,
    typeParameters: ["T extends KeyPaths", "K extends RestMethod"],
    type: `{
  path?: ExtractPathParams<T, K>;
  query?: ExtractQueryParams<T, K>;
  body?: K extends "post" | "put" | "patch" ? ExtractBody<T, K> : never;
  headers?: ExtractHeaderParams<T, K>;
}`,
  });
  sourceFile.addTypeAlias({
    name: "ApiClientType",
    isExported: true,
    type: `{
  [K in RestMethod]: <T extends KeyPaths>(
    path: T,
    payload?: ApiPayload<T, K>,
  ) => Promise<APIResponse<T, K>>;
}`,
  });
  sourceFile.addTypeAlias({
    name: "TypePaths",
    typeParameters: ["T extends RestMethod"],
    type: `{
  [K in KeyPaths]: paths[K] extends { [M in T]: unknown } ? K : never;
}[KeyPaths]`,
  });
  sourceFile.addClass({
    name: "RestApiClient",
    isExported: true,
    ctors: [
      {
        parameters: [
          { name: "basePath", type: "string", scope: tsMorph.Scope.Private },
          {
            name: "option",
            type: "RequestInit",
            hasQuestionToken: true,
            scope: tsMorph.Scope.Private,
          },
        ],
      },
    ],
    methods: [
      {
        name: "fetcher",
        scope: tsMorph.Scope.Public,
        isAsync: true,
        parameters: [
          { name: "input", type: "RequestInfo" },
          { name: "init", type: "RequestInit", hasQuestionToken: true },
        ],
        statements: `const headers = {
      "Content-Type": "application/json",
      ...init?.headers,
    };

    const response = await fetch(input, { ...init, headers });
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        \`API request failed: \${response.status} \${response.statusText} - \${errorBody}\`,
      );
    }
    return response.json();`,
      },
      {
        name: "request",
        typeParameters: ["M extends RestMethod", "P extends TypePaths<M>"],
        parameters: [
          { name: "method", type: "M" },
          { name: "path", type: "P" },
          {
            name: "init",
            type: "ApiPayload<P, M>",
            initializer: "{} as ApiPayload<P, M>",
          },
        ],
        returnType: "Promise<APIResponse<P, M>>",
        statements: `const url = new URL(this.basePath + String(path));

    url.pathname = this.buildPathUrl(url.pathname, init.path);
    this.appendQueryParams(url, init.query);

    const requestInit: RequestInit = {
      method: method.toUpperCase(),
      ...this.option,
      headers: {
        ...(this.option?.headers ?? {}),
        ...(init.headers ?? {}),
      },
      body: this.prepareBody(method, init.body),
    };

    return this.fetcher(url.toString(), requestInit) as Promise<
      APIResponse<P, M>
    >;`,
      },
      {
        name: "get",
        scope: tsMorph.Scope.Public,
        typeParameters: ['T extends TypePaths<"get">'],
        parameters: [
          { name: "path", type: "T" },
          {
            name: "payload",
            type: 'ApiPayload<T, "get">',
            hasQuestionToken: true,
          },
        ],
        returnType: 'Promise<APIResponse<T, "get">>',
        statements: 'return this.request("get", path, payload);',
      },
      {
        name: "post",
        scope: tsMorph.Scope.Public,
        typeParameters: ['T extends TypePaths<"post">'],
        parameters: [
          { name: "path", type: "T" },
          {
            name: "payload",
            type: 'ApiPayload<T, "post">',
            hasQuestionToken: true,
          },
        ],
        returnType: 'Promise<APIResponse<T, "post">>',
        statements: 'return this.request("post", path, payload);',
      },
      {
        name: "put",
        scope: tsMorph.Scope.Public,
        typeParameters: ['T extends TypePaths<"put">'],
        parameters: [
          { name: "path", type: "T" },
          {
            name: "payload",
            type: 'ApiPayload<T, "put">',
            hasQuestionToken: true,
          },
        ],
        returnType: 'Promise<APIResponse<T, "put">>',
        statements: 'return this.request("put", path, payload);',
      },
      {
        name: "delete",
        scope: tsMorph.Scope.Public,
        typeParameters: ['T extends TypePaths<"delete">'],
        parameters: [
          { name: "path", type: "T" },
          {
            name: "payload",
            type: 'ApiPayload<T, "delete">',
            hasQuestionToken: true,
          },
        ],
        returnType: 'Promise<APIResponse<T, "delete">>',
        statements: 'return this.request("delete", path, payload);',
      },
      {
        name: "patch",
        scope: tsMorph.Scope.Public,
        typeParameters: ['T extends TypePaths<"patch">'],
        parameters: [
          { name: "path", type: "T" },
          {
            name: "payload",
            type: 'ApiPayload<T, "patch">',
            hasQuestionToken: true,
          },
        ],
        returnType: 'Promise<APIResponse<T, "patch">>',
        statements: 'return this.request("patch", path, payload);',
      },
      {
        name: "buildPathUrl",
        scope: tsMorph.Scope.Private,
        parameters: [
          { name: "basePath", type: "string" },
          { name: "pathParams", type: "unknown", hasQuestionToken: true },
        ],
        returnType: "string",
        statements: `let pathname = basePath;
    if (pathParams != null) {
      const params = pathParams as Record<string, unknown>;
      pathname = decodeURIComponent(pathname).replace(/{(w+)}/g, (_, key) =>
        encodeURIComponent(String(params[key])),
      );
    }
    return pathname;`,
      },
      {
        name: "prepareBody",
        scope: tsMorph.Scope.Private,
        parameters: [
          { name: "method", type: "RestMethod" },
          { name: "body", type: "unknown", hasQuestionToken: true },
        ],
        returnType: "string | undefined",
        statements: `if (body && ["post", "put", "patch"].includes(method)) {
      return JSON.stringify(body);
    }
    return undefined;`,
      },
      {
        name: "appendQueryParams",
        scope: tsMorph.Scope.Private,
        parameters: [
          { name: "url", type: "URL" },
          { name: "queryParams", type: "unknown", hasQuestionToken: true },
        ],
        returnType: "void",
        statements: `if (queryParams != null) {
      const params = queryParams as Record<string, unknown>;
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      }
    }`,
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
