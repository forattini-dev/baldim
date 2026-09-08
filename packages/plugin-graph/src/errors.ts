import { StorageError } from '@baldin/core';

export interface GraphErrorContext {
  code?: string;
  statusCode?: number;
  retriable?: boolean;
  vertexId?: string;
  edgeId?: string;
  fromVertex?: string;
  toVertex?: string;
  [key: string]: unknown;
}

export class GraphError extends StorageError {
  context: GraphErrorContext;

  constructor(message: string, context: GraphErrorContext = {}) {
    const normalized = {
      ...context,
      code: context.code || 'GRAPH_ERROR',
      statusCode: context.statusCode || 500,
      retriable: context.retriable ?? false,
      operation: context.operation || 'graph',
    };
    super(message, normalized);
    this.context = normalized;
  }
}

export class GraphConfigurationError extends GraphError {
  constructor(message: string, context: GraphErrorContext = {}) {
    super(message, { ...context, code: 'GRAPH_CONFIGURATION_ERROR', statusCode: 400 });
    this.name = 'GraphConfigurationError';
  }
}

export class VertexNotFoundError extends GraphError {
  constructor(vertexId: string, context: GraphErrorContext = {}) {
    super(`Vertex not found: ${vertexId}`, {
      ...context,
      code: 'VERTEX_NOT_FOUND',
      statusCode: 404,
      vertexId
    });
    this.name = 'VertexNotFoundError';
  }
}

export class EdgeNotFoundError extends GraphError {
  constructor(edgeId: string, context: GraphErrorContext = {}) {
    super(`Edge not found: ${edgeId}`, {
      ...context,
      code: 'EDGE_NOT_FOUND',
      statusCode: 404,
      edgeId
    });
    this.name = 'EdgeNotFoundError';
  }
}

export class PathNotFoundError extends GraphError {
  constructor(fromVertex: string, toVertex: string, context: GraphErrorContext = {}) {
    super(`No path found from ${fromVertex} to ${toVertex}`, {
      ...context,
      code: 'PATH_NOT_FOUND',
      statusCode: 404,
      fromVertex,
      toVertex
    });
    this.name = 'PathNotFoundError';
  }
}

export class CycleDetectedError extends GraphError {
  constructor(vertexId: string, context: GraphErrorContext = {}) {
    super(`Cycle detected at vertex: ${vertexId}`, {
      ...context,
      code: 'CYCLE_DETECTED',
      statusCode: 400,
      vertexId
    });
    this.name = 'CycleDetectedError';
  }
}

export class InvalidEdgeError extends GraphError {
  constructor(message: string, context: GraphErrorContext = {}) {
    super(message, { ...context, code: 'INVALID_EDGE', statusCode: 400 });
    this.name = 'InvalidEdgeError';
  }
}
