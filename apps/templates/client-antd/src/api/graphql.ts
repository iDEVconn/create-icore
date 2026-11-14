import { Kind, print, type DocumentNode, type OperationDefinitionNode } from 'graphql';
import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { ApiError } from '@idevconn/api-client';
import { api } from '../main';

export interface GraphqlError {
  message: string;
  extensions?: { code?: string };
}

interface GraphqlResponse<TData> {
  data?: TData | null;
  errors?: GraphqlError[];
}

function operationName(document: DocumentNode): string | undefined {
  const op = document.definitions.find(
    (def): def is OperationDefinitionNode => def.kind === Kind.OPERATION_DEFINITION,
  );
  return op?.name?.value;
}

/**
 * Run one GraphQL operation against the gateway's `/graphql` endpoint through
 * the shared `api` client, so token refresh, CSRF, credentials and the
 * `onError`/`onUnauthorized` hooks behave exactly like the REST calls.
 *
 * HTTP-level failures (401/403/429 from the gateway) already surface as
 * `ApiError` from `api`. A 200 response whose body carries `errors[]` is
 * turned into an `ApiError` too (status 200, body = the errors), so callers
 * and TanStack Query see one error type for both transports.
 */
export async function request<TData, TVars extends Record<string, unknown>>(
  document: TypedDocumentNode<TData, TVars>,
  variables?: TVars,
): Promise<TData> {
  const response = await api<GraphqlResponse<TData>>('/graphql', {
    method: 'POST',
    body: JSON.stringify({
      query: print(document),
      variables,
      operationName: operationName(document),
    }),
  });
  if (response.errors && response.errors.length > 0) {
    throw new ApiError(
      200,
      response.errors,
      response.errors.map((error) => error.message).join('; '),
    );
  }
  if (response.data === undefined || response.data === null) {
    throw new ApiError(200, response, 'graphql_empty_response');
  }
  return response.data;
}
