import pino, { Logger as PinoLogger, LoggerOptions as PinoLoggerOptions, TransportSingleOptions, DestinationStream } from 'pino';
import { createRedactRules } from './logger-redact.js';
import { getBaldinEnvironment } from './environment.js';

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent';
export type LogFormat = 'json' | 'pretty';

export interface LoggerOptions {
  level?: LogLevel;
  name?: string;
  format?: LogFormat;
  transport?: TransportSingleOptions;
  bindings?: Record<string, unknown>;
  redactPatterns?: RegExp[];
}

export interface BaldinLogger extends PinoLogger {}
/** @deprecated Use BaldinLogger. */
export type S3DBLogger = BaldinLogger;

export type Logger = BaldinLogger;

let globalLogger: BaldinLogger | null = null;
let sharedPrettyTransport: ReturnType<typeof pino.transport> | null = null;
let sharedDestination: DestinationStream | null = null;
const namedLoggers: Map<string, BaldinLogger> = new Map();

function serializeError(err: unknown): Record<string, unknown> | unknown {
  if (!err || typeof err !== 'object') {
    return err;
  }

  const error = err as Error & { toJSON?: () => Record<string, unknown>; code?: string };

  if (typeof error.toJSON === 'function') {
    return error.toJSON();
  }

    return {
      ...error,
      message: error.message,
      stack: error.stack,
    };
}

function createPrettyTransport(): TransportSingleOptions {
  return {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss.l',
      ignore: 'pid,hostname',
      singleLine: false
    }
  };
}

function getSharedPrettyTransport(): ReturnType<typeof pino.transport> {
  if (!sharedPrettyTransport) {
    sharedPrettyTransport = pino.transport(createPrettyTransport());
  }
  return sharedPrettyTransport;
}

function getSharedDestination(format?: LogFormat): DestinationStream | undefined {
  const envFormat = getBaldinEnvironment('LOG_FORMAT')?.toLowerCase();
  const effectiveFormat = format ?? (envFormat === 'json' ? 'json' : 'pretty');

  if (effectiveFormat === 'json') {
    return undefined;
  }

  if (!sharedDestination) {
    sharedDestination = getSharedPrettyTransport();
  }
  return sharedDestination;
}

function createDefaultTransport(): TransportSingleOptions | undefined {
  const envFormat = getBaldinEnvironment('LOG_FORMAT')?.toLowerCase();

  if (envFormat === 'json') {
    return undefined;
  }

  return createPrettyTransport();
}

export function createLogger(options: LoggerOptions = {}): BaldinLogger {
  const {
    level = 'info',
    name,
    format,
    transport,
    bindings = {},
    redactPatterns = []
  } = options;

  const redactRules = createRedactRules(redactPatterns);
  const normalizedBindings = bindings && typeof bindings === 'object' ? bindings : {};

  const useSharedDestination = !transport && format !== 'json';
  const destination = useSharedDestination ? getSharedDestination(format) : undefined;

  const config: PinoLoggerOptions = {
    level,
    redact: redactRules,
    serializers: {
      err: serializeError,
      error: serializeError
    }
  };

  if (transport) {
    config.transport = transport;
  } else if (format === 'json') {
    // no transport, write plain JSON to stdout
  } else if (!destination) {
    config.transport = createDefaultTransport();
  }

  let logger: BaldinLogger;
  if (destination) {
    logger = pino({ ...config, name }, destination) as BaldinLogger;
  } else {
    logger = pino({ ...config, name }) as BaldinLogger;
  }

  const baseBindings = name ? { ...normalizedBindings, name } : normalizedBindings;
  if (baseBindings && Object.keys(baseBindings).length > 0) {
    logger = logger.child(baseBindings) as BaldinLogger;
  }

  return logger;
}

export function getLogger(name: string, options: Omit<LoggerOptions, 'name'> = {}): BaldinLogger {
  const cached = namedLoggers.get(name);
  if (cached) {
    return cached;
  }

  const logger = createLogger({ ...options, name });
  namedLoggers.set(name, logger);
  return logger;
}

export function getGlobalLogger(options: LoggerOptions = {}): BaldinLogger {
  if (!globalLogger) {
    globalLogger = createLogger(options);
  }
  return globalLogger;
}

export function resetGlobalLogger(): void {
  globalLogger = null;
  namedLoggers.clear();
  sharedPrettyTransport = null;
  sharedDestination = null;
}

export function getLoggerOptionsFromEnv(configOptions: LoggerOptions = {}): LoggerOptions {
  const options: LoggerOptions = { ...configOptions };

  const level = getBaldinEnvironment('LOG_LEVEL');
  if (level) options.level = level as LogLevel;

  const configuredFormat = getBaldinEnvironment('LOG_FORMAT');
  const pretty = getBaldinEnvironment('LOG_PRETTY');
  if (configuredFormat) {
    const format = configuredFormat.toLowerCase();
    if (format === 'json' || format === 'pretty') {
      options.format = format as LogFormat;
    }
  } else if (pretty === 'false') {
    options.format = 'json';
  } else if (pretty === 'true') {
    options.format = 'pretty';
  }

  return options;
}

export function exampleUsage(): void {
  const logger = createLogger({ level: 'debug' });
  logger.info('Application started');

  const jsonLogger = createLogger({ level: 'info', format: 'json' });
  jsonLogger.info({ user: 'john' }, 'User logged in');

  const prettyLogger = createLogger({ level: 'debug', format: 'pretty' });
  prettyLogger.debug({ query: 'SELECT *' }, 'Database query');

  const resourceLogger = logger.child({ resource: 'users' });
  resourceLogger.debug({ userId: 123 }, 'user fetched');

  const globalLog = getGlobalLogger({ level: 'info' });
  globalLog.warn('Warning message');

  const err = new Error('Something went wrong') as Error & { toJSON: () => Record<string, unknown> };
  err.toJSON = () => ({ message: err.message, custom: 'data' });
  logger.error({ err }, 'Error occurred');
}

export default createLogger;
